# Closed Alpha Deploy Runbook

This repo is prepared for a `closed_alpha` release on a single Ubuntu VPS.

## Topology
- One VPS / VM only (for single instance) OR multiple instances with Redis.
- `Caddy` terminates TLS and serves the web build from `/srv/frontier/web`.
- `/api/*` and `/ws` reverse proxy to `127.0.0.1:3101`.
- `Node 24` runs the compiled server process through `systemd`.
- `PostgreSQL 17` runs on the same machine.
- `Redis 7` (optional) enables multi-instance deployment with WebSocket fanout.

## Required production env
Create `/etc/frontier/server.env` with at least:

```env
NODE_ENV=production
DATABASE_URL=postgresql://frontier:<password>@localhost:5432/frontier_dominion?schema=public
JWT_SECRET=<32+ random bytes>
PORT=3101
LAUNCH_PHASE=closed_alpha
REGISTRATION_MODE=login_only
STORE_ENABLED=false
SESSION_TTL_SECONDS=604800
COOKIE_DOMAIN=alpha.example.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
AUTH_RATE_LIMIT_MAX=15
AUTH_RATE_LIMIT_WINDOW_MS=60000
COMMAND_RATE_LIMIT_MAX=30
COMMAND_RATE_LIMIT_WINDOW_MS=60000
OPS_METRICS_TOKEN=<long-random-token>
# For single instance:
REALTIME_ADAPTER=in_memory
REDIS_URL=
# For multi-instance (uncomment):
# REALTIME_ADAPTER=redis
# REDIS_URL=redis://localhost:6379
ALLOWED_ORIGINS=https://alpha.example.com
TRUST_PROXY=true
GRACEFUL_SHUTDOWN_TIMEOUT_MS=30000
# OpenTelemetry (optional, for distributed tracing)
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=frontier-server
```

Notes:
- `COOKIE_SECURE=true`, `COOKIE_DOMAIN`, `DATABASE_URL`, and `OPS_METRICS_TOKEN` are required in production.
- `ALLOWED_ORIGINS` should contain your frontend domain(s), comma-separated for multiple origins.
- `TRUST_PROXY=true` is required when running behind a reverse proxy (Caddy, Nginx).
- Keep the imperial market disabled in alpha: `STORE_ENABLED=false`.
- Public signup stays closed: `REGISTRATION_MODE=login_only`.
- For multi-instance deployment, set `REALTIME_ADAPTER=redis` and configure `REDIS_URL`.
- For distributed tracing, set `OTEL_ENABLED=true` and point to your OTLP collector (Jaeger, Grafana Tempo, etc).

## Machine bootstrap
1. Install Node 24, PostgreSQL 17, Redis 7 (optional), and Caddy.
2. Create deploy directories:
   - `sudo mkdir -p /srv/frontier/app`
   - `sudo mkdir -p /srv/frontier/web`
   - `sudo mkdir -p /etc/frontier`
   - `sudo mkdir -p /var/backups/frontier`
3. Copy the repository to `/srv/frontier/app`.
4. Copy the env file to `/etc/frontier/server.env`.

## Build and migrate
From `/srv/frontier/app`:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @frontier/shared build
corepack pnpm --filter @frontier/server build
corepack pnpm --filter @frontier/web build
cd apps/server
npx prisma migrate deploy
cd ../..
```

## Provision alpha users
Keep the user list outside the repo. Use a JSON file like:

```json
[
  {
    "username": "alpha_commander_01",
    "password": "TempPass123!",
    "cityName": "Ashen Gate"
  },
  {
    "username": "alpha_commander_02",
    "password": "TempPass123!",
    "cityName": "Bronze Crown",
    "coordinate": { "x": 12, "y": 19 }
  }
]
```

Provision them with:

```bash
corepack pnpm alpha:provision -- --input /absolute/path/alpha-users.json
```

## Publish the web build
```bash
rsync -av --delete /srv/frontier/app/apps/web/dist/ /srv/frontier/web/
```

## Install systemd service
1. Copy `deploy/frontier-server.service` to `/etc/systemd/system/frontier-server.service`.
2. Run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable frontier-server
sudo systemctl restart frontier-server
sudo systemctl status frontier-server
```

## Install Caddy
1. Copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile`.
2. Replace `alpha.example.com` with the real domain.
3. Run:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

## Install database backup cron
1. Copy `deploy/backup-postgres.sh` to `/usr/local/bin/frontier-backup-postgres.sh` and make it executable.
2. Add the line from `deploy/frontier-db-backup.cron` to root crontab:

```bash
sudo crontab -e
```

## Acceptance checks
Run these after each deploy:

```bash
# Basic health check
curl -f https://alpha.example.com/api/health

# Liveness probe (for Kubernetes/Docker)
curl -f https://alpha.example.com/api/health/live

# Readiness probe (checks database connectivity)
curl -f https://alpha.example.com/api/health/ready

# Ops health (requires token)
curl -f -H "x-ops-token: <OPS_METRICS_TOKEN>" https://alpha.example.com/api/ops/health

# Prometheus metrics (requires token)
curl -f -H "x-ops-token: <OPS_METRICS_TOKEN>" https://alpha.example.com/metrics

# Bootstrap check
curl -f https://alpha.example.com/api/public/bootstrap

# E2E smoke tests
corepack pnpm smoke:e2e
corepack pnpm smoke:field-command
```

Expected alpha behavior:
- `/login` works.
- `/register` redirects back to login in the web app.
- `POST /api/auth/register` returns `403 REGISTRATION_CLOSED`.
- `/api/store/*` returns `403 FEATURE_DISABLED`.
- `/app/market` redirects to `/app/dashboard`.
- WebSocket connects through the same origin `/ws` path.

## Operations notes
- Review logs with `journalctl -u frontier-server -f`.
- Logs are in JSON format (structured logging with Pino).
- This phase is single-node only. Do not add a second app instance while `REALTIME_ADAPTER=in_memory`.
- Public-launch scope is tracked separately in [public-launch-backlog.md](./public-launch-backlog.md) so alpha hardening and launch work do not drift together.
- Graceful shutdown: Server closes connections properly on SIGTERM/SIGINT with a configurable timeout.
- WebSocket heartbeat: Dead connections are automatically cleaned up every 30 seconds.
- Phaser chunk size warnings are known and not a release blocker for closed alpha.
