// Command api runs the Ideaven API service.
package main

import (
	"context"
	"fmt"
	"os"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}

	if !cfg.IsProduction() {
		// Dev convenience: create the configured database when missing so a
		// fresh local PostgreSQL needs no manual createdb step.
		if err := database.EnsureDatabase(context.Background(), cfg.DatabaseURL); err != nil {
			fmt.Fprintln(os.Stderr, "api:", err)
			os.Exit(1)
		}
	}

	db, err := database.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.Migrate(db); err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}

	if err := server.Run(cfg, db); err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}
}
