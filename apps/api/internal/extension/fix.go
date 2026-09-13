package extension

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/extsrc"
	"ideaven/apps/api/internal/httpx"
)

// AI fix assistance (Task 06). The fix flow is deliberately NOT a blind
// rewrite: the provider inspects the failed build, proposes new content for
// exactly one editable surface (source or manifest), and the service returns
// a unified diff plus the validated proposal. The client shows the diff and
// decides — applying goes through the existing PATCH endpoint, and undo is
// the client restoring the snapshot it kept. The provider never touches
// stored data.

// FixProvider turns a prompt into model output (satisfied by ai.Provider).
type FixProvider interface {
	Complete(ctx context.Context, system, user string) (string, error)
	Name() string
	Model() string
}

// FixProposal is the validated, diff-based fix suggestion.
type FixProposal struct {
	BuildID     string           `json:"buildId"`
	Target      string           `json:"target"` // "source" | "manifest"
	Explanation string           `json:"explanation"`
	Diff        string           `json:"diff"`
	NewContent  string           `json:"newContent"`
	Valid       bool             `json:"valid"`
	Problems    []extsrc.Problem `json:"problems,omitempty"`
	Provider    string           `json:"provider,omitempty"`
	Model       string           `json:"model,omitempty"`
}

const fixSystemPrompt = `You are Ideaven's extension build fixer. You receive a failed build (step, error, logs), the extension's manifest JSON, and its authored source code.

Respond with ONLY a JSON object (no markdown, no code fences) in this exact shape:

{
  "explanation": "one or two short sentences: what is wrong and what you changed",
  "target": "source" or "manifest",
  "newContent": "the FULL corrected content for that target"
}

Rules:
- Fix the smallest possible thing that resolves the reported build error. Keep everything else byte-identical where you can.
- Choose target "manifest" only when the failure is a manifest problem (format, duplicate ids, invalid JSON); otherwise target "source".
- newContent must be complete file content — not a snippet.
- If the source is Java-like it must keep a package declaration and at least one type declaration, and all braces/brackets/parentheses must balance.
- Never invent APIs that were not already present or implied by the manifest.`

// FixWithAI inspects a failed build and returns a diff-based fix proposal.
// The proposal is validated with the same structural rules the build worker
// compiles with; an invalid proposal is returned with Valid=false and the
// problems listed — never silently accepted.
func (s *Service) FixWithAI(ctx context.Context, ownerID, buildID string, provider FixProvider) (*FixProposal, error) {
	if provider == nil {
		return nil, httpx.Errorf(http.StatusServiceUnavailable, "AI_NOT_CONFIGURED",
			"AI is not configured on this server. Set AI_PROVIDER, AI_API_KEY and AI_MODEL to enable Fix with AI.")
	}
	record, err := s.store.FindBuildRecord(ctx, ownerID, buildID)
	if err != nil {
		return nil, err
	}
	if record.Status != RecordFailed {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation,
			"Only failed builds can be fixed — this build "+record.Status+".")
	}
	found, err := s.store.FindForOwner(ctx, ownerID, record.ExtensionID)
	if err != nil {
		if err == ErrNotFound {
			return nil, notFound()
		}
		return nil, fmt.Errorf("extension: fix: %w", err)
	}

	userMessage := buildFixPrompt(record, found)
	output, err := provider.Complete(ctx, fixSystemPrompt, userMessage)
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadGateway, "AI_PROVIDER_ERROR",
			"The AI provider could not complete the request. Try again shortly.")
	}

	proposal, err := parseFixProposal(output)
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadGateway, "AI_PROVIDER_ERROR",
			"The AI returned a response Ideaven could not use. Try again.")
	}

	current := found.Source
	target := proposal.Target
	if target == "manifest" {
		current = string(found.Manifest)
	}
	if strings.TrimSpace(proposal.NewContent) == "" {
		return nil, httpx.Errorf(http.StatusBadGateway, "AI_PROVIDER_ERROR",
			"The AI returned an empty fix. Try again.")
	}

	result := &FixProposal{
		BuildID:     record.ID,
		Target:      target,
		Explanation: proposal.Explanation,
		NewContent:  proposal.NewContent,
		Diff:        unifiedDiff(current, proposal.NewContent),
		Provider:    provider.Name(),
		Model:       provider.Model(),
	}

	// Validate with exactly the rules the build worker compiles with.
	if target == "manifest" {
		if problems := validateManifestContent(proposal.NewContent); len(problems) > 0 {
			result.Problems = problems
			return result, nil
		}
		result.Valid = true
		return result, nil
	}
	problems := extsrc.Analyze(proposal.NewContent)
	if len(problems) > 0 {
		result.Problems = problems
		return result, nil
	}
	result.Valid = true
	return result, nil
}

// parseFixProposal extracts the JSON proposal from model output, tolerating
// markdown fences.
func parseFixProposal(output string) (*struct {
	Explanation string `json:"explanation"`
	Target      string `json:"target"`
	NewContent  string `json:"newContent"`
}, error) {
	trimmed := strings.TrimSpace(output)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)
	var parsed struct {
		Explanation string `json:"explanation"`
		Target      string `json:"target"`
		NewContent  string `json:"newContent"`
	}
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, err
	}
	if parsed.Target != "source" && parsed.Target != "manifest" {
		return nil, fmt.Errorf("unknown fix target %q", parsed.Target)
	}
	return &parsed, nil
}

