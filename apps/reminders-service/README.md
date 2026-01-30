# reminders-service (Calendar + Reminders Engine)

Reminders + Calendar scheduling service for **Outbib**.

This service owns the user’s **health schedule** and powers the **Calendar/Reminders timeline** in the app. It supports:

- **Medication schedules** (recurring doses)
- **Appointments** (one-time events)
- **Habits / trackers** (e.g., water intake goal + optional nudges)
- Optional **notes / important health tasks** (simple scheduled items)

It stores schedule sources and user tracking data in **PostgreSQL** (source of truth), maintains a **Redis ZSET** schedule index for fast due lookup, and runs a background **scheduler** that detects due items and (optionally) publishes a `ReminderDueV1` event for notification pipelines.

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

### 1) Schedule sources (the “plan”)
These represent the user’s long-term schedule rules.

- **Medication** schedules
  - `title`, optional `dosageText`, `timesOfDay` (array of `HH:mm`), optional `startDate`/`endDate`, optional `notes`
- **Appointment** items
  - `title`, `appointmentAt`, optional `location`/`notes`
- **Habit / tracker** definitions
  - Example: **water intake**
    - `dailyGoalMl`
    - optional `nudgeEnabled` + `nudgeEveryMinutes` + `activeHours` (e.g., `08:00-22:00`)
- **Health notes / tasks** (optional)
  - `title`, optional `scheduledAt` or simple recurrence (kept minimal)

### 2) Calendar occurrences (the “instances”)
The Calendar view needs per-occurrence state. This service exposes occurrences for date ranges (day/week/month) and allows updating status for a specific occurrence.

Occurrence state (per instance):
- `SCHEDULED | DONE | SKIPPED | MISSED | CANCELLED`

> Implementation detail: occurrences may be **computed on demand** for a time window or **materialized** for a rolling window (e.g., next 7–30 days). In both cases, status updates persist in Postgres.

### 3) Tracker logs (habits)
Habits like water are not just “one reminder”. They also track daily progress.

- **Water log**
  - per user + date: `totalMl`, optional `entries[]` (time + amount)

### 4) Reminder state (for scheduling engine)
For schedule-indexed items (anything that can become “due”), the service uses:

- `ACTIVE | SNOOZED | CANCELLED` (source-level operational state)
- Scheduling fields
  - `lastTriggeredAt`, `nextTriggerAt`, `snoozedUntil`

### 5) Redis schedule index
- ZSET key: `reminders:due` (see `REDIS_DUE_ZSET_KEY`)
- Members are scheduled items with a computed `nextTriggerAt`

### 6) Background scheduler worker
- Periodically queries Redis/Postgres and triggers due processing
- Optionally publishes due events (for notifications)

**Important rule**: PostgreSQL is the **source of truth**. Redis is only an **index**. If Redis is flushed, the scheduler can rebuild the ZSET from Postgres.

---

## Architecture (high level)

### Conceptual model

- **Source** = schedule rule (med course, appointment, habit definition)
- **Occurrence** = one instance on a specific date/time shown in calendar
- **Tracker log** = daily progress (water, etc.)

### Data flow

#### Write paths update Postgres and (when applicable) Redis index:

- `POST /reminders`
  - Insert schedule source in Postgres
  - Compute `nextTriggerAt`
  - `ZADD reminders:due <timestamp> <reminderId>`
- `PATCH /reminders/:id`
  - Update schedule source in Postgres
  - Recompute `nextTriggerAt`
  - `ZADD reminders:due ...` (reschedule)
- `DELETE /reminders/:id` (soft delete)
  - Set `deletedAt` + mark cancelled + clear `nextTriggerAt`
  - `ZREM reminders:due <reminderId>`
- `POST /reminders/:id/snooze`
  - Set `status=SNOOZED`, `snoozedUntil`, `nextTriggerAt=snoozedUntil`
  - `ZADD reminders:due ...`

#### Calendar read path (occurrences)
Calendar screens do not need raw sources only; they need **occurrences** for a window:

- `GET /calendar?from=...&to=...`
  - Returns occurrences (med doses, appointments, habit nudges if enabled) in the range
  - Includes per-occurrence status (done/missed/skipped)
  - Sorted by time and grouped by day (client can also group)

#### Occurrence actions
The user updates state for a specific occurrence (not the whole schedule):

- Mark done / skipped
- Snooze a specific due occurrence (creates/updates `snoozedUntil` and reschedules if needed)

#### Tracker logging (water)
Trackers are updated independently from due scheduling:

- `POST /trackers/water/log` adds amount for today (or provided date)
- `GET /trackers/water?date=...` fetches daily progress

### Scheduling

