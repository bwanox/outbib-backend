# reminders-service

Reminders service for **Outbib**.

This service owns **user reminders** (medication + appointment). It stores reminders in **PostgreSQL** (source of truth), maintains a **Redis ZSET** schedule index for fast due lookup, and runs a background **scheduler** that detects due reminders and (optionally) publishes a `ReminderDueV1` event.

- **API base**: `http://localhost:3001` (via `docker compose`)
- **Health**: `GET /health` → `{"status":"ok"}`
- **Swagger**: `GET /docs`

---

## Technology

- **Runtime**: Node.js 20
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma (`prisma`, `@prisma/client`)
- **Cache / schedule index**: Redis (ZSET)
- **Time handling**: Luxon (`luxon`)
- **Auth**: JWT Bearer token (`JwtAuthGuard`)
- **Messaging**: NATS (publishes `ReminderDueV1`, can be disabled)
- **API docs**: Swagger UI at `/docs`
- **Validation**: `class-validator` + `class-transformer` via Nest global `ValidationPipe`

---

## What this service owns

- Reminders domain model
  - **Medication** reminders
    - `title`, optional `dosageText`, `timesOfDay` (array of `HH:mm`), optional `startDate`/`endDate`
  - **Appointment** reminders
    - `title`, `appointmentAt`, optional `location`/`notes`
- Reminder state
  - `ACTIVE | SNOOZED | COMPLETED | CANCELLED`
- Scheduling fields
  - `lastTriggeredAt`, `nextTriggerAt`, `snoozedUntil`
- Redis schedule index
  - ZSET key: `reminders:due` (see `REDIS_DUE_ZSET_KEY`)
- Background scheduler worker
  - periodically queries Redis/Postgres and triggers due processing

**Important rule**: PostgreSQL is the **source of truth**. Redis is only an **index**. If Redis is flushed, the scheduler can rebuild the ZSET from Postgres.

---

## Architecture (high level)

### Data flow

**Write paths** update both stores:

- `POST /reminders`
  - Insert reminder in Postgres
  - `ZADD reminders:due <timestamp> <reminderId>`
- `PATCH /reminders/:id`
  - Update reminder in Postgres
  - Recompute `nextTriggerAt`
  - `ZADD reminders:due ...` (reschedule)
- `DELETE /reminders/:id` (soft delete)
  - Set `deletedAt` + mark cancelled + clear `nextTriggerAt`
  - `ZREM reminders:due <reminderId>`
- `POST /reminders/:id/snooze`
  - Set `status=SNOOZED`, `snoozedUntil`, `nextTriggerAt=snoozedUntil`
  - `ZADD reminders:due ...`

**Read path**:

- `GET /reminders` reads from **Postgres only**.

### Scheduling

- The scheduler runs on an interval (`SCHEDULER_TICK_MS`) and processes at most `SCHEDULER_BATCH_SIZE` reminders per tick.
- On startup, it can rebuild the Redis schedule from Postgres.

### Events

When a reminder becomes due, the service can publish:

- Event: `ReminderDueV1`
- Subject: `outbib.reminders.reminder.due.v1`

Disable publishing (common in local/dev):

- `NATS_DISABLED=true`

---

## Configuration

Environment variables (also documented in `docker-compose.yml`):

| Variable | Required | Default | Description |
|---|---:|---|---|
| `PORT` | no | `3000` | HTTP port inside container/process |
| `DATABASE_URL` | **yes** | – | Prisma Postgres connection string |
| `REDIS_URL` | no | `redis://redis:6379` | Redis connection string |
| `JWT_SECRET` | no | `dev-secret` | Secret used to verify JWTs |
| `NATS_DISABLED` | no | `false` | If `true`, do not publish NATS events |
| `NATS_URL` | no | `nats://nats:4222` | NATS server URL (only used if not disabled) |
| `SCHEDULER_DISABLED` | no | `false` | If `true`, scheduler won’t run |
| `SCHEDULER_TICK_MS` | no | `1000` | Scheduler interval in ms |
| `SCHEDULER_BATCH_SIZE` | no | `50` | Reminders processed per tick |

### Example `DATABASE_URL`

- `postgresql://outbib:outbib@postgres:5432/outbib_reminders`

---

## Setup & running

### Option A: Docker Compose (recommended)

From repo root (`outbib-backend/`), build and start dependencies + service:

- `postgres`
- `redis`
- `reminders-migrate` (one-shot job)
- `reminders-service`

This repository already wires this up in `docker-compose.yml`.

Expected ports:

