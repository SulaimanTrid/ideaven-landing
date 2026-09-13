package asset

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/storage"
)

// Service validates and enforces the asset rules on top of the Store.
type Service struct {
	store            *Store
	authorizeProject AuthorizeProject
	objects          storage.Adapter // may be nil: DB bytes remain the record
}

// NewService builds a Service. authorize must be non-nil (the server wires
// the project service's owner check). objects may be nil in tests; when set,
// bytes are mirrored to the adapter on write and loaded from it first on
// read, with the database row as the fallback of record (DEC-1).
func NewService(store *Store, authorize AuthorizeProject, objects storage.Adapter) *Service {
	return &Service{store: store, authorizeProject: authorize, objects: objects}
}

// Limits and accepted media. The cap keeps a single upload from dominating
// the row; MaxAssetsPerProject keeps automated accounts from flooding the
// table. SVG is deliberately rejected: http.DetectContentType cannot
// reliably distinguish it from arbitrary XML/HTML, and served inline it is
// a stored-XSS vector.
const (
	MaxAssetSize        = 2 << 20 // 2 MiB
	MaxAssetsPerProject = 50
	MaxNameLength       = 120
)

var allowedMIMEs = map[string]string{
	"image/png":  "image",
	"image/jpeg": "image",
	"image/webp": "image",
	"image/gif":  "image",
	// Audio powers the play-sound/stop-sound block vocabulary; http.
	// DetectContentType sniffs these reliably (WAV → audio/wave).
	"audio/wave":      "audio",
	"audio/mpeg":      "audio",
	"application/ogg": "audio",
}

// ErrTooLarge, ErrUnsupportedType, ErrTooMany and ErrBadName are the
// caller-facing validation failures.
var (
	ErrTooLarge        = errors.New("asset: file too large")
	ErrUnsupportedType = errors.New("asset: unsupported media type")
	ErrTooMany         = errors.New("asset: project asset limit reached")
	ErrBadName         = errors.New("asset: invalid name")
)

// AuthorizeProject reports whether the owner owns the project. The project
// service satisfies this via a small adapter; the indirection keeps this
// package free of project imports.
type AuthorizeProject func(ctx context.Context, ownerID, projectID string) error

// List returns one project's assets.
func (s *Service) List(ctx context.Context, ownerID, projectID string) ([]Asset, error) {
	if err := s.authorize(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	return s.store.ListByProject(ctx, projectID)
}

// Create validates and stores an upload for an owned project. The MIME type
// is detected from the bytes themselves — the client-supplied type is never
// trusted.
func (s *Service) Create(ctx context.Context, ownerID, projectID, name string, data []byte) (*Asset, error) {
	if err := s.authorize(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, ErrUnsupportedType
	}
	if len(data) > MaxAssetSize {
		return nil, ErrTooLarge
	}

	count, err := s.store.CountForProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if count >= MaxAssetsPerProject {
		return nil, ErrTooMany
	}

	mime := detectMIME(data)
	kind, ok := allowedMIMEs[mime]
	if !ok {
		return nil, ErrUnsupportedType
	}

	assetName := strings.TrimSpace(name)
	if assetName == "" {
		assetName = "Image"
	}
	if len(assetName) > MaxNameLength {
		assetName = assetName[:MaxNameLength]
	}

	// Content hash (6.0 M4): integrity, ETags, future dedup.
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])

	created, err := s.store.Insert(ctx, NewAsset{
		ProjectID: projectID,
		Kind:      kind,
		Name:      assetName,
		MIME:      mime,
		SHA256:    hash,
		Data:      data,
	})
	if err != nil {
		return nil, err
	}
	// Best-effort mirror: the DB row stays the record of truth, so an
	// adapter hiccup must never fail an upload (DEC-1).
	if s.objects != nil {
		_ = s.objects.Save(storage.NewScope(projectID), created.ID, data)
	}
	return created, nil
}

// backfill migrates a pre-adapter row toward the storage layer: compute the
// hash when missing and mirror the bytes to the adapter once. Both steps are
// best-effort; serving never depends on them succeeding.
func (s *Service) backfill(ctx context.Context, a *Asset, data []byte) {
	if a.SHA256 == "" && len(data) > 0 {
		sum := sha256.Sum256(data)
		a.SHA256 = hex.EncodeToString(sum[:])
		_ = s.store.UpdateHash(ctx, a.ID, a.SHA256)
	}
	if s.objects != nil && len(data) > 0 {
		if _, err := s.objects.Load(storage.NewScope(a.ProjectID), a.ID); err != nil {
			_ = s.objects.Save(storage.NewScope(a.ProjectID), a.ID, data)
		}
	}
}

// RawData fetches one owned asset's bytes for serving. The adapter is tried
// first so post-migration reads come from disk; the DB row is the fallback
// of record (and feeds the lazy backfill).
func (s *Service) RawData(ctx context.Context, ownerID, id string) (*Asset, []byte, error) {
	found, data, err := s.store.FindDataForOwner(ctx, ownerID, id)
	if err != nil {
		return nil, nil, err
	}
	if s.objects != nil {
		if fileData, loadErr := s.objects.Load(storage.NewScope(found.ProjectID), found.ID); loadErr == nil {
			data = fileData
		}
	}
	s.backfill(ctx, found, data)
	return found, data, nil
}

// PublicRawData serves an asset that belongs to a currently published
// project, anonymously. Anything else answers ErrNotFound — existence of a
// private asset is never leaked.
func (s *Service) PublicRawData(ctx context.Context, id string) (*Asset, []byte, error) {
	found, data, err := s.store.FindPublicData(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if s.objects != nil {
		if fileData, loadErr := s.objects.Load(storage.NewScope(found.ProjectID), found.ID); loadErr == nil {
			data = fileData
		}
	}
	s.backfill(ctx, found, data)
	return found, data, nil
}

// Delete removes one owned asset (row first, then best-effort file).
func (s *Service) Delete(ctx context.Context, ownerID, id string) error {
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		return err
	}
	if err := s.store.Delete(ctx, ownerID, id); err != nil {
		return err
	}
	if s.objects != nil {
		_ = s.objects.Delete(storage.NewScope(found.ProjectID), found.ID)
	}
	return nil
}

func (s *Service) authorize(ctx context.Context, ownerID, projectID string) error {
	return s.authorizeProject(ctx, ownerID, projectID)
}

// detectMIME sniffs the media type from the leading bytes.
func detectMIME(data []byte) string {
	return strings.TrimSpace(http.DetectContentType(data))
}
