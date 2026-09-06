// Package extension persists authored IDEAVEN extensions (roadmap 2.0-B) and
// their immutable versions. The manifest is the closed, forward-compatible
// contract shared with the Studio, the block registry, and — later — the
// marketplace. Ownership is enforced exactly like projects: every query is
// owner-scoped, and existence is never leaked.
package extension

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Extension kinds and statuses.
const (
	KindComponent = "component"
	KindBlocks    = "blocks"
	KindMixed     = "mixed"

	StatusDraft     = "draft"
	StatusPublished = "published"
)

// ManifestFormat is the current manifest contract version.
const ManifestFormat = 1

// MaxLimits bound authored payloads.
const (
	NameMaxLen       = 60
	SummaryMaxLen    = 200
	DocsMaxLen       = 65536
	MaxListLimit     = 100
	DefaultListLimit = 50
	MaxManifestBytes = 512 << 10
)

var ErrNotFound = errors.New("extension: not found")

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`)
var versionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// PropSpec declares one configurable property of an extension component.
type PropSpec struct {
	Key      string `json:"key"`
	Type     string `json:"type"` // text | number | boolean | color | select
	Default  any    `json:"default,omitempty"`
	Required bool   `json:"required,omitempty"`
}

// MethodSpec declares one callable method the host runtime exposes.
type MethodSpec struct {
	ID     string      `json:"id"`
	Label  string      `json:"label"`
	Params []ParamSpec `json:"params,omitempty"`
}

// ParamSpec is one typed method parameter.
type ParamSpec struct {
	Key  string `json:"key"`
	Type string `json:"type"` // text | number | boolean
}

// EventSpec declares one event an extension component can emit.
type EventSpec struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// BlockSpec declares one custom block the extension adds to the palette. The
// shape mirrors the platform's block definitions so Phase C can render
// extension blocks with no new vocabulary types.
type BlockSpec struct {
	Type      string           `json:"type"`
	Kind      string           `json:"kind"` // statement | expression
	Category  string           `json:"category"`
	Label     string           `json:"label"`
	Inputs    []BlockInputSpec `json:"inputs,omitempty"`
	Slots     []string         `json:"slots,omitempty"`
	Container bool             `json:"container,omitempty"`
}

// BlockInputSpec is one typed socket on a custom block.
type BlockInputSpec struct {
	Key  string `json:"key"`
	Kind string `json:"kind"` // component | property | screen | variable | text | number
}

// DependencySpec references another extension this one builds on.
type DependencySpec struct {
	Slug    string `json:"slug"`
	Version string `json:"version"`
}

// Manifest is the validated extension contract (format v1).
type Manifest struct {
	Format       int              `json:"format"`
	Components   []ComponentSpec  `json:"components,omitempty"`
	Methods      []MethodSpec     `json:"methods,omitempty"`
	Events       []EventSpec      `json:"events,omitempty"`
	Blocks       []BlockSpec      `json:"blocks,omitempty"`
	Dependencies []DependencySpec `json:"dependencies,omitempty"`
}

// ComponentSpec declares one host-registered component.
type ComponentSpec struct {
	ID    string     `json:"id"`
	Label string     `json:"label"`
	Props []PropSpec `json:"props,omitempty"`
}

// Validate checks the manifest contract: format, unique ids, known kinds.
func (m *Manifest) Validate() error {
	if m == nil {
		return errors.New("the manifest document is missing")
	}
	if m.Format != ManifestFormat {
		return fmt.Errorf("unsupported manifest format %d (supported: %d)", m.Format, ManifestFormat)
	}

	seenComponent := map[string]bool{}
	for i, c := range m.Components {
		if strings.TrimSpace(c.ID) == "" || len(c.ID) > 40 {
			return fmt.Errorf("component %d needs an id of 1-40 characters", i+1)
		}
		if seenComponent[c.ID] {
			return fmt.Errorf("component id %q is used more than once", c.ID)
		}
		seenComponent[c.ID] = true
		if strings.TrimSpace(c.Label) == "" {
			return fmt.Errorf("component %q needs a label", c.ID)
		}
	}

	seenMethod := map[string]bool{}
	for i, meth := range m.Methods {
		if strings.TrimSpace(meth.ID) == "" || seenMethod[meth.ID] {
			return fmt.Errorf("method %d needs a unique id", i+1)
		}
		seenMethod[meth.ID] = true
	}

	seenEvent := map[string]bool{}
	for i, ev := range m.Events {
		if strings.TrimSpace(ev.ID) == "" || seenEvent[ev.ID] {
			return fmt.Errorf("event %d needs a unique id", i+1)
		}
		seenEvent[ev.ID] = true
	}

	seenBlock := map[string]bool{}
	for i, b := range m.Blocks {
		if strings.TrimSpace(b.Type) == "" || seenBlock[b.Type] {
			return fmt.Errorf("block %d needs a unique type", i+1)
		}
		seenBlock[b.Type] = true
		if b.Kind != "statement" && b.Kind != "expression" {
			return fmt.Errorf("block %q must be a statement or an expression", b.Type)
		}
	}

	seenDep := map[string]bool{}
	for i, dep := range m.Dependencies {
		if strings.TrimSpace(dep.Slug) == "" || seenDep[dep.Slug] {
			return fmt.Errorf("dependency %d needs a unique slug", i+1)
		}
		seenDep[dep.Slug] = true
	}
	return nil
}

// Extension is one authored extension row.
type Extension struct {
	ID             string
	OwnerID        string
	Slug           string
	Name           string
	Summary        string
	Kind           string
	Status         string
	Manifest       []byte
	Docs           string
	Source         string
	CurrentVersion string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Version is one immutable snapshot of an extension.
type Version struct {
	Version   string
	Manifest  []byte
	Source    []byte
	Changelog string
	CreatedAt time.Time
}

// ---- store ------------------------------------------------------------------------

const columns = `id, owner_id, slug, name, summary, kind, status, manifest, docs, source, current_version, created_at, updated_at`

func scanExtension(row interface{ Scan(...any) error }) (*Extension, error) {
	var e Extension
	err := row.Scan(&e.ID, &e.OwnerID, &e.Slug, &e.Name, &e.Summary, &e.Kind, &e.Status,
		&e.Manifest, &e.Docs, &e.Source, &e.CurrentVersion, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("extension: scan: %w", err)
	}
	return &e, nil
}

// Store is the PostgreSQL-backed extension repository.
type Store struct {
	db *sql.DB
}

// NewStore wires a Store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// NewExtension is the input for creating an extension row.
type NewExtension struct {
	OwnerID  string
	Slug     string
	Name     string
	Summary  string
	Kind     string
	Manifest []byte
	Docs     string
	Source   string
}

// Create inserts one extension plus its first version.
func (s *Store) Create(ctx context.Context, input NewExtension, version string) (*Extension, error) {
	row := s.db.QueryRowContext(ctx, `
		WITH created AS (
			INSERT INTO extensions (owner_id, slug, name, summary, kind, manifest, docs, source, current_version)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING `+columns+`
		)
		SELECT `+columns+` FROM created`, input.OwnerID, input.Slug, input.Name, input.Summary,
		input.Kind, input.Manifest, input.Docs, input.Source, version)
	created, err := scanExtension(row)
	if err != nil {
		return nil, fmt.Errorf("extension: create: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO extension_versions (extension_id, version, manifest, source, changelog)
		VALUES ($1, $2, $3, '{}'::jsonb, 'Initial version.')`, created.ID, version, input.Manifest); err != nil {
		return nil, fmt.Errorf("extension: create: version: %w", err)
	}
	return created, nil
}

