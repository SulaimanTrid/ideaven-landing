# IDEAVEN 6.0 — Architecture Audit (M0)

Audits what Phase 6A–6O need on top of the current tree
(`~/Downloads/Projek IDEAVEN/ideaven-landing-v1`). Prior audits still hold:
`IDEAVEN_4_ARCHITECTURE_AUDIT.md` (platform) and
`IDEAVEN_5_ARCHITECTURE.md` (AI/intelligence). Honest headline: **5.0 is
only partially delivered (Phase 5A of 5A–5O complete)** — 6.0 work must
never fake that the intelligence phases are all done.

## 1. Current cloud-relevant state

| Area | State |
|---|---|
| Project persistence (M1–M3) | Strong: CRUD, archive/restore, duplicate, server-side version history (20 kept, origin labels, restore), publish/unpublish + publications. Workspace model does not exist. |
| Storage model (M2) | Split today: project row (metadata) + `model` JSONB + `assets` table + files on disk for AIX packages. **Asset binaries live as `BYTEA` inside DB rows** — one giant record per file, no hashes, no filesystem storage. |
| Upload pipeline (M7) | Exists: multipart read, magic-byte MIME sniffing with allowlist, per-file and per-project size/count caps, owner checks. |
| Asset serving (M6) | `GET /api/assets/{id}/raw` with audience-scoped Cache-Control (owner: `private…immutable`; published: `public, max-age=86400`). No ETag/304, public not long-immutable. |
| Storage abstraction (M5) | **None.** DB is the only asset backend; extensions write files ad-hoc under `.data/extensions`. |
| Avatars (M9) | `avatar_url` field exists on users; no upload path, no processing. |
| Sync/offline (M10–M12) | Not present; client has debounced save + server versions (single-writer). |
| Collaboration/orgs (M13–M24) | Not present. Projects are single-owner. |
| Backend studio / DB builder / API builder (M25–M49) | Not present (platform-level auth/DB exist but are not project-facing services). |
| Deployment (M50–M82) | Only static exports (HTML bundle; Android source project + CI workflow). No runtime/deploy service. Honest rule from 4.0 stands: no fake deployment claims. |
| Analytics/telemetry (M83–M90) | Public stats counters only (views/remixes at publication level). No per-project runtime telemetry. |
| Marketplace/commerce (M103–M124) | Extension registry + installs + honest trust labels; no commerce (credits ledger exists). |
| i18n (M125–M130) | Still none (hardcoded English; number/date formatting locale-driven only). |
| Education (M131–M138) | Static Learn pages only. |
| Billing/quotas (M139–M145) | AI credits ledger exists (daily allowance + metering). No storage/build/bandwidth metering. |
| Observability (M177–M181) | slog request logging incl. status+duration; no metrics/alerting. |

## 2. Reusable infrastructure for 6A

- Migration runner (embedded, auto-applies) — all schema changes ride it.
- `config.DataDir` (0600 dir, sessions live there) + the extension
  package's `.data` precedent for file storage.
- Asset ownership model: rows cascade with projects; ownership is the
  owning project's owner; public serving gated by a live publication
  (never leaking existence).
- Project Service owner checks (`authorize` callback pattern).
- The 8/8-package Go test suites + integration harness pattern.

## 3. Security-sensitive areas for 6.0

1. **Asset serving** — public raw endpoint must keep "no existence leak"
   semantics; adding ETag/immutable caching must not cache private bytes in
   shared caches (Vary/audience split stays).
2. **Storage adapter** — path construction must never trust names
   (use IDs; validate to prevent traversal); file perms 0600 under DataDir.
3. **Multi-tenancy (future 6B/6I)** — every new table gets owner/workspace
   scoping from day one; the memory/DNA pattern (JOIN on owner) is the
   template.
4. **Payments (6G/6I)** — stay locked until the full checklist exists;
   ledger remains integer-minor-units.

## 4. Schema migrations identified for Phase 6A

- `015_asset_storage.sql`: `ALTER TABLE assets ADD COLUMN sha256 TEXT NOT NULL DEFAULT ''`
  (content hash for integrity + ETags + dedup groundwork). Existing rows
  keep `''` until first re-read (lazy backfill on serve).
- Storage location stays derivable (DataDir/assets/<project_id>/<asset_id>)
  — no path column needed; the adapter owns layout.

## 5. Blockers

None critical for 6A. Known honest limitations carried in: no i18n (M125+
"continue using centralized i18n" is unsatisfiable until that layer is
built — see 4.0 M38); single-writer model means true offline sync (M10–M12)
is a design change, not a patch.
