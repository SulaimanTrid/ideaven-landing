package extension

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"ideaven/apps/api/internal/extsrc"
	"ideaven/apps/api/internal/httpx"
)

// Build pipeline (Task 06). The API orchestrates but never packages
// in-process: it spawns the isolated worker (cmd/extbuild) as its own
// process — worker resolution order:
//  1. $EXT_BUILD_BIN (production: the compiled worker binary)
//  2. `go run ./cmd/extbuild` (dev/test: Go toolchain present)
//
// The worker streams NDJSON events (state / log / result) on stdout; the
// API relays every event as it arrives — never synthesizing progress — and
// records the run in extension_builds, the real build history. Built
// packages live on disk under dataDir/extensions/<slug>/ and are verified
// again before download.

// Build pipeline states (emitted by the worker when each step actually
// starts; the UI renders exactly these). idle belongs to the client before
// a run starts.
const (
	BuildStateValidating   = "validating"
	BuildStateSource       = "source-validation"
	BuildStateDependencies = "resolving-dependencies"
	BuildStateCompiling    = "compiling"
	BuildStatePackaging    = "packaging"
	BuildStateVerifying    = "verifying"
	BuildStateSuccess      = "success"
	BuildStateFailed       = "failed"
	BuildStateCancelled    = "cancelled"
)

// Build record statuses (extension_builds.status).
const (
	RecordRunning   = "running"
	RecordSuccess   = "success"
	RecordFailed    = "failed"
	RecordCancelled = "cancelled"
)

// MaxArtifactBytes bounds both an artifact accepted from the worker and a
// previously stored artifact read back for download. Authored payloads are
// capped at 512 KiB, so this leaves generous room for the zip container while
// making a swapped or corrupt artifact unable to consume unbounded memory.
const MaxArtifactBytes = 2 << 20

var errArtifactAlreadyExists = errors.New("artifact already exists")

// Conflict actions — only these are actually supported by backend behavior.
const (
	ConflictUseExisting = "use-existing"   // keep the already-built version and download it
	ConflictChangeVer   = "change-version" // edit the version (client-side), then rebuild
	ConflictBumpPatch   = "bump-patch"     // rebuild as the suggested next patch version
)

// BuildLog is one pipeline step result shown in the Studio.
type BuildLog struct {
	Step    string `json:"step"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

// BuildResult is the outcome of one build run (wire shape of the
// non-streaming endpoint, kept for compatibility).
type BuildResult struct {
	OK         bool          `json:"ok"`
	Version    string        `json:"version"`
	Logs       []BuildLog    `json:"logs"`
	Checksum   string        `json:"checksum,omitempty"`
	Size       int           `json:"size,omitempty"`
	Error      string        `json:"error,omitempty"`
	FailedStep string        `json:"failedStep,omitempty"`
	Conflict   *ConflictInfo `json:"conflict,omitempty"`
}

// ConflictInfo explains a version collision and offers the actions the
// backend actually supports.
type ConflictInfo struct {
	Version     string           `json:"version"`
	BuiltAt     string           `json:"builtAt,omitempty"`
	Suggestions []ConflictAction `json:"suggestions"`
}

// ConflictAction is one resolvable choice for a version collision.
type ConflictAction struct {
	Action  string `json:"action"`
	Label   string `json:"label"`
	Version string `json:"version,omitempty"` // bump-patch: the suggested next version
}

// BuildEvent is one streamed build event (SSE from the streaming endpoint).
// Type is state | log | result | conflict; exactly one terminal event per
// run (result or conflict).
type BuildEvent struct {
	Type    string `json:"type"`
	State   string `json:"state,omitempty"` // state events: the pipeline state entered
	Step    string `json:"step,omitempty"`
	Level   string `json:"level,omitempty"`
	Message string `json:"message,omitempty"`
	BuildID string `json:"buildId,omitempty"`

	// Terminal payload (result). AIXBase64 arrives from the worker only and
	// is never re-emitted to clients.
	OK         bool          `json:"ok,omitempty"`
	Version    string        `json:"version,omitempty"`
	AIXBase64  string        `json:"aixBase64,omitempty"`
	Checksum   string        `json:"checksum,omitempty"`
	Size       int           `json:"size,omitempty"`
	Error      string        `json:"error,omitempty"`
	FailedStep string        `json:"failedStep,omitempty"`
	Conflict   *ConflictInfo `json:"conflict,omitempty"`
}

// BuildRecord is one real build run (success, failure, or cancellation) —
// the build history shown in the Studio.
type BuildRecord struct {
	ID          string     `json:"id"`
	ExtensionID string     `json:"extensionId"`
	Version     string     `json:"version"`
	Status      string     `json:"status"`
	FailedStep  string     `json:"failedStep,omitempty"`
	Error       string     `json:"error,omitempty"`
	Logs        []BuildLog `json:"logs"`
	Checksum    string     `json:"checksum,omitempty"`
	Size        int        `json:"size,omitempty"`
	Changelog   string     `json:"changelog,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
}