// FindForOwner fetches one owned extension; foreign rows answer ErrNotFound.
func (s *Store) FindForOwner(ctx context.Context, ownerID, id string) (*Extension, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+columns+` FROM extensions WHERE id = $1 AND owner_id = $2`, id, ownerID)
	found, err := scanExtension(row)
	if err != nil {
		return nil, fmt.Errorf("extension: find: %w", err)
	}
	return found, nil
}

// ListForOwner returns the owner's extensions, newest first.
func (s *Store) ListForOwner(ctx context.Context, ownerID string, limit int) ([]Extension, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+columns+` FROM extensions WHERE owner_id = $1
		ORDER BY updated_at DESC LIMIT $2`, ownerID, limit)
	if err != nil {
		return nil, fmt.Errorf("extension: list: %w", err)
	}
	defer rows.Close()

	out := []Extension{}
	for rows.Next() {
		found, err := scanExtension(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *found)
	}
	return out, rows.Err()
}

// UpdateMeta rewrites mutable fields; nil fields stay unchanged.
func (s *Store) UpdateMeta(ctx context.Context, ownerID, id string,
	name, summary *string, manifest []byte, docs, source *string) (*Extension, error) {
	sets := []string{"updated_at = now()"}
	args := []any{ownerID, id}
	if name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)+1))
		args = append(args, *name)
	}
	if summary != nil {
		sets = append(sets, fmt.Sprintf("summary = $%d", len(args)+1))
		args = append(args, *summary)
	}
	if docs != nil {
		sets = append(sets, fmt.Sprintf("docs = $%d", len(args)+1))
		args = append(args, *docs)
	}
	if source != nil {
		sets = append(sets, fmt.Sprintf("source = $%d", len(args)+1))
		args = append(args, *source)
	}
	if manifest != nil {
		sets = append(sets, fmt.Sprintf("manifest = $%d", len(args)+1))
		args = append(args, manifest)
	}
	row := s.db.QueryRowContext(ctx,
		`UPDATE extensions SET `+strings.Join(sets, ", ")+`
		 WHERE id = $2 AND owner_id = $1 RETURNING `+columns, args...)
	found, err := scanExtension(row)
	if err != nil {
		return nil, fmt.Errorf("extension: update: %w", err)
	}
	return found, nil
}

