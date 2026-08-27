package database

import (
	"strings"
	"testing"
)

func TestMigrationsEmbedded(t *testing.T) {
	found, err := migrationsFS()
	if err != nil {
		t.Fatalf("migrationsFS: %v", err)
	}
	if len(found) < 3 {
		t.Fatalf("expected at least 3 migrations, got %d", len(found))
	}
	for i, m := range found {
		if !strings.HasSuffix(m.ID, ".sql") {
			t.Errorf("migration %q is not .sql", m.ID)
		}
		if strings.TrimSpace(m.SQL) == "" {
			t.Errorf("migration %q is empty", m.ID)
		}
		if i > 0 && found[i-1].ID >= m.ID {
			t.Errorf("migrations not sorted: %q before %q", found[i-1].ID, m.ID)
		}
	}
}
