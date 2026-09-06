package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Server-side model versioning (spec: save/versioning + AI safety). Every
// changed model save records a snapshot, pruned to a per-project cap; the
// builder's History panel lists and restores them through the normal
// validated save path. Ownership rides the project, exactly like assets.

// MaxVersionsPerProject caps how many snapshots a project keeps. Pruning is
// part of every insert, so the table cannot grow unbounded through autosave.
const MaxVersionsPerProject = 20

// Version is one stored model snapshot (metadata; the document is fetched
// explicitly so listings stay small).
type Version struct {
	ID        string
	ProjectID string
	Origin    string // "edit" | "ai": how the snapshotted state came to be
	Size      int
	CreatedAt time.Time
}

// InsertVersion stores one model snapshot labelled with its origin.
// Snapshot failures must never break the save path: callers log them and
// continue.
func (s *Store) InsertVersion(ctx context.Context, projectID string, model []byte, origin string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO project_versions (project_id, model, size, origin)
		VALUES ($1, $2, $3, $4)`, projectID, model, len(model), origin)
	if err != nil {
		return fmt.Errorf("project: insert version: %w", err)
	}
	return nil
}

// VersionModelEquals reports whether the project's newest snapshot is
// semantically identical to candidate. The comparison happens as jsonb in
// Postgres: a stored jsonb is re-serialized with the server's own key
// order and whitespace, so byte-comparing it in Go against freshly
// marshaled JSON would never match.
func (s *Store) VersionModelEquals(ctx context.Context, projectID string, candidate []byte) (bool, error) {
	var equal bool
	err := s.db.QueryRowContext(ctx, `
		SELECT model = $2::jsonb FROM project_versions
		WHERE project_id = $1
		ORDER BY created_at DESC, id DESC LIMIT 1`, projectID, candidate).Scan(&equal)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("project: version equals: %w", err)
	}
	return equal, nil
}

// PruneVersions keeps only the newest keep snapshots of one project.
func (s *Store) PruneVersions(ctx context.Context, projectID string, keep int) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM project_versions
		WHERE project_id = $1 AND id NOT IN (
			SELECT id FROM project_versions WHERE project_id = $1
			ORDER BY created_at DESC, id DESC LIMIT $2
		)`, projectID, keep)
	if err != nil {
		return fmt.Errorf("project: prune versions: %w", err)
	}
	return nil
}

// ListVersions returns one project's snapshot metadata, newest first.
func (s *Store) ListVersions(ctx context.Context, projectID string) ([]Version, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, origin, size, created_at FROM project_versions
		WHERE project_id = $1
		ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, fmt.Errorf("project: list versions: %w", err)
	}
	defer rows.Close()

	versions := []Version{}
	for rows.Next() {
		var v Version
		if err := rows.Scan(&v.ID, &v.ProjectID, &v.Origin, &v.Size, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("project: list versions scan: %w", err)
		}
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("project: list versions rows: %w", err)
	}
	return versions, nil
}

// FindVersionForOwner fetches one snapshot of an owned project with its
// document. A missing row, a foreign project, and a malformed ID all
// collapse to ErrNotFound.
func (s *Store) FindVersionForOwner(ctx context.Context, ownerID, projectID, versionID string) (*Version, []byte, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT v.id, v.project_id, v.origin, v.size, v.created_at, v.model
		FROM project_versions v JOIN projects p ON p.id = v.project_id
		WHERE v.id = $1 AND v.project_id = $2 AND p.owner_id = $3`, versionID, projectID, ownerID)

	var v Version
	var model []byte
	err := row.Scan(&v.ID, &v.ProjectID, &v.Origin, &v.Size, &v.CreatedAt, &model)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("project: find version: %w", err)
	}
	return &v, model, nil
}

// ---- service -----------------------------------------------------------------

// recordVersion snapshots a just-saved model. Consecutive identical models
// (autosave re-fires) are skipped, and the per-project cap is enforced —
// a failure is logged, never propagated: fewer restore points must not
// block saving.
func (s *Service) recordVersion(ctx context.Context, projectID string, modelJSON []byte, origin string) {
	duplicate, err := s.store.VersionModelEquals(ctx, projectID, modelJSON)
	if err != nil {
		s.logger.Warn("project version dedupe check failed", "project_id", projectID, "error", err.Error())
		return
	}
	if duplicate {
		return
	}
	if err := s.store.InsertVersion(ctx, projectID, modelJSON, origin); err != nil {
		s.logger.Warn("project version insert failed", "project_id", projectID, "error", err.Error())
		return
	}
	if err := s.store.PruneVersions(ctx, projectID, MaxVersionsPerProject); err != nil {
		s.logger.Warn("project version prune failed", "project_id", projectID, "error", err.Error())
	}
}

// ListVersions returns the version history of an owned project.
func (s *Service) ListVersions(ctx context.Context, ownerID, projectID string) ([]Version, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.store.FindForOwner(ctx, ownerID, projectID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: list versions: find: %w", err)
	}
	return s.store.ListVersions(ctx, projectID)
}

// GetVersion returns one owned snapshot with its model document.
func (s *Service) GetVersion(ctx context.Context, ownerID, projectID, versionID string) (*Version, []byte, error) {
	if err := validateID(projectID); err != nil {
		return nil, nil, err
	}
	// A malformed version ID is answered like a missing one — 404 without
	// touching the database (a raw cast error would surface as a 500).
	if err := validateID(versionID); err != nil {
		return nil, nil, notFound()
	}
	// The project check comes first so a foreign project and a foreign
	// version inside it are indistinguishable (both 404, existence never
	// leaked).
	if _, err := s.store.FindForOwner(ctx, ownerID, projectID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil, notFound()
		}
		return nil, nil, fmt.Errorf("project: get version: find: %w", err)
	}
	version, model, err := s.store.FindVersionForOwner(ctx, ownerID, projectID, versionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil, notFound()
		}
		return nil, nil, fmt.Errorf("project: get version: %w", err)
	}
	return version, model, nil
}

// ---- handler -----------------------------------------------------------------

// VersionWire is the list shape: metadata only, no model document.
type VersionWire struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Origin    string    `json:"origin"`
	Size      int       `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

func versionWire(v *Version) VersionWire {
	return VersionWire{ID: v.ID, ProjectID: v.ProjectID, Origin: v.Origin, Size: v.Size, CreatedAt: v.CreatedAt}
}

// ListVersions handles GET /api/projects/{id}/versions.
func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	versions, err := h.service.ListVersions(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	wires := make([]VersionWire, len(versions))
	for i := range versions {
		wires[i] = versionWire(&versions[i])
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"versions": wires})
}

// GetVersion handles GET /api/projects/{id}/versions/{versionId}.
func (h *Handler) GetVersion(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	version, model, err := h.service.GetVersion(r.Context(), current.ID, r.PathValue("id"), r.PathValue("versionId"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"version": map[string]any{
			"id": version.ID, "projectId": version.ProjectID,
			"origin": version.Origin,
			"size":   version.Size, "createdAt": version.CreatedAt,
			"model": json.RawMessage(model),
		},
	})
}
