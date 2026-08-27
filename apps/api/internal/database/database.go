// Package database owns the PostgreSQL connection pool and schema migrations.
package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx"
)

// EnsureDatabase creates the database named in a URL-form DSN if it does not
// exist yet — a development convenience so `go run ./cmd/api` works against a
// fresh local PostgreSQL without psql/createdb. In production the database is
// provisioned by ops and this function is not called.
func EnsureDatabase(ctx context.Context, dsn string) error {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.Scheme == "" {
		// Keyword-form DSN: leave provisioning to the operator.
		return nil
	}
	name := strings.Trim(parsed.Path, "/")
	if name == "" || name == "postgres" || name == "template1" {
		return nil
	}

	admin := *parsed
	admin.Path = "/postgres"
	db, err := sql.Open("pgx", admin.String())
	if err != nil {
		return fmt.Errorf("database: ensure: open admin: %w", err)
	}
	defer db.Close()

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		return fmt.Errorf("database: ensure: ping admin: %w", err)
	}

	var exists bool
	if err := db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, name).Scan(&exists); err != nil {
		return fmt.Errorf("database: ensure: check %s: %w", name, err)
	}
	if exists {
		return nil
	}
	// Identifier comes from our own DSN, quoted to stay injection-safe.
	if _, err := db.ExecContext(ctx, fmt.Sprintf(`CREATE DATABASE %q`, name)); err != nil {
		return fmt.Errorf("database: ensure: create %s: %w", name, err)
	}
	slog.Info("database created", "name", name)
	return nil
}

// Connect opens a PostgreSQL pool and verifies it is reachable.
func Connect(ctx context.Context, dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("database: open: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("database: ping (is PostgreSQL running and DATABASE_URL correct?): %w", err)
	}
	return db, nil
}

// advisoryLockKey identifies Ideaven's migration lock so concurrent API
// instances never race applying migrations.
const advisoryLockKey = 727417

// Migrate applies every embedded migration that has not run yet, in filename
// order, each inside its own transaction.
func Migrate(db *sql.DB) error {
	conn, err := db.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("database: migrate: acquire connection: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(context.Background(), "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
		return fmt.Errorf("database: migrate: acquire lock: %w", err)
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), "SELECT pg_advisory_unlock($1)", advisoryLockKey)
	}()

	if _, err := conn.ExecContext(context.Background(),
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			id        TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("database: migrate: create schema_migrations: %w", err)
	}

	entries, err := migrationsFS()
	if err != nil {
		return err
	}

	for _, entry := range entries {
		var exists bool
		if err := conn.QueryRowContext(context.Background(),
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE id = $1)`, entry.ID).Scan(&exists); err != nil {
			return fmt.Errorf("database: migrate: check %s: %w", entry.ID, err)
		}
		if exists {
			continue
		}

		tx, err := conn.BeginTx(context.Background(), nil)
		if err != nil {
			return fmt.Errorf("database: migrate: begin %s: %w", entry.ID, err)
		}
		if _, err := tx.Exec(entry.SQL); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("database: migrate: apply %s: %w", entry.ID, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (id) VALUES ($1)`, entry.ID); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("database: migrate: record %s: %w", entry.ID, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("database: migrate: commit %s: %w", entry.ID, err)
		}
		slog.Info("migration applied", "id", entry.ID)
	}
	return nil
}

// ErrNoMigrations is returned when the embedded set is empty — a wiring bug.
var ErrNoMigrations = errors.New("database: no migrations found")
