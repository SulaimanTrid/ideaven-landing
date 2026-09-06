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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": output}},
			},
		})
	})

	log.Printf("mock-ai: listening on %s (screen=%s)", addr, screen)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
