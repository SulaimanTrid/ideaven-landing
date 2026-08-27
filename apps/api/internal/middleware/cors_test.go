package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	handler := CORS([]string{"http://localhost:3000"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Allow-Origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Allow-Credentials = %q, want true", got)
	}
}

func TestCORSPreflight(t *testing.T) {
	handler := CORS([]string{"http://localhost:3000"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	request := httptest.NewRequest(http.MethodOptions, "/api/auth/login", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}
	if methods := rec.Header().Get("Access-Control-Allow-Methods"); methods != "GET, POST, OPTIONS" {
		t.Fatalf("Allow-Methods = %q", methods)
	}
}

func TestCORSEmitsNoWildcard(t *testing.T) {
	handler := CORS([]string{"http://localhost:3000"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, origin := range []string{"http://evil.example", "null", ""} {
		request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
		if origin != "" {
			request.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, request)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("unlisted origin %q got Allow-Origin %q", origin, got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
			t.Fatalf("unlisted origin %q got Allow-Credentials %q", origin, got)
		}
	}
}

func TestOriginGuardBlocksForeignOrigin(t *testing.T) {
	handler := OriginGuard([]string{"http://localhost:3000"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign-origin POST returned %d, want 403", rec.Code)
	}
}

func TestOriginGuardAllowsSafeAndAllowed(t *testing.T) {
	handler := OriginGuard([]string{"http://localhost:3000"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	get := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	get.Header.Set("Origin", "http://evil.example") // safe method: guard does not apply
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, get)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET with foreign origin returned %d", getRec.Code)
	}

	post := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	post.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, post)
	if rec.Code != http.StatusOK {
		t.Fatalf("allowed-origin POST returned %d", rec.Code)
	}

	noOrigin := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, noOrigin)
	if rec.Code != http.StatusOK {
		t.Fatalf("non-browser POST without Origin returned %d", rec.Code)
	}
}