// ---- build record store ------------------------------------------------------------

const recordColumns = `id, extension_id, version, status, failed_step, error, logs, checksum, size, changelog, created_at, finished_at`

// qualifiedRecordColumns is recordColumns for queries that JOIN extensions —
// both tables share id/version/created_at, so every column must be scoped.
const qualifiedRecordColumns = `b.id, b.extension_id, b.version, b.status, b.failed_step, b.error, b.logs, b.checksum, b.size, b.changelog, b.created_at, b.finished_at`

func scanRecord(row interface{ Scan(...any) error }) (*BuildRecord, error) {
	var r BuildRecord
	var rawLogs []byte
	if err := row.Scan(&r.ID, &r.ExtensionID, &r.Version, &r.Status, &r.FailedStep,
		&r.Error, &rawLogs, &r.Checksum, &r.Size, &r.Changelog, &r.CreatedAt, &r.FinishedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("extension: build record scan: %w", err)
	}
	r.Logs = []BuildLog{}
	if len(rawLogs) > 0 {
		_ = json.Unmarshal(rawLogs, &r.Logs)
	}
	return &r, nil
}

// CreateBuildRecord opens a running build row before the worker starts, so
// even a crash mid-build leaves a real trace.
func (s *Store) CreateBuildRecord(ctx context.Context, extensionID, version, changelog string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO extension_builds (extension_id, version, status, changelog)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		extensionID, version, RecordRunning, changelog).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("extension: create build record: %w", err)
	}
	return id, nil
}

// FinishBuildRecord closes a build row with its real outcome.
func (s *Store) FinishBuildRecord(ctx context.Context, id, status, failedStep, errMsg string, logs []BuildLog, checksum string, size int) error {
	rawLogs, err := json.Marshal(logs)
	if err != nil {
		rawLogs = []byte("[]")
	}
	if _, err := s.db.ExecContext(ctx, `
		UPDATE extension_builds
		SET status = $2, failed_step = $3, error = $4, logs = $5, checksum = $6, size = $7, finished_at = now()
		WHERE id = $1`, id, status, failedStep, errMsg, rawLogs, checksum, size); err != nil {
		return fmt.Errorf("extension: finish build record: %w", err)
	}
	return nil
}

// BuildsByExtension lists real build runs, newest first, owner-scoped via
// the JOIN (existence is never leaked).
func (s *Store) BuildsByExtension(ctx context.Context, ownerID, extensionID string, limit int) ([]BuildRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+qualifiedRecordColumns+` FROM extension_builds b
		JOIN extensions e ON e.id = b.extension_id
		WHERE b.extension_id = $1 AND e.owner_id = $2
		ORDER BY b.created_at DESC LIMIT $3`, extensionID, ownerID, limit)
	if err != nil {
		return nil, fmt.Errorf("extension: builds: %w", err)
	}
	defer rows.Close()
	out := []BuildRecord{}
	for rows.Next() {
		found, err := scanRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *found)
	}
	return out, rows.Err()
}

