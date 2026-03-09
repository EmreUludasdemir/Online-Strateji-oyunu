# Frontier Dominion

Frontier Dominion is a browser-based online strategy game MVP. Each player commands one persistent frontier city, grows resources on the server, upgrades civic districts, trains troops, researches doctrines, scouts a fogged world map, and launches authoritative marches that resolve into persistent battle reports.

## Stack

- Frontend: React, Vite, TypeScript, Phaser, CSS Modules
- Backend: Node.js, Express, TypeScript, raw WebSocket notifications
- Data: PostgreSQL, Prisma
- Tooling: pnpm workspace, Docker Compose, Vitest, Playwright

## Monorepo layout

```text
.
├─ apps
│  ├─ server
│  │  ├─ prisma
│  │  │  ├─ migrations
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  ├─ src
│  │  │  ├─ game
│  │  │  │  ├─ commands.ts
│  │  │  │  ├─ constants.ts
│  │  │  │  ├─ engine.ts
│  │  │  │  ├─ events.ts
│  │  │  │  ├─ queries.ts
│  │  │  │  ├─ reconcile.ts
│  │  │  │  ├─ service.ts
│  │  │  │  └─ shared.ts
│  │  │  ├─ lib
│  │  │  ├─ middleware
│  │  │  ├─ routes
│  │  │  ├─ app.ts
│  │  │  └─ index.ts
│  │  └─ tests
│  └─ web
│     └─ src
│        ├─ components
│        ├─ lib
│        ├─ pages
│        ├─ styles
│        ├─ api.ts
│        └─ App.tsx
├─ packages
│  └─ shared
│     └─ src
├─ references
├─ scripts
│  ├─ smoke_kingdom_core.mjs
│  └─ web_game_playwright_client.js
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
├─ progress.md
└─ tsconfig.base.json
```

## Implemented MVP scope

### Core systems

- Register, login, logout, and cookie-based sessions
- One persistent city per player
- Server-authoritative resource growth for wood, stone, food, and gold
- Server-side building upgrades with a single active upgrade queue
- Eight building types:
  - Town Hall
  - Farm
  - Lumber Mill
  - Quarry
  - Gold Mine
  - Barracks
  - Academy
  - Watchtower
- Troop training with one active training queue
- Commander-lite system with one starter commander per account
- Research-lite system with one active research queue
- March-based combat instead of instant attacks
- Compatibility `POST /api/game/attacks` route that now creates a default march
- Deterministic battle resolution and persistent battle reports
- Fog-of-war and chunked world queries on a 64x64 logical map
- WebSocket notifications for city, march, fog, and report updates
- Alliance create, join, leave, chat, and queue-help flows

### Frontend

- City dashboard with resource bar, district upgrades, troop drill panel, and research board
- Phaser-based world map with visible, discovered, and hidden tiles
- Settlement selection, commander assignment, troop sliders, march dispatch, and recall
- Battle report ledger with loot and troop losses
- Alliance chamber with roster, chat, and help request handling
- `window.render_game_to_text()` and `window.advanceTime(ms)` hooks for browser validation
- Mobile bottom navigation for narrow screens

### Persistence

PostgreSQL persists:

- users
- cities
- buildings
- building upgrades
- troop garrisons
- troop training queues
- commanders
- research levels and queues
- marches
- fog tiles
- battle reports
- alliances
- alliance members
- alliance chat messages
- alliance help requests and responses

## Requirements

- Node.js 24+
- Corepack
- Docker Desktop or Docker Engine

## Install

```powershell
corepack enable
corepack pnpm install
Copy-Item .env.example apps/server/.env
```

Unix shell:

```bash
cp .env.example apps/server/.env
```

Default local ports:

- Web app: `5173`
- API + WebSocket: `3101`
- PostgreSQL: `5433`

## Environment

