// Package migrations embeds the SQL schema migrations. Files are applied in
// filename order by internal/database.Migrate; never renumber or edit an
// applied migration — add a new one instead.
package migrations

import "embed"

// FS holds every .sql migration in this directory.
//
//go:embed *.sql
var FS embed.FS
