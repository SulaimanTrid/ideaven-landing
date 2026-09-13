package project

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// Project statuses.
const (
	StatusDraft     = "draft"
	StatusPublished = "published"
	StatusArchived  = "archived"
)

// Project visibilities.
const (
	VisibilityPrivate  = "private"
	VisibilityUnlisted = "unlisted"
	VisibilityPublic   = "public"
)

// Service holds the project business logic on top of the store.
// AssetRef is the project package's view of one stored asset (M30).
type AssetRef struct {
	ID    string
	Name  string
	MIME  string
	Size  int
}

// AssetBytes is one asset's media payload with its identity.
type AssetBytes struct {
	Name string
	MIME string
	Data []byte
}

// AssetMediaSource (M30) is the narrow view of the asset store the project
// package needs; the concrete store is injected by the server wiring. The
// interface keeps project ↔ asset acyclic (the asset package adapts).
type AssetMediaSource interface {
	ProjectMediaList(ctx context.Context, projectID string) ([]AssetRef, error)
	ProjectMediaData(ctx context.Context, ownerID, id string) (AssetBytes, error)
}

type Service struct {
	store      *Store
	db         *sql.DB
	logger     *slog.Logger
	assetStore AssetMediaSource
	// assetMedia aliases the same source for package portability (6J).
	assetMedia AssetMediaSource
	// AssetInserter, when injected, stores new media during package import
	// and returns the new asset:<id> reference.
	AssetInserter func(ctx context.Context, ownerID, projectID, fileName string, data []byte) (newRef string, err error)
}

// SetAssetMediaSource injects the asset store (server wiring only).
func (s *Service) SetAssetMediaSource(source AssetMediaSource) {
	s.assetStore = source
	s.assetMedia = source
}

// NewService wires a Service.
func NewService(db *sql.DB, logger *slog.Logger) *Service {
	return &Service{store: NewStore(db), db: db, logger: logger}
}

// marshalModel encodes the canonical model document for storage.
func marshalModel(m *Model) ([]byte, error) {
	data, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("project: encode model: %w", err)
	}
	return data, nil
}

// CreateInput is the validated shape of a project creation request.
type CreateInput struct {
	Type        string
	Name        string
	Description string
	// Template optionally names a built-in template whose model becomes the
	// project's starting document; empty means the blank initial model.
	Template string
}

// Limits and allowed values for validation.
const (
	NameMaxLen        = 80
	DescriptionMaxLen = 280
	DefaultListLimit  = 50
	MaxListLimit      = 100
)

// Create validates the request and inserts a new project with its initial
// canonical model.
func (s *Service) Create(ctx context.Context, ownerID string, input CreateInput) (*Project, error) {
	input.Type = strings.TrimSpace(input.Type)
	name := strings.TrimSpace(input.Name)
	description := strings.TrimSpace(input.Description)

	if !typeVocabulary[input.Type] {
		return nil, field("type", errors.New("Choose a project type: app, game, website, backend, api, database, experience, extension, tool, or education."))
	}
	if err := ValidateName(name); err != nil {
		return nil, field("name", err)
	}
	if len(description) > DescriptionMaxLen {
		return nil, field("description", fmt.Errorf("Keep the description under %d characters.", DescriptionMaxLen))
	}

	model := InitialModel(input.Type)
	if templateID := strings.TrimSpace(input.Template); templateID != "" {
		fromTemplate, err := TemplateModel(templateID, input.Type)
		if err != nil {
			return nil, field("template", errors.New("Choose one of the listed templates."))
		}
		model = fromTemplate
	}
	if err := ValidateModel(&model); err != nil {
		return nil, err
	}
	modelJSON, err := marshalModel(&model)
	if err != nil {
		return nil, err
	}

	slug, err := newSlug(name)
	if err != nil {
		return nil, err
	}

	created, err := s.store.Create(ctx, NewProject{
		OwnerID:     ownerID,
		Name:        name,
		Slug:        slug,
		Description: description,
		Type:        input.Type,
		Model:       modelJSON,
	})
	if errors.Is(err, ErrDuplicateSlug) {
		// The 6-char suffix collides with an existing slug of this owner;
		// one retry is statistically more than enough.
		slug, err = newSlug(name)
		if err != nil {
			return nil, err
		}
		created, err = s.store.Create(ctx, NewProject{
			OwnerID:     ownerID,
			Name:        name,
			Slug:        slug,
			Description: description,
			Type:        input.Type,
			Model:       modelJSON,
		})
	}
	if err != nil {
		return nil, fmt.Errorf("project: create: %w", err)
	}

	s.logger.Info("project created", "user_id", ownerID, "project_id", created.ID, "type", created.Type)
	return created, nil
}

