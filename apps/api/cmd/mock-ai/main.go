// Command mock-ai is a development-only OpenAI-compatible stub for testing
// Ideaven's Ask AI pipeline without a real provider key. It answers every
// /chat/completions request with a canned, valid changeset. Do NOT run in
// production — it exists so the full AI flow can be exercised locally.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
)

const canned = `{
  "explanation": "Adds a welcome heading and a button to the current screen.",
  "operations": [
    {"op":"createComponent","screenId":"%SCREEN%","componentType":"text","props":{"text":"Welcome to my app"},"styles":{"fontSize":24,"fontWeight":"600"}},
    {"op":"createComponent","screenId":"%SCREEN%","componentType":"button","props":{"label":"Get started"}}
  ]
}`

func main() {
	addr := os.Getenv("MOCK_AI_ADDR")
	if addr == "" {
		addr = ":8090"
	}
	screen := os.Getenv("MOCK_AI_SCREEN")
	if screen == "" {
		screen = "screen-home"
	}
	output := strings.ReplaceAll(canned, "%SCREEN%", screen)

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		last := ""
		for _, m := range body.Messages {
			if m.Role == "user" {
				last = m.Content
			}
		}
		log.Printf("mock-ai: user message %d chars", len(last))

		// Extension build-fix requests carry the source between these
		// markers; the mock closes unbalanced delimiters the way the real
		// structural compile expects. Dev-only, no project data leaves it.
		content := output
		if strings.Contains(last, "<<<SOURCE>>>") {
			content = fixExtensionSource(last)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": content}},
			},
		})
	})

	log.Printf("mock-ai: listening on %s (screen=%s)", addr, screen)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// fixExtensionSource extracts the authored source from an extension fix
// prompt and returns a fix proposal JSON that closes unbalanced braces and
// (for Java-like sources) guarantees a package declaration. It reproduces
// exactly the structural rules the build worker compiles with.
func fixExtensionSource(prompt string) string {
	start := strings.Index(prompt, "<<<SOURCE>>>") + len("<<<SOURCE>>>")
	end := strings.Index(prompt, "<<<END>>>")
	if end < start {
		end = len(prompt)
	}
	source := strings.Trim(prompt[start:end], "\n")

	// Guarantee a package declaration for Java-like sources.
	if (strings.Contains(source, "class ") || strings.Contains(source, "public ")) &&
		!strings.Contains(source, "package ") {
		source = "package com.example.fixed;\n\n" + source
	}

	// Close unbalanced delimiters, ignoring comments/strings the same way
	// the compile does (simplified: count outside line comments and string
	// literals).
	depths := map[rune]int{}
	inString, inLineComment, inBlockComment := false, false, false
	var prev rune
	for _, r := range source {
		switch {
		case inLineComment:
			if r == '\n' {
				inLineComment = false
			}
		case inBlockComment:
			if prev == '*' && r == '/' {
				inBlockComment = false
			}
		case inString:
			if r == '"' && prev != '\\' {
				inString = false
			}
		case r == '/' && prev == '/':
			inLineComment = true
		case r == '*' && prev == '/':
			inBlockComment = true
		case r == '"':
			inString = true
		case r == '{' || r == '(' || r == '[':
			depths[r]++
		case r == '}':
			depths['{']--
		case r == ')':
			depths['(']--
		case r == ']':
			depths['[']--
		}
		prev = r
	}
	for i := 0; i < depths['(']; i++ {
		source += ")"
	}
	for i := 0; i < depths['{']; i++ {
		source += "}"
	}
	for i := 0; i < -depths['{']; i++ {
		source = "{" + source
	}

	proposal := map[string]string{
		"explanation": "Closed the unbalanced braces so the source compiles (mock fix).",
		"target":      "source",
		"newContent":  source,
	}
	encoded, _ := json.Marshal(proposal)
	return string(encoded)
}
