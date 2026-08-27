package database

import (
	"io/fs"
	"sort"

	"ideaven/apps/api/migrations"
)

type migration struct {
	ID  string
	SQL string
}

// migrationsFS reads the embedded .sql files in apply order.
func migrationsFS() ([]migration, error) {
	entries, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ErrNoMigrations
	}
	sort.Strings(entries)
	applied := make([]migration, 0, len(entries))
	for _, name := range entries {
		data, err := migrations.FS.ReadFile(name)
		if err != nil {
			return nil, err
		}
		applied = append(applied, migration{ID: name, SQL: string(data)})
	}
	return applied, nil
}
