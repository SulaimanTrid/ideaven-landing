// Command grant-credits awards AI pack credits to a user by writing a row
// in the credit_grants ledger. Operator tooling only — there is no
// self-service endpoint (that would be a faucet). Paid top-ups will write
// the same rows once payments exist (roadmap 42).
//
// Usage:
//
//	grant-credits -email user@example.com -amount 100 -note "launch promo" [-days 30]
//	grant-credits -id <user-uuid>  -amount 100
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	email := flag.String("email", "", "user email (or -id)")
	id := flag.String("id", "", "user UUID (or -email)")
	amount := flag.Int("amount", 0, "credits to award (required, > 0)")
	note := flag.String("note", "", "human-readable reason shown in the user's credit history")
	days := flag.Int("days", 0, "optional expiry in days from now (0 = never expires)")
	flag.Parse()

	if *amount <= 0 || (*email == "" && *id == "") || (*email != "" && *id != "") {
		fmt.Fprintln(os.Stderr, "usage: grant-credits (-email <email> | -id <uuid>) -amount N [-note …] [-days N]")
		os.Exit(2)
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable"
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "open:", err)
		os.Exit(1)
	}
	defer db.Close()

	var userID string
	if *id != "" {
		userID = *id
	} else {
		err := db.QueryRow(`SELECT id FROM users WHERE email = $1`, *email).Scan(&userID)
		if err == sql.ErrNoRows {
			fmt.Fprintf(os.Stderr, "no user with email %s\n", *email)
			os.Exit(1)
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "lookup:", err)
			os.Exit(1)
		}
	}

	var expires any
	if *days > 0 {
		expires = time.Now().AddDate(0, 0, *days)
	}
	var grantID string
	err = db.QueryRow(`
		INSERT INTO credit_grants (user_id, amount, source, note, expires_at)
		VALUES ($1, $2, 'promo', $3, $4)
		RETURNING id`, userID, *amount, *note, expires).Scan(&grantID)
	if err != nil {
		fmt.Fprintln(os.Stderr, "grant:", err)
		os.Exit(1)
	}
	fmt.Printf("granted %d pack credits to %s (grant %s)\n", *amount, userID, grantID)
}