// FindBuildRecord loads one build record owner-scoped (JOIN — foreign rows
// answer not-found).
func (s *Store) FindBuildRecord(ctx context.Context, ownerID, recordID string) (*BuildRecord, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT `+qualifiedRecordColumns+` FROM extension_builds b
		JOIN extensions e ON e.id = b.extension_id
		WHERE b.id = $1 AND e.owner_id = $2`, recordID, ownerID)
	found, err := scanRecord(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, httpxNotFound("This build record does not exist or is not yours.")
		}
		return nil, err
	}
	return found, nil
}

// VersionExists reports whether an immutable version row already exists for
// the extension — and whether that version actually carries a built package
// (the row Create seeds is a stub with no package, so "use existing" must
// not be offered for it). This is the basis for conflict handling.
func (s *Store) VersionExists(ctx context.Context, extensionID, version string) (bool, time.Time, bool, error) {
	var builtAt time.Time
	var source []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT created_at, source FROM extension_versions WHERE extension_id = $1 AND version = $2`,
		extensionID, version).Scan(&builtAt, &source)
	if errors.Is(err, sql.ErrNoRows) {
		return false, time.Time{}, false, nil
	}
	if err != nil {
		return false, time.Time{}, false, fmt.Errorf("extension: version exists: %w", err)
	}
	var meta map[string]any
	_ = json.Unmarshal(source, &meta)
	_, hasPackage := meta["package"]
	return true, builtAt, hasPackage, nil
}

// ---- worker ------------------------------------------------------------------------

// resolveWorker finds the isolated build worker command.
func resolveWorker() []string {
	if bin := os.Getenv("EXT_BUILD_BIN"); bin != "" {
		return []string{bin}
	}
	return []string{"go", "run", "./cmd/extbuild"}
}

// workerEnv whitelists the environment the build worker may see. The worker
// never executes untrusted code (structural analysis only), but isolation
// starts with not handing the build process the server's full environment.
func workerEnv() []string {
	keep := []string{"PATH", "HOME", "GOCACHE", "GOPATH", "GOPROXY", "GOTOOLCHAIN", "GOMODCACHE", "TMPDIR"}
	env := os.Environ()
	out := make([]string, 0, len(keep))
	for _, entry := range env {
		name, _, _ := strings.Cut(entry, "=")
		for _, k := range keep {
			if name == k {
				out = append(out, entry)
				break
			}
		}
	}
	return out
}

// startWorker prepares the isolated worker in its own process group with a
// streaming stdout pipe. Cancel kills the whole group (the go-run fallback
// spawns children), WaitDelay reaps stragglers, and the 120s bound caps
// every run.
func startWorker(ctx context.Context, job []byte) (*exec.Cmd, context.CancelFunc, *bytes.Buffer, io.ReadCloser, error) {
	argv := resolveWorker()
	ctxTimeout, cancel := context.WithTimeout(ctx, 120*time.Second)
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
	cmd.Env = workerEnv()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 5 * time.Second
	// Kill the whole process group on timeout/cancellation.
	cmd.Cancel = func() error {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		return ctxTimeout.Err()
	}
	stderr := &bytes.Buffer{}
	cmd.Stderr = stderr
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, cancel, nil, nil, fmt.Errorf("worker stdout pipe: %w", err)
	}
	return cmd, cancel, stderr, pipe, nil
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

// conflictActions lists what the backend genuinely supports for a version
// that already exists. "Use existing" is offered only when that version
// actually carries a downloadable package.
func conflictActionsFor(hasPackage bool, suggested string) []ConflictAction {
	actions := []ConflictAction{}
	if hasPackage {
		actions = append(actions, ConflictAction{Action: ConflictUseExisting, Label: "Use existing"})
	}
	actions = append(actions, ConflictAction{Action: ConflictChangeVer, Label: "Change version"})
	if suggested != "" {
		actions = append(actions, ConflictAction{Action: ConflictBumpPatch, Label: "Create new patch version", Version: suggested})
	}
	return actions
}

// buildRun carries one build's context through the pipeline. Per-run state
// never lives on the shared Service — concurrent builds stay independent.
type buildRun struct {
	service   *Service
	ownerID   string
	ext       *Extension
	version   string
	changelog string
	buildID   string
	logs      []BuildLog // real worker logs, persisted with the record
	state     string     // latest state actually emitted by the worker
}