- Reminders service: `localhost:3001` → container `3000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

### Option B: Local dev (without Docker)

You can run the service with your local Node.js, but you must provide Postgres + Redis and set env vars.

Typical flow:

1. Install dependencies at monorepo root
2. Ensure `DATABASE_URL` points to a reachable Postgres database
3. Run Prisma migrations
4. Start the service

---

## Database & migrations (Prisma)

Prisma schema is in `apps/reminders-service/prisma/schema.prisma`.

Common scripts (from `apps/reminders-service/` workspace):

- `prisma:generate` → generate Prisma client
- `prisma:migrate:dev` → create/apply migrations in dev
- `prisma:migrate:deploy` → apply migrations in production/CI
- `prisma:migrate:status` → show migration status

In Docker Compose, migrations are applied automatically by the `reminders-migrate` service:

- Command: `npx prisma migrate deploy`

---

## Authentication

All reminders endpoints require:

- Header: `Authorization: Bearer <jwt>`

The service expects the JWT payload to include a user identifier at:

- `req.user.sub`

If you are testing locally, you must use the same `JWT_SECRET` as the issuer of the token.

---

## API endpoints

### Health / misc

- `GET /health`
  - **Auth**: none
  - **Response**: `{ "status": "ok" }`

- `GET /` (simple hello)
  - **Auth**: none

### Reminders (requires JWT)

Base route: `/reminders`

- `POST /reminders`
  - Create a reminder
  - **Auth**: required

- `GET /reminders`
  - List current user reminders (non-deleted)
  - **Auth**: required

- `PATCH /reminders/:id`
  - Update a reminder (must belong to user)
  - **Auth**: required

- `DELETE /reminders/:id`
  - Soft delete (sets `deletedAt`, cancels, removes from Redis schedule)
  - **Auth**: required

- `POST /reminders/:id/snooze`
  - Snooze until a specific ISO datetime
  - **Auth**: required

- `POST /reminders/rebuild-cache`
  - Rebuild Redis ZSET from Postgres
  - **Auth**: required (admin restriction may be added later)

### Request/response payloads

Exact DTO shapes are defined in code:

- `CreateReminderDto` → `src/reminders/dto/create-reminder.dto`
- `UpdateReminderDto` → `src/reminders/dto/update-reminder.dto`
- `SnoozeDto` → `src/reminders/dto/snooze.dto`

For the most accurate schema, use Swagger:

- `GET /docs`

Below are typical examples inferred from the service logic:

#### Create: appointment reminder

- `POST /reminders`

Body (example):

- `type`: `APPOINTMENT`
- `title`: string
- `timezone`: IANA zone (e.g. `Europe/Paris`)
- `appointmentAt`: ISO datetime
- optional: `notes`, `location`

#### Create: medication reminder

- `POST /reminders`

Body (example):

- `type`: `MEDICATION`
- `title`: string
- `timezone`: IANA zone
- `timesOfDay`: array of `HH:mm` strings (e.g. `["08:00","20:00"]`)
- optional: `dosageText`, `startDate`, `endDate`, `notes`

#### Snooze

- `POST /reminders/:id/snooze`

Body:

- `snoozedUntil`: ISO datetime

---

## Docker image notes

The Dockerfile (`apps/reminders-service/Dockerfile`) is a multi-stage build:

- **builder stage**
  - installs dev deps
  - builds `@outbib/contracts`
  - generates Prisma client
  - builds Nest app
- **runtime stage**
  - installs production deps (`npm ci --omit=dev`)
  - copies compiled `dist/` and Prisma artifacts

---

## Troubleshooting

### `relation "public.Reminder" does not exist`

This means the database schema hasn’t been applied to the target database.

- Ensure migrations ran:
  - In Compose: check `reminders-migrate` logs
  - Locally: run `prisma migrate deploy` or `prisma migrate dev`

### Auth errors (401)

- Ensure you send `Authorization: Bearer <jwt>`
- Ensure `JWT_SECRET` here matches the issuer.

### Redis issues

- If Redis was flushed, you can rebuild the schedule:
  - `POST /reminders/rebuild-cache`

---

## Related files

- Service entrypoint: `src/main.ts`
- Module wiring: `src/reminders/reminders.module.ts`
- Controller: `src/reminders/reminders.controller.ts`
- Core logic: `src/reminders/reminders.service.ts`
- Prisma schema: `prisma/schema.prisma`
- Dockerfile: `apps/reminders-service/Dockerfile`
- Compose wiring: `docker-compose.yml`