// Delete removes one owned extension; versions cascade.
func (s *Store) Delete(ctx context.Context, ownerID, id string) error {
	tag, err := s.db.ExecContext(ctx,
		`DELETE FROM extensions WHERE id = $1 AND owner_id = $2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("extension: delete: %w", err)
	}
	if rows, _ := tag.RowsAffected(); rows == 0 {
		return ErrNotFound
	}
	return nil
}

// SaveVersion snapshots the extension's current manifest/source as a new
// immutable version and moves the current_version pointer.
func (s *Store) SaveVersion(ctx context.Context, ownerID, id, version string, manifest, source []byte, changelog string) (*Extension, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("extension: save version: begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO extension_versions (extension_id, version, manifest, source, changelog)
		VALUES ($1, $2, $3, $4, $5)`, id, version, manifest, source, changelog); err != nil {
		return nil, fmt.Errorf("extension: save version: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE extensions SET current_version = $3, manifest = $4, updated_at = now()
		WHERE id = $1 AND owner_id = $2`, id, ownerID, version, manifest); err != nil {
		return nil, fmt.Errorf("extension: save version: pointer: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("extension: save version: commit: %w", err)
	}
	return s.FindForOwner(ctx, ownerID, id)
}

// Publish flips one owned extension to published; republishing is a no-op
// success (the end state is what the caller asked for).
func (s *Store) Publish(ctx context.Context, ownerID, id string) (*Extension, error) {
	row := s.db.QueryRowContext(ctx, `
		UPDATE extensions SET status = $3, updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND status = $4 RETURNING `+columns,
		id, ownerID, StatusPublished, StatusDraft)
	found, err := scanExtension(row)
	if err != nil {
		return nil, fmt.Errorf("extension: publish: %w", err)
	}
	return found, nil
}

// RegistrySnapshot maps every extension slug to its published versions.
// Dependency resolution runs against this snapshot, keeping the isolated
// build worker deterministic and side-effect free.
func (s *Store) RegistrySnapshot(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT slug, current_version FROM extensions WHERE status = $1`, StatusPublished)
	if err != nil {
		return nil, fmt.Errorf("extension: registry snapshot: %w", err)
	}
	defer rows.Close()
	snapshot := map[string][]string{}
	for rows.Next() {
		var slug, version string
		if err := rows.Scan(&slug, &version); err != nil {
			return nil, fmt.Errorf("extension: registry snapshot: scan: %w", err)
		}
		snapshot[slug] = append(snapshot[slug], version)
	}
	return snapshot, rows.Err()
}

// FindForOwnerAny fetches an extension regardless of owner (install flow:
// installing someone else's published extension is the point). Identity
// still never leaks for unknown ids.
func (s *Store) FindForOwnerAny(ctx context.Context, id string) (*Extension, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM extensions WHERE id = $1`, id)
	found, err := scanExtension(row)
	if err != nil {
		return nil, fmt.Errorf("extension: find any: %w", err)
	}
	return found, nil
}

// Install pins an extension into a user's installed set (idempotent; the
// newest install wins the recorded version).
func (s *Store) Install(ctx context.Context, userID, extensionID, version string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO extension_installs (user_id, extension_id, version)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, extension_id) DO UPDATE SET version = EXCLUDED.version, installed_at = now()`,
		userID, extensionID, version)
	if err != nil {
		return fmt.Errorf("extension: install: %w", err)
	}
	return nil
}

