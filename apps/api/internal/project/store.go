// Package project persists projects. Every query is owner-scoped: callers
// pass the session-derived owner ID and the SQL never matches a row the
// caller does not own.
package project

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Project is a stored project row. Model stays a raw JSON document; the
// service layer is responsible for decoding/encoding against the schema.
type Project struct {
	ID           string
	OwnerID      string
	Name         string
	Slug         string
	Description  string
	Type         string
	Status       string
	Visibility   string
	Thumbnail    string
	Model        []byte
	ModelVersion int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	LastOpenedAt *time.Time
}

// NewProject is the input for creating a project row.
type NewProject struct {
	OwnerID     string
	Name        string
	Slug        string
	Description string
	Type        string
	Model       []byte
}

// ListFilter narrows a library listing.
type ListFilter struct {
	OwnerID  string
	Query    string
	Statuses []string
	Sort     string // updated | created | name | opened
	Limit    int
	Offset   int
}

// Store is the PostgreSQL-backed project repository.
type Store struct {
	db *sql.DB
}

// NewStore builds a Store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ErrNotFound reports that no matching (and owned) project exists.
var ErrNotFound = errors.New("project: not found")

// ErrDuplicateSlug reports that the (owner, slug) pair is already taken.
var ErrDuplicateSlug = errors.New("project: slug already used")

const columns = `id, owner_id, name, slug, description, type, status, visibility,
	thumbnail, model, model_version, created_at, updated_at, last_opened_at`

func scanProject(scanner interface{ Scan(...any) error }) (*Project, error) {
	var p Project
	err := scanner.Scan(&p.ID, &p.OwnerID, &p.Name, &p.Slug, &p.Description, &p.Type,
		&p.Status, &p.Visibility, &p.Thumbnail, &p.Model, &p.ModelVersion,
		&p.CreatedAt, &p.UpdatedAt, &p.LastOpenedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// Create inserts a project with its initial model document.
func (s *Store) Create(ctx context.Context, input NewProject) (*Project, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO projects (owner_id, name, slug, description, type, model)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+columns,
		input.OwnerID, input.Name, input.Slug, input.Description, input.Type, input.Model)

	created, err := scanProject(row)
	if err != nil {
		if isUniqueViolation(err, "projects_owner_slug_key") {
			return nil, ErrDuplicateSlug
		}
		return nil, fmt.Errorf("project: create: %w", err)
	}
	return created, nil
}

// List returns one page of the owner's library with the total count.
func (s *Store) List(ctx context.Context, filter ListFilter) ([]Project, int, error) {
	where := `owner_id = $1`
	args := []any{filter.OwnerID}

	if filter.Query != "" {
		args = append(args, "%"+filter.Query+"%")
		where += fmt.Sprintf(` AND (name ILIKE $%d OR description ILIKE $%d)`, len(args), len(args))
	}
	args = append(args, filter.Statuses)
	where += fmt.Sprintf(` AND status = ANY($%d)`, len(args))

	order := map[string]string{
		"updated": "updated_at DESC",
		"created": "created_at DESC",
		"name":    "lower(name) ASC",
		"opened":  "last_opened_at DESC NULLS LAST, updated_at DESC",
	}[filter.Sort]
	if order == "" {
		order = "updated_at DESC"
	}

	var total int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM projects WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("project: list count: %w", err)
	}

	args = append(args, filter.Limit, filter.Offset)
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+columns+` FROM projects WHERE `+where+`
		ORDER BY `+order+`
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("project: list: %w", err)
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("project: list scan: %w", err)
		}
		projects = append(projects, *p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("project: list rows: %w", err)
	}
	return projects, total, nil
}

// FindForOwner fetches one project the owner owns; a missing row or a row
// owned by someone else both return ErrNotFound (existence is not leaked).
func (s *Store) FindForOwner(ctx context.Context, ownerID, id string) (*Project, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+columns+` FROM projects WHERE id = $1 AND owner_id = $2`, id, ownerID)
	found, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("project: find: %w", err)
	}
	return found, nil
}

// UpdateMeta rewrites the mutable metadata of one owned project. Nil fields
// are left unchanged; updated_at always moves.
func (s *Store) UpdateMeta(ctx context.Context, ownerID, id string, update MetaUpdate) (*Project, error) {
	sets := []string{"updated_at = now()"}
	args := []any{ownerID, id}

	assign := func(column string, value *string) {
		if value == nil {
			return
		}
		args = append(args, *value)
		sets = append(sets, fmt.Sprintf("%s = $%d", column, len(args)))
	}
	assign("name", update.Name)
	assign("description", update.Description)
	assign("status", update.Status)
	assign("visibility", update.Visibility)
	assign("thumbnail", update.Thumbnail)

	row := s.db.QueryRowContext(ctx, `
		UPDATE projects SET `+strings.Join(sets, ", ")+`
		WHERE id = $2 AND owner_id = $1
		RETURNING `+columns, args...)

	updated, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("project: update meta: %w", err)
	}
	return updated, nil
}

// MetaUpdate is the partial-edit payload for UpdateMeta.
type MetaUpdate struct {
	Name        *string
	Description *string
	Status      *string
	Visibility  *string
	Thumbnail   *string
}

// TouchOpened records that the owner just opened the project.
func (s *Store) TouchOpened(ctx context.Context, ownerID, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE projects SET last_opened_at = now() WHERE id = $1 AND owner_id = $2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("project: touch opened: %w", err)
	}
	return nil
}

// UpdateModel replaces the canonical model document of an owned project.
// Validation is the service layer's job; this only persists.
func (s *Store) UpdateModel(ctx context.Context, ownerID, id string, model []byte) (*Project, error) {
	row := s.db.QueryRowContext(ctx, `
		UPDATE projects SET model = $3, updated_at = now()
		WHERE id = $2 AND owner_id = $1
		RETURNING `+columns, ownerID, id, model)

	updated, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("project: update model: %w", err)
	}
	return updated, nil
}

// Delete removes an owned project; later project-scoped tables cascade.
func (s *Store) Delete(ctx context.Context, ownerID, id string) error {
	tag, err := s.db.ExecContext(ctx,
		`DELETE FROM projects WHERE id = $1 AND owner_id = $2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("project: delete: %w", err)
	}
	affected, err := tag.RowsAffected()
	if err != nil {
		return fmt.Errorf("project: delete: rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// isUniqueViolation reports whether err is a 23505 on the named index.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == constraint
}
