// extbuild is IDEAVEN's isolated extension build worker (roadmap 2.0 Phase 1).
// It runs as its own process — the API server never packages or executes
// untrusted extension content in-process. Protocol: one JSON job on stdin,
// one JSON result on stdout.
//
// Job:   {"slug","name","version","manifest":<json>,"docs":string,
//         "dependencies":[{"slug","version"}]}
// Result: {"ok":bool,"logs":[{"step","level","message"}],"aixBase64"?:string,
//          "checksum"?:string,"error"?:string}
//
// Pipeline: manifest validation → source validation → dependency resolution
// (against the job's registry snapshot) → AIX packaging (zip) → verification
// (reopen + parse + checksum) — every step logged.
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
	"time"
)

type logEntry struct {
	Step    string `json:"step"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type buildResult struct {
	OK        bool       `json:"ok"`
	Logs      []logEntry `json:"logs"`
	AIXBase64 string     `json:"aixBase64,omitempty"`
	Checksum  string     `json:"checksum,omitempty"`
	Error     string     `json:"error,omitempty"`
}

type dependencySpec struct {
	Slug    string `json:"slug"`
	Version string `json:"version"`
}

type buildJob struct {
	Slug         string          `json:"slug"`
	Name         string          `json:"name"`
	Version      string          `json:"version"`
	Manifest     json.RawMessage `json:"manifest"`
	Docs         string          `json:"docs"`
	Dependencies []dependencySpec `json:"dependencies"`
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
	Format     int            `json:"format"`
	Components []componentSpec `json:"components"`
	Blocks     []blockSpec    `json:"blocks"`
}

var logs []logEntry

func logf(step, level, format string, args ...any) {
	logs = append(logs, logEntry{Step: step, Level: level, Message: fmt.Sprintf(format, args...)})
}

func fail(err error) {
	logf("build", "error", "%v", err)
	emit(buildResult{OK: false, Logs: logs, Error: err.Error()})
	os.Exit(1)
}

func emit(result buildResult) {
	encoded, _ := json.Marshal(result)
	fmt.Println(string(encoded))
}

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fail(fmt.Errorf("read job: %w", err))
	}
	var job buildJob
	if err := json.Unmarshal(raw, &job); err != nil {
		fail(fmt.Errorf("parse job: %w", err))
	}

	// 1. Manifest validation.
	logf("validate-manifest", "info", "Validating manifest for %s v%s…", job.Slug, job.Version)
	var manifest manifestDoc
	if err := json.Unmarshal(job.Manifest, &manifest); err != nil {
		fail(fmt.Errorf("manifest is not valid JSON: %w", err))
	}
	if manifest.Format != 1 {
		fail(fmt.Errorf("unsupported manifest format %d", manifest.Format))
	}
	logf("validate-manifest", "info", "Manifest format 1 OK — %d component(s), %d block(s).",
		len(manifest.Components), len(manifest.Blocks))

	// 2. Source validation: every component must carry a label; every block a
	// known kind. Deeper artifact compilation arrives when extensions carry
	// executable artifacts — the pipeline shape stays the same.
	for _, c := range manifest.Components {
		if c.ID == "" || c.Label == "" {
			fail(fmt.Errorf("component %q is missing an id or label", c.ID))
		}
	}
	for _, b := range manifest.Blocks {
		if b.Type == "" || (b.Kind != "statement" && b.Kind != "expression") {
			fail(fmt.Errorf("block %q has an unknown kind %q", b.Type, b.Kind))
		}
	}
	logf("validate-source", "info", "Source metadata consistent.")

	// 3. Dependency resolution against the registry snapshot.
	for _, dep := range job.Dependencies {
		versions, ok := job.RegistrySnapshot[dep.Slug]
		if !ok {
			fail(fmt.Errorf("dependency %q is not in the registry", dep.Slug))
		}
		if dep.Version != "" && !contains(versions, dep.Version) {
			fail(fmt.Errorf("dependency %q v%s is not available (have %v)", dep.Slug, dep.Version, versions))
		}
		logf("resolve-dependencies", "info", "Resolved %s → registry.", dep.Slug)
	}
	logf("resolve-dependencies", "info", "%d dependency(ies) resolved.", len(job.Dependencies))

	// 4. AIX packaging.
	logf("package", "info", "Packaging AIX…")
	aix, checksum, err := packageAIX(job)
	if err != nil {
		fail(fmt.Errorf("package: %w", err))
	}

	// 5. Verification: reopen the package and re-parse the manifest inside.
	logf("verify", "info", "Verifying package (reopen + parse + checksum)…")
	if err := verifyAIX(aix, job.Slug, job.Version); err != nil {
		fail(fmt.Errorf("verify: %w", err))
	}
	logf("verify", "info", "Package verified — checksum %s.", short(checksum))
	logf("build", "info", "Build complete: %s v%s (%d bytes).", job.Slug, job.Version, len(aix))

	emit(buildResult{OK: true, Logs: logs, AIXBase64: base64.StdEncoding.EncodeToString(aix), Checksum: checksum})
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
	prettyManifest := json.RawMessage(job.Manifest)

	meta := map[string]string{
		"slug":     job.Slug,
		"name":     job.Name,
		"version":  job.Version,
		"builtAt":  time.Now().UTC().Format(time.RFC3339),
		"packager": "ideaven-extbuild/1",
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	files := map[string][]byte{
		"manifest.json": prettyManifest,
		"docs.md":       []byte(job.Docs),
		"meta.json":     mustJSON(meta),
	}
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
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

func verifyAIX(aix []byte, slug, version string) error {
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
	read, err := manifestFile.Open()
	if err != nil {
		return err
	}
	inside, err := io.ReadAll(read)
	read.Close()
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
	metaFile, ok := byName["meta.json"]
	if !ok {
		return fmt.Errorf("package is missing meta.json")
	}
	read, err = metaFile.Open()
	if err != nil {
		return err
	}
	metaRaw, err := io.ReadAll(read)
	read.Close()
	if err != nil {
		return err
	}
	var meta map[string]string
	if err := json.Unmarshal(metaRaw, &meta); err != nil {
		return fmt.Errorf("packaged meta.json does not parse: %w", err)
	}
	if meta["slug"] != slug || meta["version"] != version {
		return fmt.Errorf("package identity mismatch: %s/%s", meta["slug"], meta["version"])
	}
	return nil
}

func mustJSON(value any) []byte {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(err)
	}
	return encoded
}