// StreamBuild runs the full pipeline for one owned extension, streaming
// every real state/log event to emit as it happens:
//
//	validating → source-validation → resolving-dependencies → compiling →
//	packaging → verifying → success | failed | cancelled
//
// The version-existence pre-check runs before the worker: an existing
// version produces a terminal conflict event with the supported actions —
// the worker is never spent on a version that cannot be recorded.
func (s *Service) StreamBuild(ctx context.Context, ownerID, id string, version, changelog string, emit func(BuildEvent) error) error {
	if err := validateID(id); err != nil {
		return err
	}
	found, err := s.store.FindForOwner(ctx, ownerID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return notFound()
		}
		return fmt.Errorf("extension: build: %w", err)
	}

	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		trimmed = bumpPatch(found.CurrentVersion)
	}
	if !versionPattern.MatchString(trimmed) {
		_ = emit(BuildEvent{Type: "result", OK: false, Version: trimmed,
			Error: "Versions must be semver-ish (e.g. 0.2.0).", FailedStep: "version"})
		return nil
	}

	// Version conflict pre-check — before any work is spent.
	exists, builtAt, hasPackage, err := s.store.VersionExists(ctx, found.ID, trimmed)
	if err != nil {
		return fmt.Errorf("extension: build: %w", err)
	}
	if exists {
		conflict := &ConflictInfo{
			Version:     trimmed,
			Suggestions: conflictActionsFor(hasPackage, bumpPatch(trimmed)),
		}
		if !builtAt.IsZero() {
			conflict.BuiltAt = builtAt.UTC().Format(time.RFC3339)
		}
		return emit(BuildEvent{Type: "conflict", Version: trimmed, Conflict: conflict})
	}

	run := &buildRun{
		service:   s,
		ownerID:   ownerID,
		ext:       found,
		version:   trimmed,
		changelog: strings.TrimSpace(changelog),
	}

	// Open the real build record (running) so the run is traceable from the
	// first moment.
	run.buildID, err = s.store.CreateBuildRecord(ctx, found.ID, trimmed, run.changelog)
	if err != nil {
		return fmt.Errorf("extension: build: %w", err)
	}

	// Dependency resolution inputs: registry snapshot of published versions.
	snapshot, err := s.store.RegistrySnapshot(ctx)
	if err != nil {
		return s.prepareFailed(run, emit, "dependencies", "could not read the dependency registry: "+err.Error())
	}
	manifest := Manifest{}
	if err := json.Unmarshal(found.Manifest, &manifest); err != nil {
		return s.prepareFailed(run, emit, "manifest", "the stored manifest could not be read: "+err.Error())
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
		"source":           found.Source,
		"dependencies":     deps,
		"registrySnapshot": snapshot,
	})
	if err != nil {
		return s.prepareFailed(run, emit, "packaging", "could not prepare the build: "+err.Error())
	}

	// Spawn the isolated worker and relay its real events as they happen.
	cmd, cancel, stderr, pipe, err := startWorker(ctx, job)
	if err != nil {
		return fmt.Errorf("extension: build: %w", err)
	}
	defer cancel()
	return s.runPipeline(ctx, run, cmd, pipe, stderr, emit)
}

// prepareFailed makes pre-worker failures terminal too. The streaming handler
// has already opened its SSE response, so returning a bare error here would
// leave the client spinning and the history row marked running forever.
func (s *Service) prepareFailed(run *buildRun, emit func(BuildEvent) error, step, message string) error {
	state := stateForStep(step)
	_ = s.store.FinishBuildRecord(context.Background(), run.buildID, RecordFailed,
		state, message, run.logs, "", 0)
	return emit(BuildEvent{Type: "result", OK: false, Version: run.version, BuildID: run.buildID,
		Error: message, FailedStep: state})
}