// ListQuery is the parsed listing request.
type ListQuery struct {
	Query  string
	Status string // draft | published | archived | all (default: draft+published)
	Sort   string // updated | created | name | opened
	Limit  int
	Offset int
}

// List returns one page of the owner's library plus the total count.
func (s *Service) List(ctx context.Context, ownerID string, query ListQuery) ([]Project, int, error) {
	query.Query = strings.TrimSpace(query.Query)

	switch query.Status {
	case "", "draft", "published", "archived", "all", "active":
	default:
		return nil, 0, field("status", errors.New("Unknown status filter."))
	}
	switch query.Sort {
	case "", "updated", "created", "name", "opened":
	default:
		return nil, 0, field("sort", errors.New("Unknown sort option."))
	}
	if query.Limit <= 0 {
		query.Limit = DefaultListLimit
	}
	if query.Limit > MaxListLimit {
		query.Limit = MaxListLimit
	}
	if query.Offset < 0 {
		query.Offset = 0
	}

	statuses := map[string][]string{
		"":          {StatusDraft, StatusPublished},
		"active":    {StatusDraft, StatusPublished},
		"draft":     {StatusDraft},
		"published": {StatusPublished},
		"archived":  {StatusArchived},
		"all":       {StatusDraft, StatusPublished, StatusArchived},
	}[query.Status]

	projects, total, err := s.store.List(ctx, ListFilter{
		OwnerID:  ownerID,
		Query:    query.Query,
		Statuses: statuses,
		Sort:     query.Sort,
		Limit:    query.Limit,
		Offset:   query.Offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("project: list: %w", err)
	}
	return projects, total, nil
}

// Get returns one owned project. A missing project and someone else's project
// are indistinguishable to the caller.
func (s *Service) Get(ctx context.Context, ownerID, id string) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: get: %w", err)
	}
	return found, nil
}

// UpdateInput is a partial metadata edit; nil fields stay unchanged.
type UpdateInput struct {
	Name        *string
	Description *string
	Status      *string
	Visibility  *string
}

// Update rewrites mutable metadata of an owned project. Slugs are identities
// and deliberately never change on rename.
func (s *Service) Update(ctx context.Context, ownerID, id string, input UpdateInput) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if err := ValidateName(name); err != nil {
			return nil, field("name", err)
		}
		input.Name = &name
	}
	if input.Description != nil {
		description := strings.TrimSpace(*input.Description)
		if len(description) > DescriptionMaxLen {
			return nil, field("description", fmt.Errorf("Keep the description under %d characters.", DescriptionMaxLen))
		}
		input.Description = &description
	}
	if input.Status != nil {
		switch *input.Status {
		case StatusDraft, StatusPublished, StatusArchived:
		default:
			return nil, field("status", errors.New("Unknown project status."))
		}
	}
	if input.Visibility != nil {
		switch *input.Visibility {
		case VisibilityPrivate, VisibilityUnlisted, VisibilityPublic:
		default:
			return nil, field("visibility", errors.New("Unknown project visibility."))
		}
	}
	if input.Name == nil && input.Description == nil && input.Status == nil && input.Visibility == nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "Nothing to update.")
	}

	updated, err := s.store.UpdateMeta(ctx, ownerID, id, MetaUpdate{
		Name:        input.Name,
		Description: input.Description,
		Status:      input.Status,
		Visibility:  input.Visibility,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: update: %w", err)
	}
	s.logger.Info("project updated", "user_id", ownerID, "project_id", updated.ID)
	return updated, nil
}

// Duplicate copies an owned project under a fresh identity. The copy starts
// as a private draft; attribution for remixes of *other* users' projects is
// a separate future mechanism — this is the same-owner copy path.
func (s *Service) Duplicate(ctx context.Context, ownerID, id string) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	source, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: duplicate: find: %w", err)
	}

	name := source.Name + " (Copy)"
	if len(name) > NameMaxLen {
		name = strings.TrimSpace(name[:NameMaxLen-1]) + "…"
	}

	slug, err := newSlug(name)
	if err != nil {
		return nil, err
	}

	created, err := s.store.Create(ctx, NewProject{
		OwnerID:     ownerID,
		Name:        name,
		Slug:        slug,
		Description: source.Description,
		Type:        source.Type,
		Model:       source.Model,
	})
	if errors.Is(err, ErrDuplicateSlug) {
		slug, err = newSlug(name)
		if err != nil {
			return nil, err
		}
		created, err = s.store.Create(ctx, NewProject{
			OwnerID:     ownerID,
			Name:        name,
			Slug:        slug,
			Description: source.Description,
			Type:        source.Type,
			Model:       source.Model,
		})
	}
	if err != nil {
		return nil, fmt.Errorf("project: duplicate: create: %w", err)
	}

	s.logger.Info("project duplicated", "user_id", ownerID, "project_id", created.ID, "source_id", source.ID)
	return created, nil
}

