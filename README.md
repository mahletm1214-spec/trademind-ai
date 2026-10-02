# TradeMind AI — V32 Production Release

TradeMind AI is an ICT-focused trading journal and process analytics workspace. It connects Trade Planner, Journal, Performance Analytics, Equity Curve, Daily Reflection, AI Coach, Personal Trader Profile, Goals, Backtest Lab, Economic Calendar, and Reports through authenticated user-scoped data.

## V32 production hardening
- Production package/version: `32.0.0`
- Request IDs via `X-Request-ID` for API troubleshooting.
- Authenticated API responses are marked `Cache-Control: no-store`.
- JSON request body limit reduced to 1 MB.
- Security headers including `nosniff`, `DENY` framing, strict referrer policy, and restricted browser permissions.
- Bounded authentication attempt guard with periodic cleanup.
- API 404 JSON responses and sanitized global error responses.
- Graceful shutdown waits for the HTTP server before closing PostgreSQL.
- Migration `007_v32_integrity_indexes.sql` adds indexes for journal/report/reflection/calendar/AI-review access patterns.
- PostgreSQL backup and restore helper scripts.

## Environment
Copy `.env.example` to `.env` and set production values. Never commit `.env` or provider keys.

```bash
npm install
npm run verify-env
npm run migrate
npm start
```

For production, set `NODE_ENV=production`, a real `DATABASE_URL`, and an explicit `CORS_ORIGIN` (do not use `*`). `AI_API_KEY` and economic-calendar provider credentials are optional; when absent, the app remains provider-ready and does not pretend external data is live.

## Database backup / restore
Requires PostgreSQL client tools (`pg_dump` / `pg_restore`) and a valid `DATABASE_URL`.

```bash
DATABASE_URL='postgresql://...' ./scripts/backup-db.sh
DATABASE_URL='postgresql://...' ./scripts/restore-db.sh trademind-backup-YYYYMMDDTHHMMSSZ.dump
```

Test backups separately from the production database before relying on them for recovery. Restore replaces matching database objects; use a staging database for recovery drills whenever possible.

## Docker

```bash
docker compose up --build
```

The compose file provisions PostgreSQL with a healthcheck and starts the app after the database is healthy. Change the example database password before exposing the stack beyond local development.

## Health and readiness
- `GET /api/health` — process and dependency status.
- `GET /api/ready` — returns ready only when PostgreSQL is reachable.
- Protected routes require a Bearer session token and always scope database queries to the authenticated user.

## Data note
The equity curve is calculated from recorded realized R/P&L on closed journal trades. The application does not assume a starting account balance.

## AI and economic calendar note
AI Coach is process-focused and uses the signed-in user's journal/reflection context. It is not a live signal, entry, target, execution, or price-prediction service. Economic Calendar is only described as live when an external provider is configured; otherwise stored/provider-ready states are shown.


## Public deployment

This project is deploy-ready for a Docker web host such as Render. The included `render.yaml` creates the web service and PostgreSQL database, and the production start command runs migrations before starting the API.

### Render
1. Push this project to a Git repository.
2. In Render, create a Blueprint from the repository and select `render.yaml`.
3. Set the required secret `CORS_ORIGIN` to the final public web URL.
4. Add `AI_API_KEY` only if AI features should use a real provider. Leave it empty if the app should remain provider-ready without live AI.
5. Configure the economic-calendar provider variables only when a real provider is available.
6. Deploy. The `/api/ready` endpoint is used as the health check.

The app does not fabricate production trade data. Demo/preview equity data stays separate from authenticated PostgreSQL production data.

### Important
A public URL cannot be created from the ZIP alone: the project must be connected to a hosting account/repository. Do not put database passwords or API keys into source control.