`apps/server/.env` supports:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=test"
JWT_SECRET="replace-this-with-a-long-secret"
PORT=3101
SESSION_TTL_SECONDS=604800
COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
AUTH_RATE_LIMIT_MAX=15
AUTH_RATE_LIMIT_WINDOW_MS=60000
COMMAND_RATE_LIMIT_MAX=30
COMMAND_RATE_LIMIT_WINDOW_MS=60000
```

## Database workflow

Start PostgreSQL:

```powershell
docker compose up -d
```

Generate Prisma client if needed:

```powershell
corepack pnpm db:generate
```

Apply migrations:

```powershell
corepack pnpm db:migrate
```

Seed demo data:

```powershell
corepack pnpm db:seed
```

Seed is idempotent for the shipped demo users. Existing demo accounts are also backfilled with missing Kingdom Core infrastructure on the next authenticated request.

Demo accounts:

- `demo_alpha / demo12345`
- `demo_beta / demo12345`
- `demo_gamma / demo12345`

Seed also creates the demo alliance `Bronze Concord [BRZ]` with `demo_alpha` as leader and `demo_beta` as a member.

## Run locally

Start both apps:

```powershell
corepack pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173).

## API surface

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Game:

- `GET /api/game/state`
- `POST /api/game/buildings/:type/upgrade`
- `GET /api/game/world/chunk?centerX=&centerY=&radius=`
- `GET /api/game/map`
- `GET /api/game/troops`
- `POST /api/game/troops/train`
- `GET /api/game/commanders`
- `GET /api/game/alliance`
- `POST /api/game/alliances`
- `POST /api/game/alliances/:id/join`
- `POST /api/game/alliances/leave`
- `POST /api/game/alliance/chat`
- `POST /api/game/alliance-help`
- `POST /api/game/alliance-help/:id/respond`
- `POST /api/game/research/start`
- `POST /api/game/marches`
- `POST /api/game/marches/:id/recall`
- `POST /api/game/attacks`
- `GET /api/game/reports`

## Verification

Build everything:

```powershell
corepack pnpm build
```

Run tests:

```powershell
corepack pnpm test
```

Run the Playwright browser smoke against running local dev servers:

```powershell
corepack pnpm smoke:e2e
```

The smoke script:

- logs in as `demo_alpha`
- verifies dashboard troops, commanders, and research
- verifies the seeded alliance chamber and member count
- opens the map and waits for the chunk to load
- dispatches a march to a visible nearby city
- waits for resolution
- verifies the reports screen
- writes a screenshot to `output/kingdom-core-e2e.png`

## Gameplay defaults

- Logical world size: `64 x 64`
- Default chunk radius in the UI: `8`
- Max march distance: `10`
- Starting resources:
  - `900 wood`
  - `900 stone`
  - `1000 food`
  - `600 gold`
- Starting troops:
  - `48 infantry`
  - `32 archers`
  - `20 cavalry`
- Starting buildings: all 8 building types at level `1`
- Starting research: all doctrine lanes at level `0`
- Starting commander: one primary vanguard commander
- Resource production:
  - Farm: `20 food / minute / level`
  - Lumber Mill: `16 wood / minute / level`
  - Quarry: `16 stone / minute / level`
  - Gold Mine: `10 gold / minute / level`

## Known limitations

- One city per player
- Alliance roles stop at `leader/officer/member`; role management UI is not exposed yet
- Alliance help currently accelerates queues with a flat time reduction; there is no deeper alliance tech tree
- No PvE camps or gathering nodes yet
- Combat resolves at march ETA in a single authoritative step; there is no live battle instance
- Reports are currently listed as the latest 20 entries without filtering
- Web frontend tests are still smoke-level only; dedicated React tests are not present
- Phaser is split into its own lazy-loaded chunk, but that vendor chunk is still large
- Cookie and CORS defaults are aimed at localhost development rather than hardened production deployment

## Next improvements

- Add PvE camps and resource nodes
- Add alliance role management, donations, and shared territory mechanics
- Expand commander progression beyond fixed template bonuses
- Add richer map overlays, march trails, and report filtering
- Add production observability, Redis-backed event fanout, and deeper abuse controls