// Open marks the project as just opened and returns the fresh row.
func (s *Service) Open(ctx context.Context, ownerID, id string) (*Project, error) {
	found, err := s.Get(ctx, ownerID, id)
	if err != nil {
		return nil, err
	}
	if err := s.store.TouchOpened(ctx, ownerID, found.ID); err != nil {
		return nil, fmt.Errorf("project: open: %w", err)
	}
	return s.Get(ctx, ownerID, id)
}

// UpdateModel replaces the canonical model document after validating it
// against the schema and the project's own type. This is the single write
// path for every editor surface — design, blocks, code, and AI mutations all
// land here, so no surface can fork the source of truth.
func (s *Service) UpdateModel(ctx context.Context, ownerID, id string, model *Model, origin string) (*Project, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	// The version label is a closed vocabulary: "" means a normal edit.
	switch origin {
	case "", "edit", "ai":
	default:
		return nil, field("origin", fmt.Errorf("Unknown save origin %q.", origin))
	}

	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: update model: find: %w", err)
	}

	if err := ValidateModel(model); err != nil {
		return nil, err
	}
	if model.Type != found.Type {
		return nil, field("model", fmt.Errorf("The model type %q does not match this project's type %q.", model.Type, found.Type))
	}

	modelJSON, err := marshalModel(model)
	if err != nil {
		return nil, err
	}

	updated, err := s.store.UpdateModel(ctx, ownerID, id, modelJSON)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("project: update model: %w", err)
	}
	// Snapshot the new state for the History panel / AI rollback. Failures
	// are logged inside recordVersion — a missing snapshot never blocks a
	// save.
	if origin == "" {
		origin = "edit"
	}
	s.recordVersion(ctx, updated.ID, modelJSON, origin)
	s.logger.Info("project model saved", "user_id", ownerID, "project_id", updated.ID)
	return updated, nil
}

// Delete permanently removes an owned project.
func (s *Service) Delete(ctx context.Context, ownerID, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	if err := s.store.Delete(ctx, ownerID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return notFound()
		}
		return fmt.Errorf("project: delete: %w", err)
	}
	s.logger.Info("project deleted", "user_id", ownerID, "project_id", id)
	return nil
}

// ValidateName enforces the shared project-name rules.
func ValidateName(name string) error {
	if name == "" {
		return errors.New("Give your project a name.")
	}
	if len(name) > NameMaxLen {
		return fmt.Errorf("Keep the name under %d characters.", NameMaxLen)
	}
	return nil
}

// slugSaver strips anything that is not a lowercase letter, digit, or dash.
var slugInvalid = regexp.MustCompile(`[^a-z0-9]+`)

// newSlug builds a stable, URL-safe slug: a readable prefix from the name
// plus a random suffix so renames and duplicates never collide.
func newSlug(name string) (string, error) {
	prefix := slugInvalid.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	prefix = strings.Trim(prefix, "-")
	if prefix == "" {
		prefix = "project"
	}
	if len(prefix) > 48 {
		prefix = strings.Trim(prefix[:48], "-")
	}

	suffix := make([]byte, 3)
	if _, err := rand.Read(suffix); err != nil {
		return "", fmt.Errorf("project: slug: %w", err)
	}
	return prefix + "-" + hex.EncodeToString(suffix), nil
}

// uuidShape matches canonical 8-4-4-4-12 hex UUIDs; anything else can never
// match a row and is answered with a not-found instead of a database error.
var uuidShape = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// validateID rejects obviously malformed project IDs before touching the DB.
func validateID(id string) error {
	if !uuidShape.MatchString(strings.TrimSpace(id)) {
		return notFound()
	}
	return nil
}

func notFound() *httpx.Error {
	return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "That project does not exist or is not yours.")
}

func field(name string, err error) *httpx.Error {
	return httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, err.Error()).
		WithDetails(httpx.FieldError{Field: name, Message: err.Error()})
}
