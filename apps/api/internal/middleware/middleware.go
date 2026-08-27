/*
Package middleware wraps HTTP handlers with cross-cutting concerns: request
logging, panic recovery, security headers, and optional CORS.
*/
package middleware

import "net/http"

// Middleware wraps an http.Handler.
type Middleware func(http.Handler) http.Handler

// Chain composes middlewares so they execute in the order given — the first
// middleware in the list runs outermost.
func Chain(handler http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}
