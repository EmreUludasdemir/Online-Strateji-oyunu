# Frontier Dominion

Frontier Dominion is a browser-based strategy MVP where each player manages one frontier city, gathers resources over time, upgrades buildings, scouts a grid map, and launches simple deterministic attacks against nearby settlements.

## Stack

- Frontend: React, Vite, TypeScript, Phaser, CSS Modules
- Backend: Node.js, Express, TypeScript, raw WebSocket notifications
- Data: PostgreSQL, Prisma
- Tooling: pnpm workspace, Docker Compose, Vitest, Playwright validation client

## Project tree

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
│  │  │  ├─ lib
│  │  │  ├─ middleware
│  │  │  ├─ routes
│  │  │  ├─ types
│  │  │  ├─ app.ts
│  │  │  └─ index.ts
│  │  └─ tests
│  └─ web
│     ├─ public
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
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## Features in this MVP

- Username/password register, login, logout, and session cookies
- One persistent city per player
- Server-authoritative resource growth for wood, stone, food, and gold
- Five buildings with levels and server-timed upgrades
- Single active upgrade slot per city
- Grid-based world map rendered with Phaser
- Nearby-city inspection and server-resolved attack reports
- PostgreSQL persistence for users, cities, buildings, upgrades, and battle reports
- Demo seed users and nearby seeded cities
- Shared DTOs and validation schemas across frontend and backend

## Local setup

### Requirements

- Node.js 24+
- Corepack
- Docker Desktop or Docker Engine

### Install

```powershell
corepack enable
corepack pnpm install
Copy-Item .env.example apps/server/.env
```

If you prefer a Unix shell, use:

```bash
cp .env.example apps/server/.env
```

The default local ports are:

- Web app: `5173`
- API + WebSocket server: `3101`
- PostgreSQL container: `5433`

## Database workflow

Start PostgreSQL:

```powershell
docker compose up -d
```

Apply the migration:

```powershell
corepack pnpm db:migrate
```

Seed the demo users:

```powershell
corepack pnpm db:seed
```

Demo accounts:

- `demo_alpha / demo12345`
- `demo_beta / demo12345`
- `demo_gamma / demo12345`

## Run the app

```powershell
corepack pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173).

The frontend talks to the backend through Vite for HTTP requests and directly to `ws://localhost:3101/ws` for notification events.

## Tests and verification

Run the automated test suite:

```powershell
corepack pnpm test
```

Run the production build:

```powershell
corepack pnpm build
```

The server tests reset the PostgreSQL `test` schema automatically and cover:

- Resource reconciliation
- Upgrade timing math
- Deterministic combat and loot caps
- Register/login/logout
- Upgrade queue enforcement
- Attack flow and report persistence

## Gameplay defaults

- Map size: `20 x 20`
- Starting buildings: all five building types at level 1
- Starting resources: `600 wood`, `600 stone`, `600 food`, `400 gold`
- Upgrade durations:
  - Town Hall: `60 seconds * target level`
  - Other buildings: `30 seconds * target level`
- Attack range: Manhattan distance `<= 4`
- Attack cost: `40 food + 20 gold`

## Known limitations

- One city per player and no alliance, chat, or diplomacy systems
- Combat is formula-based only; there are no troop compositions or movement timers
- The frontend relies mainly on integration coverage plus browser smoke validation; there are no dedicated React component tests yet
- The production build still warns about bundle size because Phaser remains a large vendor chunk, even though the map route is lazy-loaded
- Local auth/session setup is optimized for localhost development, not hardened production deployment

## Next improvements

- Add troop recruitment, march timers, and unit-based combat resolution
- Add queued upgrades, building completion notifications, and richer world-map interactions
- Trim the Phaser vendor footprint further and add more frontend tests
- Add production-grade CORS, cookie, and deployment configuration
- Add report filtering, map fog-of-war, and mobile-specific interaction polish