// Uninstall removes the pin; uninstalling something not installed is a
// no-op success — the end state is what the caller asked for.
func (s *Store) Uninstall(ctx context.Context, userID, extensionID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM extension_installs WHERE user_id = $1 AND extension_id = $2`, userID, extensionID)
	if err != nil {
		return fmt.Errorf("extension: uninstall: %w", err)
	}
	return nil
}

// InstalledForUser lists a user's installed extensions.
func (s *Store) InstalledForUser(ctx context.Context, userID string) ([]Extension, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+columns+` FROM extensions e
		JOIN extension_installs i ON i.extension_id = e.id
		WHERE i.user_id = $1 ORDER BY i.installed_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("extension: installed: %w", err)
	}
	defer rows.Close()
	out := []Extension{}
	for rows.Next() {
		found, err := scanExtension(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *found)
	}
	return out, rows.Err()
}

// VersionsByExtension lists an owned extension's versions, newest first.
func (s *Store) VersionsByExtension(ctx context.Context, extensionID string) ([]Version, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT version, manifest, source, changelog, created_at
		FROM extension_versions WHERE extension_id = $1
		ORDER BY created_at DESC, version DESC`, extensionID)
	if err != nil {
		return nil, fmt.Errorf("extension: versions: %w", err)
	}
	defer rows.Close()

	out := []Version{}
	for rows.Next() {
		var v Version
		if err := rows.Scan(&v.Version, &v.Manifest, &v.Source, &v.Changelog, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("extension: versions: scan: %w", err)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ---- service ----------------------------------------------------------------------

// Service holds extension business logic on top of the store.
type Service struct {
	store   *Store
	db      *sql.DB
	dataDir string
}

// NewService wires a Service. dataDir is where built AIX packages live
// (empty defaults to .data).
func NewService(db *sql.DB, dataDir string) *Service {
	return &Service{store: NewStore(db), db: db, dataDir: dataDir}
}

func httpxNotFound(message string) *httpx.Error {
	return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, message)
}

// CreateInput is the validated shape of a creation request.
type CreateInput struct {
	Name     string
	Summary  string
	Kind     string
	Manifest []byte
	Docs     string
	Source   string
}

// PublicExtensionRow is one published extension for the public shelf.
type PublicExtensionRow struct {
	ID             string
	Slug           string
	Name           string
	Summary        string
	Kind           string
	CurrentVersion string
	Creator        string
	Installs       int
	UpdatedAt      time.Time
}

// PublicExtensions lists every published extension with creator names and
// install counts. Published-only by definition; nothing private leaks.
func (s *Service) PublicExtensions(ctx context.Context) ([]PublicExtensionRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT e.id, e.slug, e.name, e.summary, e.kind, e.current_version,
		       u.username, (SELECT count(*) FROM extension_installs i WHERE i.extension_id = e.id) AS installs,
		       e.updated_at
		FROM extensions e
		JOIN users u ON u.id = e.owner_id
		WHERE e.status = 'published'
		ORDER BY installs DESC, e.updated_at DESC
		LIMIT 60`)
	if err != nil {
		return nil, fmt.Errorf("extension: public list: %w", err)
	}
	defer rows.Close()
	out := []PublicExtensionRow{}
	for rows.Next() {
		var row PublicExtensionRow
		if err := rows.Scan(&row.ID, &row.Slug, &row.Name, &row.Summary, &row.Kind,
			&row.CurrentVersion, &row.Creator, &row.Installs, &row.UpdatedAt); err != nil {
			return nil, fmt.Errorf("extension: public list scan: %w", err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// validateID shape-checks a UUID before it reaches SQL (mirrors project).
func validateID(id string) error {
	if len(id) != 36 || strings.Count(id, "-") != 4 {
		return notFound()
	}
	return nil
}

func notFound() *httpx.Error {
	return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "This extension does not exist or is not yours.")
}

// Create validates and inserts a new extension owned by the caller.
func (s *Service) Create(ctx context.Context, ownerID string, input CreateInput) (*Extension, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > NameMaxLen {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("The extension name must be 1-%d characters.", NameMaxLen))
	}
	summary := strings.TrimSpace(input.Summary)
	if len(summary) > SummaryMaxLen {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Keep the summary under %d characters.", SummaryMaxLen))
	}
	if len(input.Docs) > DocsMaxLen {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Keep documentation under %d characters.", DocsMaxLen))
	}
	kind := strings.TrimSpace(input.Kind)
	if kind == "" {
		kind = KindMixed
	}
	if kind != KindComponent && kind != KindBlocks && kind != KindMixed {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "The extension kind must be component, blocks, or mixed.")
	}

	manifest := Manifest{Format: ManifestFormat}
	if len(input.Manifest) > 0 {
		if err := json.Unmarshal(input.Manifest, &manifest); err != nil {
			return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "The manifest must be valid JSON.")
		}
	}
	if err := manifest.Validate(); err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Manifest is invalid: %v", err))
	}
	normalized, err := json.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("extension: encode manifest: %w", err)
	}

	slug := slugify(name)
	created, err := s.store.Create(ctx, NewExtension{
		OwnerID: ownerID, Slug: slug, Name: name, Summary: summary,
		Kind: kind, Manifest: normalized, Docs: input.Docs, Source: input.Source,
	}, "0.1.0")
	if err != nil {
		return nil, fmt.Errorf("extension: create: %w", err)
	}
	return created, nil
}

