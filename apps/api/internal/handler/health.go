// Package handler contains the API's HTTP handlers.
package handler

import (
	"net/http"
	"time"

	"ideaven/apps/api/internal/build"
	"ideaven/apps/api/internal/httpx"
)

// Health responds to GET /api/health with a small liveness payload.
func Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   "ideaven-api",
		"version":   build.Version,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
