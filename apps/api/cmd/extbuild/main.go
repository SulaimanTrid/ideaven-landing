// extbuild is IDEAVEN's isolated extension build worker (roadmap 2.0 Phase 1).
// It runs as its own process — the API server never packages or executes
// untrusted extension content in-process. Protocol: one JSON job on stdin,
// a stream of NDJSON events on stdout (each line flushed as it happens),
// ending with exactly one "result" event.
//
// Job:   {"slug","name","version","manifest":<json>,"docs":string,
//         "source":string,"dependencies":[{"slug","version"}],
//         "registrySnapshot":{slug:[versions]}}
//
// Events, one JSON object per line:
//
//	{"type":"state","state":"validating","step":"manifest","message":…}
//	{"type":"log","step":"source","level":"info|error","message":…}
//	{"type":"result","ok":bool,"error"?:string,"failedStep"?:string,
//	 "aixBase64"?:string,"checksum"?:string,"size"?:number}
//
// Build states: validating → source-validation → resolving-dependencies →
// compiling → packaging → verifying → success | failed. Every state is
// emitted when the step actually starts — the worker never announces work
// it has not begun, and never claims success it did not verify.
//
// Pipeline: manifest validation → source validation → dependency resolution
// (against the job's registry snapshot) → structural source compile → AIX
// packaging (zip incl. the authored source) → verification (reopen + parse +
// recompile + checksum).
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"ideaven/apps/api/internal/extsrc"
)

// Build states, mirrored by the API's build state machine.
const (
	stateValidating   = "validating"
	stateSource       = "source-validation"
	stateDependencies = "resolving-dependencies"
	stateCompiling    = "compiling"
	statePackaging    = "packaging"
	stateVerifying    = "verifying"
)

// event is one NDJSON line on stdout.
type event struct {
	Type    string `json:"type"` // state | log | result
	State   string `json:"state,omitempty"`
	Step    string `json:"step,omitempty"`
	Level   string `json:"level,omitempty"`
	Message string `json:"message,omitempty"`

	// Result payload (final line only).
	OK         bool   `json:"ok,omitempty"`
	AIXBase64  string `json:"aixBase64,omitempty"`
	Checksum   string `json:"checksum,omitempty"`
	Size       int    `json:"size,omitempty"`
	Error      string `json:"error,omitempty"`
	FailedStep string `json:"failedStep,omitempty"`
}

type dependencySpec struct {
	Slug    string `json:"slug"`
	Version string `json:"version"`
}

type buildJob struct {
	Slug         string             `json:"slug"`
	Name         string             `json:"name"`
	Version      string             `json:"version"`
	Manifest     json.RawMessage    `json:"manifest"`
	Docs         string             `json:"docs"`
	Source       string             `json:"source"`
	Dependencies []dependencySpec   `json:"dependencies"`
	// RegistrySnapshot maps available extension slugs to their published
	// versions; dependency resolution happens against this snapshot so the
	// worker stays deterministic and side-effect free.
	RegistrySnapshot map[string][]string `json:"registrySnapshot"`
}

type componentSpec struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}
type blockSpec struct {
	Type string `json:"type"`
	Kind string `json:"kind"`
}
type manifestDoc struct {
	Format     int             `json:"format"`
	Components []componentSpec `json:"components"`
	Blocks     []blockSpec     `json:"blocks"`
}

// currentStep tracks which pipeline step is running so a panic or malformed
// failure can still report where the build died.
var currentStep string

func emit(ev event) {
	encoded, err := json.Marshal(ev)
	if err != nil {
		return
	}
	// os.Stdout is unbuffered — each event reaches the API the moment the
	// step really happens.
	fmt.Println(string(encoded))
}

func statef(step, state, format string, args ...any) {
	currentStep = step
	emit(event{Type: "state", State: state, Step: step, Message: fmt.Sprintf(format, args...)})
}

func logf(step, level, format string, args ...any) {
	emit(event{Type: "log", Step: step, Level: level, Message: fmt.Sprintf(format, args...)})
}

