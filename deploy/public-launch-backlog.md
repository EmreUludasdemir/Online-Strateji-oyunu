# Public Launch Backlog

This repo is currently tuned for `closed alpha`:

- `registrationMode=login_only`
- `storeEnabled=false`
- `REALTIME_ADAPTER=in_memory`
- single-node deployment behind the bundled Caddy/systemd templates

The following items are intentionally deferred so alpha hardening stays separate from public-launch scope:

## Commerce

- Replace sandbox/no-op validation with real store verification.
- Add purchase reconciliation, retry handling, and operator-visible billing diagnostics.
- Re-open market UI only after server-side validation is live end to end.

## Realtime and Scale

- Implement a production Redis fanout adapter for WebSocket and invalidation events.
- Document multi-instance deployment topology and sticky-session strategy if sockets remain stateful.
- Add load and reconnect validation for multi-node conditions.

## Observability

- Add structured error reporting beyond journalctl snapshots.
- Add dashboards or alerting for HTTP latency, WebSocket churn, and queue pressure.
- Add offsite backup rotation in addition to the local `pg_dump` retention used for alpha.

## Release Gates

- Keep alpha guards in place until the items above are complete.
- Promote from `closed_alpha` to `public` only after store, realtime, and observability tracks have separate acceptance runs.
