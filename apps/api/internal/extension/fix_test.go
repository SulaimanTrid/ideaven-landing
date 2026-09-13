package extension

import (
	"strings"
	"testing"
)

func TestUnifiedDiffIdentical(t *testing.T) {
	if d := unifiedDiff("package p;\nclass A {}\n", "package p;\nclass A {}\n"); d != "" {
		t.Fatalf("identical content must produce an empty diff, got %q", d)
	}
}

func TestUnifiedDiffShowsChange(t *testing.T) {
	current := "package com.example;\n\npublic class A {\n  void run() {\n    work(\n"
	proposed := "package com.example;\n\npublic class A {\n  void run() {\n  }\n"
	d := unifiedDiff(current, proposed)
	if !hasPrefixedLine(d, "-") || !strings.Contains(d, "work(") {
		t.Fatalf("diff must mark the removed line, got:\n%s", d)
	}
	if !hasPrefixedLine(d, "+") {
		t.Fatalf("diff must mark the added line, got:\n%s", d)
	}
	if !hasPrefixedLine(d, " ") || !strings.Contains(d, "public class A {") {
		t.Fatalf("diff must keep context lines, got:\n%s", d)
	}
}

func TestUnifiedDiffInsertOnly(t *testing.T) {
	d := unifiedDiff("a\nb\nc", "a\nb\nX\nc")
	if !hasPrefixedLine(d, "+") || !strings.Contains(d, "X") {
		t.Fatalf("insert must appear, got %q", d)
	}
	if hasPrefixedLine(d, "-") {
		t.Fatalf("unchanged lines must not be marked, got %q", d)
	}
}

// hasPrefixedLine reports whether any diff line starts with the prefix
// (after the leading space the writer emits).
func hasPrefixedLine(diff, prefix string) bool {
	for _, line := range strings.Split(diff, "\n") {
		if strings.HasPrefix(line, prefix) {
			return true
		}
	}
	return false
}

func TestParseFixProposalToleratesFences(t *testing.T) {
	raw := "```json\n{\"explanation\":\"close brace\",\"target\":\"source\",\"newContent\":\"x}\"}\n```"
	parsed, err := parseFixProposal(raw)
	if err != nil {
		t.Fatalf("fenced proposal must parse: %v", err)
	}
	if parsed.Target != "source" || parsed.NewContent != "x}" {
		t.Fatalf("parsed wrong: %+v", parsed)
	}
	if _, err := parseFixProposal("{\"target\":\"binary\"}"); err == nil {
		t.Fatal("unknown target must be rejected")
	}
}
