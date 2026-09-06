package project

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Publishing (roadmap 19): a publication is a server-side snapshot of the
// project model. The public page renders the snapshot, so editing after
// publishing never changes the live page until the owner republishes.
// Ownership rides the project row exactly like assets and versions.

// Publication is the publicly served shape: project identity, the author's
// public identity, and the snapshotted model document.
type Publication struct {
	Slug        string
	Name        string
	Description string
	Type        string
	Author      string // username
	AuthorName  string // display name (falls back to username client-side)
	Model       []byte
	PublishedAt time.Time
}

// PublishProject snapshots the owner's current model into publications and
// marks the project published + public. Republishing replaces the snapshot.
func (s *Store) PublishProject(ctx context.Context, ownerID, projectID string) (*Project, error) {
	found, err := s.FindForOwner(ctx, ownerID, projectID)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("project: publish: begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO publications (project_id, model, published_at)
		VALUES ($1, $2, now())
		ON CONFLICT (project_id) DO UPDATE
		SET model = EXCLUDED.model, published_at = now()`,
		found.ID, found.Model); err != nil {
		return nil, fmt.Errorf("project: publish: snapshot: %w", err)
	}

	updated, err := tx.ExecContext(ctx, `
		UPDATE projects
		SET status = $3, visibility = $4, updated_at = now()
		WHERE id = $1 AND owner_id = $2`,
		found.ID, ownerID, StatusPublished, VisibilityPublic)
	if err != nil {
		return nil, fmt.Errorf("project: publish: mark: %w", err)
	}
	if rows, _ := updated.RowsAffected(); rows == 0 {
		return nil, ErrNotFound
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("project: publish: commit: %w", err)
	}
	return s.FindForOwner(ctx, ownerID, projectID)
}

// UnpublishProject removes the snapshot and returns the project to draft.
// Unpublishing a project that is not published is a no-op success — the
// end state is what the caller asked for.
func (s *Store) UnpublishProject(ctx context.Context, ownerID, projectID string) (*Project, error) {
	found, err := s.FindForOwner(ctx, ownerID, projectID)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("project: unpublish: begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM publications WHERE project_id = $1`, found.ID); err != nil {
		return nil, fmt.Errorf("project: unpublish: snapshot: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE projects SET status = $3, updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND status = $4`,
		found.ID, ownerID, StatusDraft, StatusPublished); err != nil {
		return nil, fmt.Errorf("project: unpublish: mark: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("project: unpublish: commit: %w", err)
	}
	return s.FindForOwner(ctx, ownerID, projectID)
}

// PublicationBySlug serves one published project anonymously. Only rows
// whose status is still 'published' resolve; unpublishing kills the public
// page immediately.
func (s *Store) PublicationBySlug(ctx context.Context, slug string) (*Publication, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT p.slug, p.name, p.description, p.type, u.username, u.display_name, pub.model, pub.published_at
		FROM projects p
		JOIN publications pub ON pub.project_id = p.id
		JOIN users u ON u.id = p.owner_id
		WHERE p.slug = $1 AND p.status = $2`, slug, StatusPublished)
	var pub Publication
	err := row.Scan(&pub.Slug, &pub.Name, &pub.Description, &pub.Type, &pub.Author, &pub.AuthorName, &pub.Model, &pub.PublishedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("project: publication by slug: %w", err)
	}
	return &pub, nil
}

// RecentPublications lists the newest published projects (gallery feed).
// Metadata only — the model document is fetched per project page.
func (s *Store) RecentPublications(ctx context.Context, limit int) ([]PublicationSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.slug, p.name, p.description, p.type, u.username, u.display_name, pub.published_at
		FROM projects p
		JOIN publications pub ON pub.project_id = p.id
		JOIN users u ON u.id = p.owner_id
		WHERE p.status = $1
		ORDER BY pub.published_at DESC
		LIMIT $2`, StatusPublished, limit)
	if err != nil {
		return nil, fmt.Errorf("project: recent publications: %w", err)
	}
	defer rows.Close()

	out := []PublicationSummary{}
	for rows.Next() {
		var s PublicationSummary
		if err := rows.Scan(&s.Slug, &s.Name, &s.Description, &s.Type, &s.Author, &s.AuthorName, &s.PublishedAt); err != nil {
			return nil, fmt.Errorf("project: recent publications: scan: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// PublicationSummary is the list shape of a published project.
type PublicationSummary struct {
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Type        string    `json:"type"`
	Author      string    `json:"author"`
	AuthorName  string    `json:"authorName,omitempty"`
	PublishedAt time.Time `json:"publishedAt"`
}

// PublicationsByCreator lists one creator's published projects, newest
// first. Creators are identified by their public username.
func (s *Store) PublicationsByCreator(ctx context.Context, username string, limit int) ([]PublicationSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.slug, p.name, p.description, p.type, u.username, u.display_name, pub.published_at
		FROM projects p
		JOIN publications pub ON pub.project_id = p.id
		JOIN users u ON u.id = p.owner_id
		WHERE u.username = $1 AND p.status = $2
		ORDER BY pub.published_at DESC
		LIMIT $3`, username, StatusPublished, limit)
	if err != nil {
		return nil, fmt.Errorf("project: publications by creator: %w", err)
	}
	defer rows.Close()

	out := []PublicationSummary{}
	for rows.Next() {
		var s PublicationSummary
		if err := rows.Scan(&s.Slug, &s.Name, &s.Description, &s.Type, &s.Author, &s.AuthorName, &s.PublishedAt); err != nil {
			return nil, fmt.Errorf("project: publications by creator: scan: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Creator is the public identity of a publisher.
type Creator struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

// CreatorByName resolves a public creator; unknown usernames answer
// ErrNotFound like everything else public.
func (s *Store) CreatorByName(ctx context.Context, username string) (*Creator, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT username, display_name FROM users WHERE username = $1`, username)
	var c Creator
	err := row.Scan(&c.Username, &c.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("project: creator by name: %w", err)
	}
	return &c, nil
}

// PlatformStats is the honest public counters set (roadmap 28: analytics —
// derived from real rows, nothing invented).
type PlatformStats struct {
	Creators     int `json:"creators"`
	Projects     int `json:"projects"`
	Publications int `json:"publications"`
}

// PublicStats counts real rows: users who exist, projects ever created
// (non-deleted), and live publications.
func (s *Store) PublicStats(ctx context.Context) (PlatformStats, error) {
	var stats PlatformStats
	err := s.db.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM users),
			(SELECT count(*) FROM projects),
			(SELECT count(*) FROM publications pub
			 JOIN projects p ON p.id = pub.project_id WHERE p.status = $1)`,
		StatusPublished).Scan(&stats.Creators, &stats.Projects, &stats.Publications)
	if err != nil {
		return stats, fmt.Errorf("project: public stats: %w", err)
	}
	return stats, nil
}

// ---- service ----------------------------------------------------------------------

// Remix copies a published project's snapshot into the caller's account as
// a fresh draft — the community loop (roadmap 33–35) in its smallest honest
// form: the copy records where it came from.
func (s *Service) Remix(ctx context.Context, ownerID, slug string) (*Project, error) {
	pub, err := s.PublishedBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}

	model := Model{}
	if err := json.Unmarshal(pub.Model, &model); err != nil {
		return nil, fmt.Errorf("project: remix: decode snapshot: %w", err)
	}
	if err := ValidateModel(&model); err != nil {
		return nil, fmt.Errorf("project: remix: snapshot model: %w", err)
	}
	modelJSON, err := marshalModel(&model)
	if err != nil {
		return nil, err
	}

	name := pub.Name
	if len(name) > NameMaxLen-8 {
		name = name[:NameMaxLen-8]
	}
	description := fmt.Sprintf("Remix of @%s/%s", pub.Author, pub.Slug)
	if pub.Description != "" && len(pub.Description) <= DescriptionMaxLen-40 {
		description += " — " + pub.Description
	}
	if len(description) > DescriptionMaxLen {
		description = description[:DescriptionMaxLen]
	}

	created, err := s.store.Create(ctx, NewProject{
		OwnerID:     ownerID,
		Name:        name + " (remix)",
		Slug:        newSlugFor(name),
		Description: description,
		Type:        model.Type,
		Model:       modelJSON,
	})
	if err != nil {
		return nil, fmt.Errorf("project: remix: create: %w", err)
	}
	return created, nil
}

// newSlugFor generates a slug for a remix; the generator's random suffix
// makes collisions theoretical, the fallback keeps the copy path total.
func newSlugFor(name string) string {
	slug, err := newSlug(name)
	if err != nil {
		return "remix-" + randomSuffix()
	}
	return slug
}

// randomSuffix produces a short random hex suffix (slug fallback).
func randomSuffix() string {
	buf := make([]byte, 3)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

// Publish snapshots the owner's current model and marks the project public.
func (s *Service) Publish(ctx context.Context, ownerID, id string) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	published, err := s.store.PublishProject(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: publish: %w", err)
	}
	return published, nil
}

// Unpublish removes the public snapshot and returns the project to draft.
func (s *Service) Unpublish(ctx context.Context, ownerID, id string) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	updated, err := s.store.UnpublishProject(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: unpublish: %w", err)
	}
	return updated, nil
}

// PublishedBySlug serves one published project anonymously. Malformed slugs
// and missing publications answer identically — 404, nothing leaked.
func (s *Service) PublishedBySlug(ctx context.Context, slug string) (*Publication, error) {
	if slug == "" || len(slug) > 100 {
		return nil, notFound()
	}
	pub, err := s.store.PublicationBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: published by slug: %w", err)
	}
	return pub, nil
}

// RecentPublications lists the newest published projects for the gallery.
func (s *Service) RecentPublications(ctx context.Context, limit int) ([]PublicationSummary, error) {
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}
	items, err := s.store.RecentPublications(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("project: recent publications: %w", err)
	}
	return items, nil
}

// ---- handlers ----------------------------------------------------------------------

// Publish handles POST /api/projects/{id}/publish.
func (h *Handler) Publish(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	published, err := h.service.Publish(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"project": wire(published, false),
		"publicPath": "/p/" + published.Slug,
	})
}

// Unpublish handles POST /api/projects/{id}/unpublish.
func (h *Handler) Unpublish(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	updated, err := h.service.Unpublish(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ProjectWire{"project": wire(updated, false)})
}

// PublicProject handles GET /api/public/projects/{slug} — anonymous, the
// snapshot document only.
func (h *Handler) PublicProject(w http.ResponseWriter, r *http.Request) {
	pub, err := h.service.PublishedBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"publication": map[string]any{
			"slug":        pub.Slug,
			"name":        pub.Name,
			"description": pub.Description,
			"type":        pub.Type,
			"author":      pub.Author,
			"authorName":  pub.AuthorName,
			"model":       jsonRaw(pub.Model),
			"publishedAt": pub.PublishedAt,
		},
	})
}

// PublicList handles GET /api/public/projects — the published gallery feed.
func (h *Handler) PublicList(w http.ResponseWriter, r *http.Request) {
	limit := parseLimit(r.URL.Query().Get("limit"))
	items, err := h.service.RecentPublications(r.Context(), limit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"publications": items})
}

// PublicCreator handles GET /api/public/creators/{username}.
func (h *Handler) PublicCreator(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	if username == "" || len(username) > 60 {
		httpx.WriteError(w, notFound())
		return
	}
	creator, err := h.service.store.CreatorByName(r.Context(), username)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteError(w, notFound())
			return
		}
		httpx.WriteError(w, err)
		return
	}
	publications, err := h.service.store.PublicationsByCreator(r.Context(), username, MaxListLimit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"creator":      creator,
		"publications": publications,
	})
}

// Remix handles POST /api/public/projects/{slug}/remix — session required;
// the snapshot becomes a fresh draft owned by the caller.
func (h *Handler) Remix(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	created, err := h.service.Remix(r.Context(), current.ID, r.PathValue("slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]ProjectWire{"project": wire(created, true)})
}

// PublicStats handles GET /api/public/stats.
func (h *Handler) PublicStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.service.store.PublicStats(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"stats": stats})
}

// ListTemplates handles GET /api/templates — the built-in starting points.
func (h *Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"templates": Templates()})
}

// jsonRaw keeps the stored (validated) model document verbatim.
func jsonRaw(data []byte) json.RawMessage { return json.RawMessage(data) }

// parseLimit reads a bounded ?limit=; anything odd falls back to the default.
func parseLimit(raw string) int {
	if raw == "" {
		return DefaultListLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return DefaultListLimit
	}
	if n > MaxListLimit {
		return MaxListLimit
	}
	return n
}
