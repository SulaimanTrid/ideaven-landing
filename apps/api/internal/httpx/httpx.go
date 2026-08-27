// Package httpx centralizes JSON responses and the API error envelope so
// every handler speaks the same wire format:
//
//	{"error": {"code": "INVALID_CREDENTIALS", "message": "...", "details": [...]}}
package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

// FieldError attaches a validation message to a request field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error is an API error with a stable machine-readable code, a safe
// human-readable message, and optional field-level validation details.
type Error struct {
	Status  int          `json:"-"`
	Code    string       `json:"code"`
	Message string       `json:"message"`
	Details []FieldError `json:"details,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// Common error codes and constructors.
const (
	CodeValidation      = "VALIDATION_ERROR"
	CodeInvalidBody     = "INVALID_REQUEST_BODY"
	CodeUnauthorized    = "UNAUTHORIZED"
	CodeInvalidCreds    = "INVALID_CREDENTIALS"
	CodeEmailTaken      = "EMAIL_TAKEN"
	CodeUsernameTaken   = "USERNAME_TAKEN"
	CodeTokenInvalid    = "TOKEN_INVALID"
	CodeTokenExpired    = "TOKEN_EXPIRED"
	CodeAlreadyVerified = "EMAIL_ALREADY_VERIFIED"
	CodeRateLimited     = "RATE_LIMITED"
	CodeForbidden       = "FORBIDDEN"
	CodeNotFound        = "NOT_FOUND"
	CodeInternal        = "INTERNAL_ERROR"
	CodeConflict        = "CONFLICT"
)

// Errorf builds an *Error.
func Errorf(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

// WithDetails attaches field errors and returns the same error.
func (e *Error) WithDetails(details ...FieldError) *Error {
	e.Details = append(e.Details, details...)
	return e
}

// WriteJSON writes payload as a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError writes err as the API error envelope, mapping unknown errors to
// a generic 500 that never leaks internals.
func WriteError(w http.ResponseWriter, err error) {
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		apiErr = Errorf(http.StatusInternalServerError, CodeInternal, "Something went wrong on our side. Try again shortly.")
	}
	WriteJSON(w, apiErr.Status, map[string]*Error{"error": apiErr})
}