- The scheduler runs on an interval (`SCHEDULER_TICK_MS`) and processes at most `SCHEDULER_BATCH_SIZE` items per tick.
- On startup, it can rebuild the Redis schedule from Postgres.
- When an item becomes due:
  - It can be turned into a due occurrence (if materialized), or simply emit a due event and update `lastTriggeredAt/nextTriggerAt`.

### Events

When a scheduled item becomes due, the service can publish:

- Event: `ReminderDueV1`
- Subject: `outbib.reminders.reminder.due.v1`

This event is compatible with notification pipelines (push/email/SMS later).

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
| `SCHEDULER_BATCH_SIZE` | no | `50` | Items processed per tick |

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

## Running in Kubernetes (k8s)

Kubernetes manifests live under `outbib-backend/k8s/base/`.

### reminders-service deployment

File: `k8s/base/reminders-service.yaml`

- Uses an **initContainer** named `migrate` to run DB migrations before the application starts:
  - `npm -w reminders-service run prisma:migrate:deploy`
- Then starts the app container (`reminders-service`) on port `3000`.
- Loads configuration from:
  - ConfigMap: `outbib-config` (`k8s/base/configmap.yaml`)
  - Secret: `outbib-secrets`
- Sets `DATABASE_URL` for reminders DB: `postgresql://outbib:outbib@postgres:5432/outbib_reminders`

### Probes (readiness/liveness)

`k8s/base/reminders-service.yaml` probes `/health`.

---

## Authentication

All endpoints that read/write user data require:

- Header: `Authorization: Bearer <jwt>`

The service expects the JWT payload to include a user identifier at:

- `req.user.sub`

---

## API endpoints

### Health / misc

- `GET /health`
  - **Auth**: none
  - **Response**: `{ "status": "ok" }`

- `GET /` (simple hello)
  - **Auth**: none

---

### Schedule sources (requires JWT)

Base route: `/reminders`

These endpoints manage the user’s **schedule sources** (plans/rules).

- `POST /reminders`
  - Create a schedule source (MEDICATION / APPOINTMENT / HABIT / NOTE)
- `GET /reminders`
  - List current user sources (non-deleted)
- `PATCH /reminders/:id`
  - Update a source (must belong to user)
- `DELETE /reminders/:id`
  - Soft delete (sets `deletedAt`, cancels, removes from Redis schedule)
- `POST /reminders/:id/snooze`
  - Snooze the next due trigger (source-level snooze)
- `POST /reminders/rebuild-cache`
  - Rebuild Redis ZSET from Postgres (admin restriction may be added later)

---

### Calendar (occurrences) (requires JWT)

Base route: `/calendar`

These endpoints power the Calendar screen by returning **occurrences** for date ranges.

- `GET /calendar?from=<iso>&to=<iso>`
  - Returns occurrences in the given time range:
    - medication dose occurrences
    - appointment occurrences
    - habit nudges (if enabled)
    - optional note/task occurrences
  - Includes per-occurrence status when available

- `GET /calendar/day?date=YYYY-MM-DD&tz=<IANA>`
  - Optimized “timeline” for a single day

- `POST /calendar/events/:eventId/complete`
  - Mark a specific occurrence as DONE (records `completedAt`)

- `POST /calendar/events/:eventId/skip`
  - Mark a specific occurrence as SKIPPED

- `POST /calendar/events/:eventId/snooze`
  - Snooze a specific occurrence until ISO datetime (updates scheduling index if it affects nextTriggerAt)

> Note: `eventId` may be a materialized row id, or a stable computed id derived from `(sourceId + scheduledTime)`. In either case, status changes persist.

---

### Trackers (habits) (requires JWT)

Base route: `/trackers`

#### Water intake
- `POST /trackers/water/log`
  - Add water amount (ml) for today (or specified date)
- `GET /trackers/water?date=YYYY-MM-DD`
  - Fetch daily total + entries + goal

(Other trackers can follow the same pattern later.)

---

## Request/response payloads

Exact DTO shapes are defined in code (Swagger is the source of truth):

- `CreateReminderDto` → `src/reminders/dto/create-reminder.dto`
- `UpdateReminderDto` → `src/reminders/dto/update-reminder.dto`
- `SnoozeDto` → `src/reminders/dto/snooze.dto`
- Calendar + tracker DTOs live under:
  - `src/calendar/dto/*`
  - `src/trackers/dto/*`

For the most accurate schema, use Swagger:

- `GET /docs`

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
- Calendar module: `src/calendar/*`
- Trackers module: `src/trackers/*`
- Prisma schema: `prisma/schema.prisma`
- Dockerfile: `apps/reminders-service/Dockerfile`
- Compose wiring: `docker-compose.yml`
