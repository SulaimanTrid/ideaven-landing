package auth

import (
	"context"
	"log/slog"
)

// Mailer sends transactional authentication email. Production wires a real
// provider (SMTP, SES, Postmark, …) behind this interface; no caller knows
// which transport is active.
type Mailer interface {
	SendEmailVerification(ctx context.Context, to, link string) error
	SendPasswordReset(ctx context.Context, to, link string) error
}

// LogMailer is the development transport: it never pretends to deliver. It
// writes the exact message a real provider would send — including the
// action link — to the API log so the flow can be tested end-to-end locally.
type LogMailer struct {
	Logger *slog.Logger
}

// NewLogMailer builds a logging mailer.
func NewLogMailer(logger *slog.Logger) *LogMailer {
	return &LogMailer{Logger: logger}
}

// SendEmailVerification logs a verification email.
func (m *LogMailer) SendEmailVerification(ctx context.Context, to, link string) error {
	m.Logger.Info("dev mailer: email verification",
		"transport", "log",
		"to", to,
		"subject", "Verify your Ideaven email",
		"link", link,
		"note", "no email provider configured; link printed for local testing only")
	return nil
}

// SendPasswordReset logs a password-reset email.
func (m *LogMailer) SendPasswordReset(ctx context.Context, to, link string) error {
	m.Logger.Info("dev mailer: password reset",
		"transport", "log",
		"to", to,
		"subject", "Reset your Ideaven password",
		"link", link,
		"note", "no email provider configured; link printed for local testing only")
	return nil
}
