package ai

import (
	"net/http"
	"strings"
	"time"
)

// LoadProvider reads AI_* environment variables and returns nil when AI is
// deliberately unconfigured — Ask AI then reports unavailable honestly.
//
//	AI_PROVIDER=openai    → OpenAI-compatible chat completions (AI_BASE_URL
//	                       override works for compatible gateways)
//	AI_PROVIDER=anthropic → Anthropic messages API
//
// AI_API_KEY is required whenever AI_PROVIDER is set; AI_MODEL defaults per
// provider. The http client factory is injectable for tests.
func LoadProvider(getenv func(string) string, newClient func() *http.Client) Provider {
	provider := strings.TrimSpace(getenv("AI_PROVIDER"))
	if provider == "" {
		return nil
	}
	key := strings.TrimSpace(getenv("AI_API_KEY"))
	if key == "" {
		return nil
	}
	base := strings.TrimRight(strings.TrimSpace(getenv("AI_BASE_URL")), "/")
	model := strings.TrimSpace(getenv("AI_MODEL"))

	client := newClient
	if client == nil {
		client = func() *http.Client { return &http.Client{Timeout: 90 * time.Second} }
	}

	switch strings.ToLower(provider) {
	case "openai":
		if model == "" {
			model = "gpt-4o-mini"
		}
		if base == "" {
			base = "https://api.openai.com/v1"
		}
		return &openAIProvider{key: key, base: base, model: model, client: client()}
	case "anthropic":
		if model == "" {
			model = "claude-3-5-haiku-latest"
		}
		if base == "" {
			base = "https://api.anthropic.com/v1"
		}
		return &anthropicProvider{key: key, base: base, model: model, client: client()}
	default:
		return nil
	}
}
