package middleware

import (
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// rateBucket counts hits inside one fixed window.
type rateBucket struct {
	windowStart time.Time
	count       int
}

// RateLimiter is a per-client fixed-window counter. It is in-memory, so the
// limit applies per API instance — appropriate for Phase 2's single-node
// deployment; a shared store becomes worthwhile once the API scales out.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	max     int
	window  time.Duration
	now     func() time.Time
}

// NewRateLimiter allows max requests per window per client IP.
func NewRateLimiter(max int, window time.Duration) *RateLimiter {
	limiter := &RateLimiter{
		buckets: make(map[string]*rateBucket),
		max:     max,
		window:  window,
		now:     time.Now,
	}
	go limiter.sweep()
	return limiter
}

// Middleware enforces the limit, answering 429 with a Retry-After header.
func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r)) {
			retry := int(l.window.Seconds())
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"code":"RATE_LIMITED","message":"Too many requests. Try again in a moment."}}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *RateLimiter) allow(key string) bool {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	bucket, ok := l.buckets[key]
	if !ok || now.Sub(bucket.windowStart) >= l.window {
		l.buckets[key] = &rateBucket{windowStart: now, count: 1}
		return true
	}
	if bucket.count >= l.max {
		return false
	}
	bucket.count++
	return true
}

// sweep empties stale buckets so the map cannot grow without bound.
func (l *RateLimiter) sweep() {
	interval := l.window
	if interval < time.Minute {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		now := l.now()
		l.mu.Lock()
		for key, bucket := range l.buckets {
			if now.Sub(bucket.windowStart) >= 2*l.window {
				delete(l.buckets, key)
			}
		}
		l.mu.Unlock()
	}
}

// clientIP prefers X-Forwarded-For's first hop (set by the trusted reverse
// proxy in production), falling back to the socket address.
func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if host, _, err := net.SplitHostPort(forwarded); err == nil && host != "" {
			return host
		}
		return forwarded
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
