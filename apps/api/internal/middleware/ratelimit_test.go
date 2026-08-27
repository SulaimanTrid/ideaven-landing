package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestRateLimiterAllowsWithinLimit(t *testing.T) {
	limiter := NewRateLimiter(3, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 3; i++ {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d rejected with %d", i+1, rec.Code)
		}
	}
}

func TestRateLimiterBlocksOverLimit(t *testing.T) {
	limiter := NewRateLimiter(2, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 2; i++ {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/x", nil))
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/x", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("third request returned %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 response must include Retry-After")
	}
}

func TestRateLimiterWindowReset(t *testing.T) {
	limiter := NewRateLimiter(1, 10*time.Millisecond)
	limiter.now = func() time.Time { return time.Unix(0, 0) }
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/x", nil))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/x", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatal("second request in window should be limited")
	}

	limiter.now = func() time.Time { return time.Unix(0, 0).Add(20 * time.Millisecond) }
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/x", nil))
	if rec.Code != http.StatusOK {
		t.Fatal("request after window should pass")
	}
}

func TestRateLimiterPerClient(t *testing.T) {
	limiter := NewRateLimiter(1, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	first := httptest.NewRequest("POST", "/x", nil)
	first.RemoteAddr = "10.0.0.1:1234"
	second := httptest.NewRequest("POST", "/x", nil)
	second.RemoteAddr = "10.0.0.2:5678"

	handler.ServeHTTP(httptest.NewRecorder(), first)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, second)
	if rec.Code != http.StatusOK {
		t.Fatal("different client should have its own budget")
	}
}

func TestRateLimiterConcurrent(t *testing.T) {
	limiter := NewRateLimiter(50, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	var wg sync.WaitGroup
	results := make([]int, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest("POST", "/x", nil))
			results[i] = rec.Code
		}(i)
	}
	wg.Wait()

	allowed := 0
	for _, code := range results {
		if code == http.StatusOK {
			allowed++
		}
	}
	if allowed != 50 {
		t.Fatalf("concurrent limiter allowed %d requests, want exactly 50", allowed)
	}
}