// runPipeline streams the worker's NDJSON events to emit the moment each is
// parsed, then persists the terminal outcome and emits the final result.
// The worker owns the pipeline states — the API relays, never synthesizes.
func (s *Service) runPipeline(ctx context.Context, run *buildRun, cmd *exec.Cmd, pipe io.ReadCloser, stderr *bytes.Buffer, emit func(BuildEvent) error) error {
	if err := cmd.Start(); err != nil {
		message := "the build worker could not start: " + err.Error()
		_ = s.store.FinishBuildRecord(context.Background(), run.buildID, RecordFailed,
			"spawn", message, run.logs, "", 0)
		_ = emit(BuildEvent{Type: "result", OK: false, Version: run.version, BuildID: run.buildID,
			Error: message, FailedStep: "spawn"})
		return nil
	}

	var terminal *BuildEvent
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024) // AIX results can be sizable
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var ev BuildEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			continue // stray worker noise is never surfaced as progress
		}
		if ev.Type == "result" {
			terminal = &ev
			break // the terminal line ends the stream
		}
		if ev.Type == "state" {
			run.state = ev.State
		}
		if ev.Type == "log" {
			run.logs = append(run.logs, BuildLog{Step: ev.Step, Level: ev.Level, Message: ev.Message})
		}
		ev.BuildID = run.buildID
		if err := emit(ev); err != nil {
			// The client stopped listening (disconnect) — kill the worker and
			// close the record as cancelled.
			if cmd.Cancel != nil {
				_ = cmd.Cancel()
			}
			_ = cmd.Wait()
			s.recordInterrupted(ctx, run)
			return err
		}
	}

	// Stdout is done (or the terminal line arrived); reap the process.
	waitErr := cmd.Wait()

	if terminal == nil {
		// No verdict from the worker: cancelled (client/ctx) or crashed.
		message := strings.TrimSpace(stderr.String())
		if waitErr != nil && message == "" {
			message = waitErr.Error()
		}
		if message == "" {
			message = "the build worker exited without a result"
		}
		failedStep := s.lastState(run)
		status := RecordFailed
		if ctx.Err() != nil {
			status = RecordCancelled
			message = "Build cancelled."
			failedStep = ""
		}
		_ = s.store.FinishBuildRecord(context.Background(), run.buildID, status,
			failedStep, message, run.logs, "", 0)
		_ = emit(BuildEvent{Type: "result", OK: false, Version: run.version, BuildID: run.buildID,
			Error: message, FailedStep: failedStep})
		return nil
	}
	return s.finalizeRun(run, terminal, emit)
}

// lastState names the furthest pipeline step the run actually reached,
// derived from the real worker logs.
func (s *Service) lastState(run *buildRun) string {
	if run.state != "" {
		return run.state
	}
	if len(run.logs) == 0 {
		return "spawn"
	}
	return stateForStep(run.logs[len(run.logs)-1].Step)
}

// stateForStep maps the worker's step names onto the build states the UI
// renders, so failures always report the state the run died in.
func stateForStep(step string) string {
	switch step {
	case "manifest":
		return BuildStateValidating
	case "source":
		return BuildStateSource
	case "dependencies":
		return BuildStateDependencies
	case "compile":
		return BuildStateCompiling
	case "package":
		return BuildStatePackaging
	case "verify":
		return BuildStateVerifying
	default:
		return step
	}
}

// recordInterrupted closes the build record when the run never reached a
// worker verdict: cancelled on client/ctx cancellation, failed otherwise.
func (s *Service) recordInterrupted(ctx context.Context, run *buildRun) {
	status := RecordFailed
	reason := "The build worker exited before producing a result."
	if ctx.Err() != nil {
		status = RecordCancelled
		reason = "Build cancelled."
	}
	err := run.service.store.FinishBuildRecord(context.Background(), run.buildID, status,
		"", reason, run.logs, "", 0)
	if err != nil {
		fmt.Println("extension: build record close failed:", err.Error())
	}
}