// Get returns one owned extension.
func (s *Service) Get(ctx context.Context, ownerID, id string) (*Extension, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: get: %w", err)
	}
	return found, nil
}

// List returns the owner's extensions.
func (s *Service) List(ctx context.Context, ownerID string, limit int) ([]Extension, error) {
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}
	return s.store.ListForOwner(ctx, ownerID, limit)
}

// Update patches mutable fields; a manifest must validate.
func (s *Service) Update(ctx context.Context, ownerID, id string, name, summary *string, manifest []byte, docs, source *string) (*Extension, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" || len(trimmed) > NameMaxLen {
			return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("The extension name must be 1-%d characters.", NameMaxLen))
		}
		name = &trimmed
	}
	if summary != nil && len(*summary) > SummaryMaxLen {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Keep the summary under %d characters.", SummaryMaxLen))
	}
	if manifest != nil {
		parsed := Manifest{Format: ManifestFormat}
		if err := json.Unmarshal(manifest, &parsed); err != nil {
			return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "The manifest must be valid JSON.")
		}
		if err := parsed.Validate(); err != nil {
			return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Manifest is invalid: %v", err))
		}
		normalized, err := json.Marshal(parsed)
		if err != nil {
			return nil, err
		}
		manifest = normalized
	}
	updated, err := s.store.UpdateMeta(ctx, ownerID, id, name, summary, manifest, docs, source)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: update: %w", err)
	}
	return updated, nil
}

// Delete removes one owned extension.
func (s *Service) Delete(ctx context.Context, ownerID, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	if err := s.store.Delete(ctx, ownerID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return notFound()
		}
		return fmt.Errorf("extension: delete: %w", err)
	}
	return nil
}

// SaveVersionInput is one new immutable version snapshot.
type SaveVersionInput struct {
	Version   string
	Manifest  []byte
	Source    []byte
	Changelog string
}

// SaveVersion validates and snapshots a new version.
func (s *Service) SaveVersion(ctx context.Context, ownerID, id string, input SaveVersionInput) (*Extension, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	version := strings.TrimSpace(input.Version)
	if !versionPattern.MatchString(version) {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "Versions must be semver-ish (e.g. 0.2.0).")
	}
	parsed := Manifest{Format: ManifestFormat}
	if len(input.Manifest) > 0 {
		if err := json.Unmarshal(input.Manifest, &parsed); err != nil {
			return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "The manifest must be valid JSON.")
		}
	}
	if err := parsed.Validate(); err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, fmt.Sprintf("Manifest is invalid: %v", err))
	}
	normalized, err := json.Marshal(parsed)
	if err != nil {
		return nil, err
	}
	source := input.Source
	if len(source) == 0 {
		source = []byte("{}")
	}
	saved, err := s.store.SaveVersion(ctx, ownerID, id, version, normalized, source, strings.TrimSpace(input.Changelog))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: save version: %w", err)
	}
	return saved, nil
}

// Publish flips an owned draft extension to published — the gate the
// install flow requires (drafts are private work).
func (s *Service) Publish(ctx context.Context, ownerID, id string) (*Extension, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	updated, err := s.store.Publish(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: publish: %w", err)
	}
	return updated, nil
}

// Versions lists an owned extension's immutable versions.
func (s *Service) Versions(ctx context.Context, ownerID, id string) ([]Version, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	if _, err := s.store.FindForOwner(ctx, ownerID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: versions: %w", err)
	}
	versions, err := s.store.VersionsByExtension(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("extension: versions: %w", err)
	}
	return versions, nil
}

func slugify(name string) string {
	lower := strings.ToLower(name)
	var builder strings.Builder
	lastDash := false
	for _, r := range lower {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && builder.Len() > 0 {
				builder.WriteByte('-')
				lastDash = true
			}
		}
	}
	slug := strings.Trim(builder.String(), "-")
	if len(slug) > 40 {
		slug = slug[:40]
	}
	if slug == "" {
		slug = "extension"
	}
	return slug + "-ext"
}
