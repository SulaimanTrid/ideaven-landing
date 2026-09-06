// Package storage abstracts binary object storage (roadmap 6.0 M5): the
// application never couples to one provider. The first backend is the local
// filesystem; a cloud object backend can slot in later without touching
// callers. Paths are always derived from stable IDs — user-provided names
// never reach the filesystem.
package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Adapter is the minimal object-store surface the platform needs.
type Adapter interface {
	Save(ctx scope, id string, data []byte) error
	Load(ctx scope, id string) ([]byte, error)
	Delete(ctx scope, id string) error
}

// scope identifies which tenant/project owns the object; backends use it to
// lay out (and, later, to authorize) storage.
type scope struct {
	ProjectID string
}

// NewScope builds the storage scope for one project's objects.
func NewScope(projectID string) scope { return scope{ProjectID: projectID} }

// LocalAdapter stores objects under root/<projectID>/<id> with 0600 files
// and 0700 directories.
type LocalAdapter struct {
	root string
}

// NewLocalAdapter builds the filesystem backend rooted at dir (created on
// demand, permissions 0700).
func NewLocalAdapter(dir string) *LocalAdapter {
	return &LocalAdapter{root: dir}
}

func (a *LocalAdapter) objectPath(projectID, id string) (string, error) {
	// Defense in depth: IDs come from the DB (UUIDs), but never let any
	// caller-controlled string steer a path.
	for _, part := range []string{projectID, id} {
		if part == "" || strings.ContainsAny(part, "/\\") || strings.Contains(part, "..") {
			return "", fmt.Errorf("storage: invalid object reference")
		}
	}
	return filepath.Join(a.root, projectID, id), nil
}

// Save writes the object atomically (temp file + rename).
func (a *LocalAdapter) Save(ctx scope, id string, data []byte) error {
	path, err := a.objectPath(ctx.ProjectID, id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("storage: mkdir: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("storage: write: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("storage: rename: %w", err)
	}
	return nil
}

// Load reads the object; ErrNotFound when absent (callers decide fallback).
func (a *LocalAdapter) Load(ctx scope, id string) ([]byte, error) {
	path, err := a.objectPath(ctx.ProjectID, id)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: read: %w", err)
	}
	return data, nil
}

// Delete removes the object; deleting a missing object is not an error.
func (a *LocalAdapter) Delete(ctx scope, id string) error {
	path, err := a.objectPath(ctx.ProjectID, id)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("storage: delete: %w", err)
	}
	return nil
}

// ErrNotFound marks a missing object.
var ErrNotFound = errors.New("storage: object not found")