// finalizeRun persists the terminal outcome: on success it stores the AIX,
// snapshots the immutable version row, and closes the record as success; on
// failure it closes the record as failed. The final event is emitted with
// the persisted result attached.
func (s *Service) finalizeRun(run *buildRun, terminal *BuildEvent, emit func(BuildEvent) error) error {
	result := *terminal
	result.Version = run.version
	result.BuildID = run.buildID
	result.FailedStep = stateForStep(result.FailedStep)

	closeFailed := func(step, message string) {
		_ = run.service.store.FinishBuildRecord(context.Background(), run.buildID, RecordFailed,
			step, message, run.logs, "", 0)
	}

	if !result.OK {
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}

	aix, err := base64.StdEncoding.DecodeString(terminal.AIXBase64)
	if err != nil {
		result.OK = false
		result.Error = "build worker returned an unreadable package"
		result.FailedStep = BuildStatePackaging
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}
	if len(aix) == 0 || len(aix) > MaxArtifactBytes {
		result.OK = false
		result.Error = "build worker returned a package outside the allowed size"
		result.FailedStep = BuildStatePackaging
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}
	checksum := sha256.Sum256(aix)
	actualChecksum := hex.EncodeToString(checksum[:])
	if terminal.Checksum == "" || !strings.EqualFold(terminal.Checksum, actualChecksum) {
		result.OK = false
		result.Error = "build worker returned a package with an invalid checksum"
		result.FailedStep = BuildStateVerifying
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}
	if terminal.Size != len(aix) {
		result.OK = false
		result.Error = "build worker returned a package with an invalid size"
		result.FailedStep = BuildStateVerifying
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}
	if err := verifyStoredAIX(aix, run.ext.Slug, run.version); err != nil {
		result.OK = false
		result.Error = "the generated package did not pass server verification"
		result.FailedStep = BuildStateVerifying
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}
	result.Checksum = actualChecksum
	result.Size = len(aix)

	relative, err := run.service.storePackage(run.ext.Slug, run.version, aix)
	if errors.Is(err, errArtifactAlreadyExists) {
		// An artifact file is already on disk. That is only a real conflict
		// when the version row exists too. An orphaned file (its extension
		// was deleted, the database was reset, or a run crashed before its
		// SaveVersion) must not phantom-conflict forever — replace it.
		exists, _, _, lookupErr := run.service.store.VersionExists(context.Background(), run.ext.ID, run.version)
		if lookupErr == nil && !exists {
			if replaceErr := run.service.replacePackage(run.ext.Slug, run.version, aix); replaceErr == nil {
				relative = artifactRelativePath(run.ext.Slug, run.version)
				err = nil
			}
		}
	}
	if err != nil {
		if errors.Is(err, errArtifactAlreadyExists) {
			_, _, hasPackage, lookupErr := run.service.store.VersionExists(context.Background(), run.ext.ID, run.version)
			result.OK = false
			result.Error = "This version already exists."
			result.FailedStep = "version"
			result.Conflict = &ConflictInfo{
				Version:     run.version,
				Suggestions: conflictActionsFor(lookupErr == nil && hasPackage, bumpPatch(run.version)),
			}
			closeFailed(result.FailedStep, "version "+run.version+" already exists")
			result.AIXBase64 = ""
			return emit(result)
		}
		result.OK = false
		result.Error = "the verified package could not be stored"
		result.FailedStep = BuildStatePackaging
		closeFailed(result.FailedStep, result.Error)
		result.AIXBase64 = ""
		return emit(result)
	}

	// Snapshot the immutable version row; build metadata rides inside
	// source. A unique violation here means the version was recorded between
	// the pre-check and now — surface it as a real conflict.
	source, _ := json.Marshal(map[string]any{
		"package":  relative,
		"checksum": result.Checksum,
		"size":     len(aix),
		"builtAt":  time.Now().UTC().Format(time.RFC3339),
	})
	_, saveErr := run.service.store.SaveVersion(context.Background(), run.ownerID, run.ext.ID,
		run.version, run.ext.Manifest, source, run.changelog)
	if saveErr != nil {
		result.OK = false
		result.Error = "This version already exists."
		result.FailedStep = "version"
		result.Conflict = &ConflictInfo{
			Version:     run.version,
			Suggestions: conflictActionsFor(true, bumpPatch(run.version)),
		}
		closeFailed("version", "version "+run.version+" already exists")
		result.AIXBase64 = ""
		return emit(result)
	}

	if err := run.service.store.FinishBuildRecord(context.Background(), run.buildID, RecordSuccess,
		"", "", run.logs, result.Checksum, result.Size); err != nil {
		return err
	}
	result.AIXBase64 = "" // the package streams via the download endpoint only
	return emit(result)
}

