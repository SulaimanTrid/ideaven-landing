#!/usr/bin/env bash
set -euo pipefail

# Starts the frontend (Next.js) and backend (Go API) in parallel.
# Press Ctrl-C to stop both.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo ""
  echo "Shutting down…"
  kill "$API_PID" 2>/dev/null || true
  kill "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# --- API ---
(
  cd "$ROOT_DIR/apps/api"
  go run ./cmd/api
) &
API_PID=$!
echo "API  → http://localhost:8080/api/health  (pid $API_PID)"

# --- Web ---
(
  cd "$ROOT_DIR"
  pnpm --filter @ideaven/web dev
) &
WEB_PID=$!
echo "Web  → http://localhost:3000               (pid $WEB_PID)"

echo ""
echo "Both services running. Press Ctrl-C to stop."

wait
