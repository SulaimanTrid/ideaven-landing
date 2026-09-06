package extension

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"ideaven/apps/api/internal/httpx"
	"time"
)

// Build pipeline (roadmap 2.0 Phase 1). The API orchestrates but never
// packages in-process: it spawns the isolated worker (cmd/extbuild) as its
// own process — worker resolution order:
//  1. $EXT_BUILD_BIN (production: the compiled worker binary)
//  2. `go run ./cmd/extbuild` (dev/test: Go toolchain present)
//
// Built packages live on disk under dataDir/extensions/<slug>/ and are
// verified again before download.

// BuildLog is one pipeline step result shown in the Studio.
type BuildLog struct {
	Step    string `json:"step"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

// BuildResult is the outcome of one build run.
type BuildResult struct {
	OK       bool       `json:"ok"`
	Version  string     `json:"version"`
	Logs     []BuildLog `json:"logs"`
	Checksum string     `json:"checksum,omitempty"`
	Size     int        `json:"size,omitempty"`
	Error    string     `json:"error,omitempty"`
}

type workerResult struct {
	OK        bool       `json:"ok"`
	AIXBase64 string     `json:"aixBase64,omitempty"`
	Checksum  string     `json:"checksum,omitempty"`
	Error     string     `json:"error,omitempty"`
	Logs      []BuildLog `json:"logs"`
}

// resolveWorker finds the isolated build worker command.
func resolveWorker() []string {
	if bin := os.Getenv("EXT_BUILD_BIN"); bin != "" {
		return []string{bin}
	}
	return []string{"go", "run", "./cmd/extbuild"}
}

// findModuleRoot walks up from the working directory until a go.mod is
// found — used only for the dev/test `go run` worker fallback.
func findModuleRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// Build runs the full pipeline for one owned extension at a requested
// version: manifest validation → source validation → dependency resolution →
// isolated worker → verify → persist AIX + version row.
func (s *Service) Build(ctx context.Context, ownerID, id string, version, changelog string) (*BuildResult, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: build: %w", err)
	}

	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		trimmed = bumpPatch(found.CurrentVersion)
	}

	// Dependency resolution inputs: registry snapshot of published versions.
	snapshot, err := s.store.RegistrySnapshot(ctx)
	if err != nil {
		return nil, fmt.Errorf("extension: build: %w", err)
	}
	manifest := Manifest{}
	if err := json.Unmarshal(found.Manifest, &manifest); err != nil {
		return nil, fmt.Errorf("extension: build: stored manifest: %w", err)
	}
	deps := make([]map[string]string, 0, len(manifest.Dependencies))
	for _, dep := range manifest.Dependencies {
		deps = append(deps, map[string]string{"slug": dep.Slug, "version": dep.Version})
	}

	job, err := json.Marshal(map[string]any{
		"slug":             found.Slug,
		"name":             found.Name,
		"version":          trimmed,
		"manifest":         json.RawMessage(found.Manifest),
		"docs":             found.Docs,
		"dependencies":     deps,
		"registrySnapshot": snapshot,
	})
	if err != nil {
		return nil, err
	}

	// Spawn the isolated worker.
	argv := resolveWorker()
	ctxTimeout, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctxTimeout, argv[0], argv[1:]...)
	cmd.Stdin = bytes.NewReader(job)
	// The go-run fallback resolves ./cmd/extbuild relative to the module
	// root, whatever the process CWD is. A standalone worker binary ignores
	// this.
	if argv[0] == "go" {
		if root := findModuleRoot(); root != "" {
			cmd.Dir = root
		}
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	if runErr != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = runErr.Error()
		}
		return &BuildResult{OK: false, Version: trimmed, Error: message}, nil
	}

	// The worker prints exactly one JSON result line.
	var result workerResult
	line := strings.TrimSpace(stdout.String())
	if idx := strings.LastIndex(line, "\n"); idx >= 0 {
		line = line[idx+1:]
	}
	if err := json.Unmarshal([]byte(line), &result); err != nil {
		return &BuildResult{OK: false, Version: trimmed, Error: "build worker produced unreadable output"}, nil
	}
	if !result.OK {
		return &BuildResult{OK: false, Version: trimmed, Logs: result.Logs, Error: result.Error}, nil
	}

	aix, err := base64.StdEncoding.DecodeString(result.AIXBase64)
	if err != nil {
		return &BuildResult{OK: false, Version: trimmed, Logs: result.Logs, Error: "build worker returned an unreadable package"}, nil
	}

	// Persist the package to disk and snapshot the version row with the
	// build metadata inside source.
	relative, err := s.storePackage(found.Slug, trimmed, aix)
	if err != nil {
		return nil, fmt.Errorf("extension: build: store package: %w", err)
	}
	source, _ := json.Marshal(map[string]any{
		"package":  relative,
		"checksum": result.Checksum,
		"size":     len(aix),
		"logs":     result.Logs,
		"builtAt":  time.Now().UTC().Format(time.RFC3339),
	})
	saved, err := s.store.SaveVersion(ctx, ownerID, id, trimmed, found.Manifest, source, strings.TrimSpace(changelog))
	if err != nil {
		// A duplicate version means the same version was built before —
		// report it as a validation failure, not a crash.
		return &BuildResult{OK: false, Version: trimmed, Logs: result.Logs,
			Error: fmt.Sprintf("version %s already exists — bump the version to rebuild.", trimmed)}, nil
	}
	_ = saved

	return &BuildResult{
		OK:       true,
		Version:  trimmed,
		Logs:     result.Logs,
		Checksum: result.Checksum,
		Size:     len(aix),
	}, nil
}

func bumpPatch(version string) string {
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return version
	}
	var patch int
	if _, err := fmt.Sscanf(parts[2], "%d", &patch); err != nil {
		return version
	}
	return fmt.Sprintf("%s.%s.%d", parts[0], parts[1], patch+1)
}

// storePackage writes the AIX under dataDir/extensions/<slug>/ and returns
// the relative path recorded on the version row.
func (s *Service) storePackage(slug, version string, aix []byte) (string, error) {
	dir := s.dataDir
	if dir == "" {
		dir = ".data"
	}
	folder := filepath.Join(dir, "extensions", slug)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return "", err
	}
	relative := filepath.Join("extensions", slug, version+".aix")
	return relative, os.WriteFile(filepath.Join(dir, relative), aix, 0o644)
}

// AIX loads a built package for download. Owner-only via the caller.
func (s *Service) AIX(ctx context.Context, ownerID, id, version string) ([]byte, []byte, error) {
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil, notFound()
		}
		return nil, nil, fmt.Errorf("extension: aix: %w", err)
	}
	versions, err := s.store.VersionsByExtension(ctx, found.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("extension: aix: %w", err)
	}
	want := strings.TrimSpace(version)
	if want == "" {
		want = found.CurrentVersion
	}
	var source map[string]any
	for _, v := range versions {
		if v.Version != want {
			continue
		}
		if err := json.Unmarshal(v.Source, &source); err != nil {
			return nil, nil, fmt.Errorf("extension: aix: version metadata: %w", err)
		}
		break
	}
	if source == nil {
		return nil, nil, httpxNotFound("This version has not been built yet — run a build first.")
	}
	relative, _ := source["package"].(string)
	if relative == "" {
		return nil, nil, httpxNotFound("This version has no built package — run a build first.")
	}
	dir := s.dataDir
	if dir == "" {
		dir = ".data"
	}
	data, err := os.ReadFile(filepath.Join(dir, relative))
	if err != nil {
		return nil, nil, httpxNotFound("The built package file is missing — rebuild the extension.")
	}
	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	if recorded, _ := source["checksum"].(string); recorded != "" && recorded != checksum {
		return nil, nil, fmt.Errorf("extension: aix: checksum mismatch for stored package")
	}
	return data, []byte(checksum), nil
}

// ---- install registry ---------------------------------------------------------------

// Install pins an extension into the caller's installed set (free
// ecosystem; the paid flow arrives with the commerce phase).
func (s *Service) Install(ctx context.Context, userID, id string) (*Extension, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	found, err := s.store.FindForOwnerAny(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: install: %w", err)
	}
	// Drafts are private work — only published extensions are installable.
	if found.Status != StatusPublished {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation,
			"This extension is not published yet — only published extensions can be installed.")
	}
	version := found.CurrentVersion
	if err := s.store.Install(ctx, userID, found.ID, version); err != nil {
		return nil, fmt.Errorf("extension: install: %w", err)
	}
	return found, nil
}

// Uninstall removes the pin.
func (s *Service) Uninstall(ctx context.Context, userID, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	if err := s.store.Uninstall(ctx, userID, id); err != nil {
		return fmt.Errorf("extension: uninstall: %w", err)
	}
	return nil
}

// Installed lists the caller's installed extensions with owner names.
func (s *Service) Installed(ctx context.Context, userID string) ([]Extension, error) {
	items, err := s.store.InstalledForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("extension: installed: %w", err)
	}
	return items, nil
}

var _ = sql.ErrNoRows
