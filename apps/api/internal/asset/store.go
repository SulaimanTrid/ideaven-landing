// Package asset stores per-project media. The canonical model references an
// asset by ID ("asset:<id>" in component props); the bytes live here, never
// inside the model document. Ownership is inherited from the owning project:
// every query joins projects and matches the session-derived owner, so an
// asset ID alone never grants access.
package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Asset is a stored media row (metadata only; bytes are fetched explicitly
// so listings stay small).
type Asset struct {
	ID        string
	ProjectID string
	Kind      string
	Name      string
	MIME      string
	Size      int
	SHA256    string
	CreatedAt time.Time
}

// NewAsset is the input for storing an asset with its bytes.
type NewAsset struct {
	ProjectID string
	Kind      string
	Name      string
	MIME      string
	SHA256    string
	Data      []byte
}

// Store is the PostgreSQL-backed asset repository.
type Store struct {
	db *sql.DB
}

// NewStore builds a Store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ErrNotFound reports that no matching (and owned) asset exists.
var ErrNotFound = errors.New("asset: not found")

const columns = `id, project_id, kind, name, mime, size, sha256, created_at`

func scanAsset(scanner interface{ Scan(...any) error }) (*Asset, error) {
	var a Asset
	err := scanner.Scan(&a.ID, &a.ProjectID, &a.Kind, &a.Name, &a.MIME, &a.Size, &a.SHA256, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Insert stores an asset's bytes and metadata in one row.
func (s *Store) Insert(ctx context.Context, input NewAsset) (*Asset, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO assets (project_id, kind, name, mime, size, sha256, data)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+columns,
		input.ProjectID, input.Kind, input.Name, input.MIME, len(input.Data), input.SHA256, input.Data)

	created, err := scanAsset(row)
	if err != nil {
		return nil, fmt.Errorf("asset: insert: %w", err)
	}
	return created, nil
}

// ListByProject returns the metadata of one project's assets, newest first.
func (s *Store) ListByProject(ctx context.Context, projectID string) ([]Asset, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+columns+` FROM assets WHERE project_id = $1
		ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, fmt.Errorf("asset: list: %w", err)
	}
	defer rows.Close()

	assets := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, fmt.Errorf("asset: list scan: %w", err)
		}
		assets = append(assets, *a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("asset: list rows: %w", err)
	}
	return assets, nil
}

// findForOwner is the shared owner-scoped lookup: a missing row, a foreign
// project, and a malformed ID all collapse to ErrNotFound. Columns are
// qualified because assets and projects share column names (id, name,
// created_at) and the join would make bare references ambiguous.
func (s *Store) findForOwner(ctx context.Context, ownerID, id string, withData bool) (*Asset, []byte, error) {
	query := `SELECT a.id, a.project_id, a.kind, a.name, a.mime, a.size, a.sha256, a.created_at, a.data
		FROM assets a JOIN projects p ON p.id = a.project_id
		WHERE a.id = $1 AND p.owner_id = $2`
	if !withData {
		query = `SELECT a.id, a.project_id, a.kind, a.name, a.mime, a.size, a.sha256, a.created_at, NULL::bytea
			FROM assets a JOIN projects p ON p.id = a.project_id
			WHERE a.id = $1 AND p.owner_id = $2`
	}
	row := s.db.QueryRowContext(ctx, query, id, ownerID)

	var a Asset
	var raw []byte
	err := row.Scan(&a.ID, &a.ProjectID, &a.Kind, &a.Name, &a.MIME, &a.Size, &a.SHA256, &a.CreatedAt, &raw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("asset: find: %w", err)
	}
	return &a, raw, nil
}

// FindForOwner fetches one owned asset's metadata.
func (s *Store) FindForOwner(ctx context.Context, ownerID, id string) (*Asset, error) {
	a, _, err := s.findForOwner(ctx, ownerID, id, false)
	return a, err
}

// FindDataForOwner fetches one owned asset's metadata and bytes.
func (s *Store) FindDataForOwner(ctx context.Context, ownerID, id string) (*Asset, []byte, error) {
	return s.findForOwner(ctx, ownerID, id, true)
}

// FindPublicData fetches one asset's metadata and bytes when — and only
// when — its project is currently published. This is what makes stored
// images render on the public page of a published project without any
// session; unpublishing cuts the access off immediately.
func (s *Store) FindPublicData(ctx context.Context, id string) (*Asset, []byte, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT a.id, a.project_id, a.kind, a.name, a.mime, a.size, a.sha256, a.created_at, a.data
		FROM assets a JOIN projects p ON p.id = a.project_id
		WHERE a.id = $1 AND p.status = 'published'`, id)
	var a Asset
	var raw []byte
	err := row.Scan(&a.ID, &a.ProjectID, &a.Kind, &a.Name, &a.MIME, &a.Size, &a.SHA256, &a.CreatedAt, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("asset: find public: %w", err)
	}
	return &a, raw, nil
}

// Delete removes an owned asset.
func (s *Store) Delete(ctx context.Context, ownerID, id string) error {
	tag, err := s.db.ExecContext(ctx, `
		DELETE FROM assets a USING projects p
		WHERE p.id = a.project_id AND a.id = $1 AND p.owner_id = $2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("asset: delete: %w", err)
	}
	affected, err := tag.RowsAffected()
	if err != nil {
		return fmt.Errorf("asset: delete: rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateHash persists the content hash for an asset (lazy backfill for rows
// created before the column existed).
func (s *Store) UpdateHash(ctx context.Context, id, hash string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE assets SET sha256 = $1 WHERE id = $2`, hash, id)
	if err != nil {
		return fmt.Errorf("asset: update hash: %w", err)
	}
	return nil
}

// CountForProject returns how many assets a project currently stores.
func (s *Store) CountForProject(ctx context.Context, projectID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE project_id = $1`, projectID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("asset: count: %w", err)
	}
	return count, nil
}