// Builds lists one owned extension's real build history.
func (s *Service) Builds(ctx context.Context, ownerID, id string, limit int) ([]BuildRecord, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	if _, err := s.store.FindForOwner(ctx, ownerID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: builds: %w", err)
	}
	return s.store.BuildsByExtension(ctx, ownerID, id, limit)
}

// Build runs the pipeline to completion and returns the final result — the
// wire shape of the non-streaming endpoint (kept for compatibility).
func (s *Service) Build(ctx context.Context, ownerID, id string, version, changelog string) (*BuildResult, error) {
	var result *BuildResult
	var logs []BuildLog
	emit := func(ev BuildEvent) error {
		switch ev.Type {
		case "log":
			logs = append(logs, BuildLog{Step: ev.Step, Level: ev.Level, Message: ev.Message})
		case "conflict":
			result = &BuildResult{OK: false, Version: ev.Version, Conflict: ev.Conflict}
		case "result":
			result = &BuildResult{
				OK: ev.OK, Version: ev.Version, Checksum: ev.Checksum, Size: ev.Size,
				Error: ev.Error, FailedStep: ev.FailedStep, Conflict: ev.Conflict,
			}
		}
		return nil
	}
	if err := s.StreamBuild(ctx, ownerID, id, version, changelog, emit); err != nil {
		return nil, err
	}
	if result == nil {
		return &BuildResult{OK: false, Version: version, Error: "the build produced no result"}, nil
	}
	result.Logs = logs
	return result, nil
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
	if len(aix) == 0 || len(aix) > MaxArtifactBytes {
		return "", fmt.Errorf("artifact size is outside the allowed range")
	}
	dir := s.dataDir
	if dir == "" {
		dir = ".data"
	}
	folder := filepath.Join(dir, "extensions", slug)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return "", err
	}
	relative := artifactRelativePath(slug, version)
	target := filepath.Join(dir, filepath.FromSlash(relative))
	// A temporary file plus an exclusive link means readers only ever observe
	// complete, verified artifacts. Link refuses to replace an existing target,
	// so two concurrent builds can never overwrite each other's artifact.
	temp, err := os.CreateTemp(folder, "."+version+"-*.aix.tmp")
	if err != nil {
		return "", err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if _, err := temp.Write(aix); err != nil {
		temp.Close()
		return "", err
	}
	if err := temp.Chmod(0o644); err != nil {
		temp.Close()
		return "", err
	}
	if err := temp.Close(); err != nil {
		return "", err
	}
	if err := os.Link(tempName, target); err != nil {
		if errors.Is(err, os.ErrExist) {
			return "", errArtifactAlreadyExists
		}
		return "", err
	}
	return relative, nil
}

// replacePackage overwrites an orphaned artifact — one whose version row no
// longer exists (deleted extension, reset database, or a run that crashed
// before its SaveVersion). The store must never surface that stale file as a
// version conflict. The remove+link window is only reachable by a concurrent
// build of the same extension and version, whose success is serialized by the
// extension_versions unique constraint anyway; the bytes are identical inputs.
func (s *Service) replacePackage(slug, version string, aix []byte) error {
	if len(aix) == 0 || len(aix) > MaxArtifactBytes {
		return fmt.Errorf("artifact size is outside the allowed range")
	}
	dir := s.dataDir
	if dir == "" {
		dir = ".data"
	}
	folder := filepath.Join(dir, "extensions", slug)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return err
	}
	relative := artifactRelativePath(slug, version)
	target := filepath.Join(dir, filepath.FromSlash(relative))
	temp, err := os.CreateTemp(folder, "."+version+"-*.aix.tmp")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if _, err := temp.Write(aix); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Chmod(0o644); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Remove(target); err != nil {
		return err
	}
	return os.Link(tempName, target)
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
	recordedPath, _ := source["package"].(string)
	relative := artifactRelativePath(found.Slug, want)
	// Version metadata can also be created through the older manual Version
	// endpoint, so it is untrusted input here. Never use it as a filesystem
	// path: an artifact is valid only at its deterministic store location.
	if recordedPath == "" {
		return nil, nil, httpxNotFound("This version has no built package — run a build first.")
	}
	if recordedPath != relative {
		return nil, nil, httpxNotFound("This version has no trusted built package — rebuild the extension.")
	}
	dir := s.dataDir
	if dir == "" {
		dir = ".data"
	}
	path := filepath.Join(dir, filepath.FromSlash(relative))
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > MaxArtifactBytes {
		return nil, nil, httpxNotFound("The built package file is missing — rebuild the extension.")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, httpxNotFound("The built package file is missing — rebuild the extension.")
	}
	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	if recorded, _ := source["checksum"].(string); recorded != "" && recorded != checksum {
		return nil, nil, fmt.Errorf("extension: aix: checksum mismatch for stored package")
	}
	if err := verifyStoredAIX(data, found.Slug, want); err != nil {
		return nil, nil, fmt.Errorf("extension: aix: stored package verification: %w", err)
	}
	return data, []byte(checksum), nil
}