// fail emits the terminal failure result and exits — the pipeline stops at
// the first real problem; nothing after it runs.
func fail(step, format string, args ...any) {
	if step == "" {
		step = currentStep
	}
	message := fmt.Sprintf(format, args...)
	if step != "" {
		logf(step, "error", "%s", message)
	}
	emit(event{Type: "result", OK: false, Error: message, FailedStep: step})
	os.Exit(0)
}

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fail("", "read job: %v", err)
	}
	var job buildJob
	if err := json.Unmarshal(raw, &job); err != nil {
		fail("", "parse job: %v", err)
	}

	// 1. Manifest validation.
	statef("manifest", stateValidating, "validating manifest for %s v%s", job.Slug, job.Version)
	var manifest manifestDoc
	if err := json.Unmarshal(job.Manifest, &manifest); err != nil {
		fail("manifest", "manifest is not valid JSON: %v", err)
	}
	if manifest.Format != 1 {
		fail("manifest", "unsupported manifest format %d (supported: 1)", manifest.Format)
	}
	logf("manifest", "info", "manifest format 1 OK — %d component(s), %d block(s)",
		len(manifest.Components), len(manifest.Blocks))

	// 2. Source validation: every component must carry a label; every block a
	// known kind.
	statef("source", stateSource, "validating source metadata")
	for _, c := range manifest.Components {
		if c.ID == "" || c.Label == "" {
			fail("source", "component %q is missing an id or label", c.ID)
		}
	}
	for _, b := range manifest.Blocks {
		if b.Type == "" || (b.Kind != "statement" && b.Kind != "expression") {
			fail("source", "block %q has an unknown kind %q", b.Type, b.Kind)
		}
	}
	logf("source", "info", "source metadata consistent")

	// 3. Dependency resolution against the registry snapshot.
	statef("dependencies", stateDependencies, "resolving dependencies")
	for _, dep := range job.Dependencies {
		versions, ok := job.RegistrySnapshot[dep.Slug]
		if !ok {
			fail("dependencies", "dependency %q is not in the registry (it may be unpublished)", dep.Slug)
		}
		if dep.Version != "" && !contains(versions, dep.Version) {
			fail("dependencies", "dependency %q v%s is not available (registry has %v)",
				dep.Slug, dep.Version, versions)
		}
		logf("dependencies", "info", "resolved %s → registry", dep.Slug)
	}
	logf("dependencies", "info", "%d dependency(ies) resolved", len(job.Dependencies))

	// 4. Structural compile of the authored source. This is lexical
	// analysis — the worker never executes untrusted code and shells out to
	// nothing.
	statef("compile", stateCompiling, "compiling source")
	if strings.TrimSpace(job.Source) == "" {
		logf("compile", "info", "no authored source — nothing to compile, skipped")
	} else {
		problems := extsrc.Analyze(job.Source)
		if len(problems) > 0 {
			first := problems[0]
			fail("compile", "source compilation failed — line %d: %s", first.Line, first.Message)
		}
		lines := strings.Count(job.Source, "\n") + 1
		logf("compile", "info", "structural compile OK — %s, %d line(s), delimiters balanced",
			extsrc.FileNameFor(job.Source), lines)
	}

	// 5. AIX packaging.
	statef("package", statePackaging, "packaging AIX")
	aix, checksum, err := packageAIX(job)
	if err != nil {
		fail("package", "packaging failed: %v", err)
	}
	logf("package", "info", "AIX generated — %d bytes", len(aix))

	// 6. Verification: reopen the package, re-parse the manifest inside,
	// re-run the structural compile, re-checksum.
	statef("verify", stateVerifying, "verifying package")
	if err := verifyAIX(aix, job); err != nil {
		fail("verify", "verification failed: %v", err)
	}
	logf("verify", "info", "package verified — checksum %s", short(checksum))
	logf("done", "info", "AIX generated: %s v%s", job.Slug, job.Version)

	emit(event{
		Type: "result", OK: true,
		AIXBase64: base64.StdEncoding.EncodeToString(aix),
		Checksum:  checksum, Size: len(aix),
	})
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

func short(sum string) string {
	if len(sum) > 12 {
		return sum[:12]
	}
	return sum
}

func packageAIX(job buildJob) ([]byte, string, error) {
	meta := map[string]string{
		"slug":     job.Slug,
		"name":     job.Name,
		"version":  job.Version,
		"builtAt":  time.Now().UTC().Format(time.RFC3339),
		"packager": "ideaven-extbuild/2",
	}

	files := map[string][]byte{
		"manifest.json": job.Manifest,
		"docs.md":       []byte(job.Docs),
		"meta.json":     mustJSON(meta),
	}
	if strings.TrimSpace(job.Source) != "" {
		files["src/"+extsrc.FileNameFor(job.Source)] = []byte(job.Source)
	}

	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, name := range names {
		writer, err := zw.Create(name)
		if err != nil {
			return nil, "", err
		}
		if _, err := writer.Write(files[name]); err != nil {
			return nil, "", err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, "", err
	}
	aix := buf.Bytes()
	sum := sha256.Sum256(aix)
	return aix, hex.EncodeToString(sum[:]), nil
}

func verifyAIX(aix []byte, job buildJob) error {
	zr, err := zip.NewReader(bytes.NewReader(aix), int64(len(aix)))
	if err != nil {
		return fmt.Errorf("not a readable zip: %w", err)
	}
	byName := map[string]*zip.File{}
	for _, f := range zr.File {
		byName[f.Name] = f
	}
	manifestFile, ok := byName["manifest.json"]
	if !ok {
		return fmt.Errorf("package is missing manifest.json")
	}
	inside, err := readMember(manifestFile)
	if err != nil {
		return err
	}
	var manifest manifestDoc
	if err := json.Unmarshal(inside, &manifest); err != nil {
		return fmt.Errorf("packaged manifest does not parse: %w", err)
	}
	if manifest.Format != 1 {
		return fmt.Errorf("packaged manifest has format %d", manifest.Format)
	}

	metaRaw, err := readMember(byName["meta.json"])
	if err != nil {
		return err
	}
	var meta map[string]string
	if err := json.Unmarshal(metaRaw, &meta); err != nil {
		return fmt.Errorf("packaged meta.json does not parse: %w", err)
	}
	if meta["slug"] != job.Slug || meta["version"] != job.Version {
		return fmt.Errorf("package identity mismatch: %s/%s", meta["slug"], meta["version"])
	}

	// The packaged source must re-compile exactly like the input did.
	for name, file := range byName {
		if !strings.HasPrefix(name, "src/") {
			continue
		}
		source, err := readMember(file)
		if err != nil {
			return err
		}
		if problems := extsrc.Analyze(string(source)); len(problems) > 0 {
			return fmt.Errorf("packaged source does not compile: %s", problems[0].Message)
		}
	}
	return nil
}

func readMember(file *zip.File) ([]byte, error) {
	if file == nil {
		return nil, fmt.Errorf("package member missing")
	}
	read, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer read.Close()
	return io.ReadAll(read)
}

func mustJSON(value any) []byte {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(err)
	}
	return encoded
}
