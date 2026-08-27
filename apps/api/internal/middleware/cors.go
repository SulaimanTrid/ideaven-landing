package middleware

import "net/http"

// CORS emits credentialed CORS headers for requests whose Origin is
// explicitly allowed. With no configured origins the middleware is a
// pass-through, which keeps same-server deployments clean. The wildcard "*"
// is never used: credentialed requests require an exact origin.
func CORS(origins []string) Middleware {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			_, ok := allowed[origin]
			if origin != "" && ok {
				headers := w.Header()
				headers.Set("Access-Control-Allow-Origin", origin)
				headers.Set("Access-Control-Allow-Credentials", "true")
				headers.Add("Vary", "Origin")

				if r.Method == http.MethodOptions {
					headers.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
					headers.Set("Access-Control-Allow-Headers", "Content-Type")
					headers.Set("Access-Control-Max-Age", "600")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			} else {
				w.Header().Add("Vary", "Origin")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// OriginGuard rejects cross-site state-changing requests: browsers always
// send Origin on cross-origin POSTs, so an Origin that is present but not
// allowlisted means a foreign site (CSRF). Non-browser clients without an
// Origin header pass through — they carry no ambient cookie authority.
func OriginGuard(origins []string) Middleware {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
				if origin := r.Header.Get("Origin"); origin != "" {
					if _, ok := allowed[origin]; !ok {
						w.Header().Set("Content-Type", "application/json; charset=utf-8")
						w.WriteHeader(http.StatusForbidden)
						_, _ = w.Write([]byte(`{"error":{"code":"FORBIDDEN","message":"Request origin is not allowed."}}`))
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