// artifactRelativePath is the only naming scheme accepted for built
// artifacts. Both pieces are validated before a worker is launched, and the
// extension slug is generated by the service, so this stays inside dataDir.
func artifactRelativePath(slug, version string) string {
	return filepath.ToSlash(filepath.Join("extensions", slug, version+".aix"))
}

// verifyStoredAIX reopens an artifact at the security boundary before it is
// persisted and again before it is downloaded. The worker performs the same
// checks, but the API must not turn a disk-corrupted or substituted archive
// into a trusted download merely because its database checksum was changed.
func verifyStoredAIX(aix []byte, slug, version string) error {
	if len(aix) == 0 || len(aix) > MaxArtifactBytes {
		return fmt.Errorf("artifact size is outside the allowed range")
	}
	archive, err := zip.NewReader(bytes.NewReader(aix), int64(len(aix)))
	if err != nil {
		return fmt.Errorf("artifact is not a readable zip: %w", err)
	}
	allowed := map[string]bool{
		"manifest.json":  true,
		"docs.md":        true,
		"meta.json":      true,
		"src/main.java":  true,
		"src/source.txt": true,
	}
	files := make(map[string]*zip.File, len(archive.File))
	for _, file := range archive.File {
		if !allowed[file.Name] || files[file.Name] != nil {
			return fmt.Errorf("artifact has an invalid package entry %q", file.Name)
		}
		files[file.Name] = file
	}
	for _, required := range []string{"manifest.json", "docs.md", "meta.json"} {
		if files[required] == nil {
			return fmt.Errorf("artifact is missing %s", required)
		}
	}
	if files["src/main.java"] != nil && files["src/source.txt"] != nil {
		return fmt.Errorf("artifact contains more than one source entry")
	}

	manifestRaw, err := readArchiveMember(files["manifest.json"])
	if err != nil {
		return err
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestRaw, &manifest); err != nil {
		return fmt.Errorf("packaged manifest is invalid JSON: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return fmt.Errorf("packaged manifest is invalid: %w", err)
	}

	metaRaw, err := readArchiveMember(files["meta.json"])
	if err != nil {
		return err
	}
	var meta struct {
		Slug    string `json:"slug"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(metaRaw, &meta); err != nil {
		return fmt.Errorf("packaged metadata is invalid JSON: %w", err)
	}
	if meta.Slug != slug || meta.Version != version {
		return fmt.Errorf("packaged identity does not match the requested artifact")
	}

	for _, name := range []string{"src/main.java", "src/source.txt"} {
		if files[name] == nil {
			continue
		}
		source, err := readArchiveMember(files[name])
		if err != nil {
			return err
		}
		if problems := extsrc.Analyze(string(source)); len(problems) > 0 {
			return fmt.Errorf("packaged source does not pass structural compile: %s", problems[0].Message)
		}
	}
	return nil
}

func readArchiveMember(file *zip.File) ([]byte, error) {
	if file == nil || file.UncompressedSize64 > MaxArtifactBytes {
		return nil, fmt.Errorf("artifact member is missing or too large")
	}
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, MaxArtifactBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxArtifactBytes {
		return nil, fmt.Errorf("artifact member is too large")
	}
	return data, nil
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