// buildFixPrompt assembles the inspection context: the real failure, the
// real logs, the real manifest and source.
func buildFixPrompt(record *BuildRecord, found *Extension) string {
	var logs strings.Builder
	for _, entry := range record.Logs {
		logs.WriteString(fmt.Sprintf("[%s] %s: %s\n", entry.Step, entry.Level, entry.Message))
	}
	source := found.Source
	if len(source) > 24000 {
		source = source[:24000] + "\n… (truncated)"
	}
	return fmt.Sprintf(`Failed build of extension "%s" (%s).

Requested version: %s
Failed step: %s
Error: %s

Build log:
%s

Manifest (manifest.json):
%s

Current source:
<<<SOURCE>>>
%s
<<<END>>>

Propose the smallest fix.`, found.Name, found.Slug, record.Version, record.FailedStep, record.Error,
		logs.String(), string(found.Manifest), source)
}

// validateManifestContent checks a proposed manifest with the same rules a
// build would apply. Returns human-readable problems.
func validateManifestContent(content string) []extsrc.Problem {
	var manifest Manifest
	if err := json.Unmarshal([]byte(content), &manifest); err != nil {
		return []extsrc.Problem{{Line: 1, Message: "proposed manifest is not valid JSON: " + err.Error()}}
	}
	if err := manifest.Validate(); err != nil {
		return []extsrc.Problem{{Line: 1, Message: err.Error()}}
	}
	return nil
}

// unifiedDiff renders a compact unified-style diff between two texts. It is
// a plain LCS line diff — enough for a reviewable proposal, no external
// dependencies.
func unifiedDiff(current, proposed string) string {
	a := strings.Split(strings.ReplaceAll(current, "\r\n", "\n"), "\n")
	b := strings.Split(strings.ReplaceAll(proposed, "\r\n", "\n"), "\n")

	// Trim common prefix/suffix to keep the LCS small.
	start, end := 0, 0
	for start < len(a) && start < len(b) && a[start] == b[start] {
		start++
	}
	for end < len(a)-start && end < len(b)-start && a[len(a)-1-end] == b[len(b)-1-end] {
		end++
	}
	midA := a[start : len(a)-end]
	midB := b[start : len(b)-end]
	if len(midA) == 0 && len(midB) == 0 {
		return ""
	}

	ops := lcsOps(midA, midB)
	var out strings.Builder
	context := func(lines []string, from, to int, prefix string, lineNo int) {
		for i := from; i < to; i++ {
			out.WriteString(prefix + " " + lines[i] + "\n")
			_ = lineNo
		}
	}
	out.WriteString(fmt.Sprintf("@@ source vs proposed @@\n"))
	context(a, max(0, start-3), start, " ", 0)
	for _, op := range ops {
		switch op.kind {
		case opEqual:
			context(midA, op.aStart, op.aEnd, " ", 0)
		case opDelete:
			context(midA, op.aStart, op.aEnd, "-", 0)
		case opInsert:
			context(midB, op.bStart, op.bEnd, "+", 0)
		}
	}
	context(a, len(a)-end, min(len(a), len(a)-end+3), " ", 0)
	return strings.TrimRight(out.String(), "\n")
}

type opKind int

const (
	opEqual opKind = iota
	opDelete
	opInsert
)

type diffOp struct {
	kind            opKind
	aStart, aEnd    int
	bStart, bEnd    int
}

// lcsOps computes line-level diff operations over two small slices with
// dynamic programming (proposals are bounded — content is capped upstream).
func lcsOps(a, b []string) []diffOp {
	n, m := len(a), len(b)
	// Guard: pathological sizes fall back to whole-block replace.
	if n*m > 4_000_000 {
		var ops []diffOp
		if n > 0 {
			ops = append(ops, diffOp{kind: opDelete, aStart: 0, aEnd: n})
		}
		if m > 0 {
			ops = append(ops, diffOp{kind: opInsert, bStart: 0, bEnd: m})
		}
		return ops
	}
	lcs := make([][]int, n+1)
	for i := range lcs {
		lcs[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				lcs[i][j] = lcs[i+1][j+1] + 1
			} else if lcs[i+1][j] >= lcs[i][j+1] {
				lcs[i][j] = lcs[i+1][j]
			} else {
				lcs[i][j] = lcs[i][j+1]
			}
		}
	}

	var ops []diffOp
	push := func(kind opKind, aStart, aEnd, bStart, bEnd int) {
		if kind == opEqual && aEnd-aStart == 0 {
			return
		}
		if len(ops) > 0 && ops[len(ops)-1].kind == kind {
			last := &ops[len(ops)-1]
			last.aEnd, last.bEnd = aEnd, bEnd
			return
		}
		ops = append(ops, diffOp{kind: kind, aStart: aStart, aEnd: aEnd, bStart: bStart, bEnd: bEnd})
	}
	i, j := 0, 0
	for i < n && j < m {
		if a[i] == b[j] {
			eqStart, eqB := i, j
			for i < n && j < m && a[i] == b[j] {
				i++
				j++
			}
			push(opEqual, eqStart, i, eqB, j)
		} else if lcs[i+1][j] >= lcs[i][j+1] {
			delStart := i
			for i < n && (j >= m || a[i] != b[j]) && lcs[i+1][j] >= lcs[i][j+1] {
				i++
			}
			push(opDelete, delStart, i, j, j)
		} else {
			insStart := j
			for j < m && (i >= n || a[i] != b[j]) && lcs[i+1][j] < lcs[i][j+1] {
				j++
			}
			push(opInsert, i, i, insStart, j)
		}
	}
	if i < n {
		push(opDelete, i, n, j, j)
	}
	if j < m {
		push(opInsert, i, i, j, m)
	}
	return ops
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
