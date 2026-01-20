# users-service

Users profile service for Outbib. Provides authenticated `/users/me` read/update endpoints, mirrors account metadata from `auth-service` events via NATS JetStream, and persists user profile data in Postgres using Prisma.

## Technology

- **Runtime**: Node.js 20
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma (`@prisma/client`)
- **Auth**: JWT bearer token (custom `JwtAuthGuard`)
- **Messaging**: NATS + JetStream consumers (optional, can be disabled)
- **API docs**: Swagger UI at `/docs`
- **Validation**: `class-validator` + `class-transformer` via global `ValidationPipe`

## How it fits in the system

### API Gateway routing

Outbib exposes services through **api-gateway**.

Gateway routing (see `apps/api-gateway/src/main.ts`):
- Incoming: `GET /users/*`
- Proxied to: `USERS_URL` (default `http://users-service:3000`)
- Path rewrite: the gateway strips the `/users` prefix, so:
  - External call: `GET http://localhost:8080/users/me`
  - Internal forwarded call: `GET http://users-service:3000/me`

> Note: `users-service` itself defines controllers under `@Controller('users')`, so when you call the service **directly** (without the gateway rewrite), the path is `GET http://<host>:3000/users/me`.

### Database layout / structure

This service owns its **own Postgres database** and schema managed by Prisma.

- In `docker-compose.yml` the service uses:
  - `DATABASE_URL=postgresql://outbib:outbib@postgres:5432/outbib_users`

So the DB name is `outbib_users` (same Postgres server/container, different database from other services).

#### Tables

Defined in `prisma/schema.prisma`:

- `UserProfile`
  - `id` (PK, string) — **same as auth user id** (`sub` from JWT)
  - `email` (unique, string)
  - `role` (string, default `user`) — mirrored from auth
  - `status` (string, default `active`) — mirrored from auth
  - `firstName` (nullable string)
  - `lastName` (nullable string)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)

#### How the DB is created in compose

Postgres is started once (service: `postgres`) and initializes databases using scripts mounted from:
- `docker/postgres/init/` → `/docker-entrypoint-initdb.d`

That init folder is responsible for creating per-service databases (including `outbib_users`).

#### Migrations

This service uses Prisma migrations.

Scripts (see `apps/users-service/package.json`):
- `npm run prisma:generate`
- `npm run prisma:migrate:dev`
- `npm run prisma:migrate:deploy`

**Important**: generating the Prisma client is handled during the Docker image build, but applying migrations is typically done:
- in development: `prisma migrate dev`
- in production: `prisma migrate deploy` (run as part of deployment/startup workflow)

### How it ties to auth-service

- **HTTP auth**: `users-service` expects a valid **JWT** on protected endpoints.
  - It verifies tokens using `JWT_SECRET` (see `src/auth/jwt-auth.guard.ts`).
  - Token payload is attached to `req.user` and the controller reads:
    - `sub` → `userId`
    - `email`, `role`, `status` (used as fallbacks)

- **Event mirroring (optional)**: when NATS is enabled, `users-service` listens to auth events and mirrors fields into its own `UserProfile` record:
  - `role`, `status` (and on registration also `email`)

## Project structure (high level)

- `src/main.ts`: Nest bootstrap, global validation + exception filter, Swagger setup
- `src/common/filters/http-exception.filter.ts`: consistent JSON error responses
- `src/auth/jwt-auth.guard.ts`: bearer token parsing + JWT verification
- `src/users/*`: controller/service/module for profile endpoints
- `src/events/nats-consumer.service.ts`: subscriptions to auth-related events
- `src/prisma/prisma.service.ts`: Prisma client lifecycle
- `prisma/schema.prisma`: `UserProfile` model

## Configuration (environment variables)

Required / commonly used:

- `PORT` (optional): HTTP port (default `3000`)
- `DATABASE_URL` (**required**): Postgres connection string used by Prisma
- `JWT_SECRET` (optional): JWT verification secret (default `dev-secret`)
- `NATS_DISABLED` (optional): set to `true` to skip NATS subscriptions
- `NATS_URL` (optional): NATS server URL (default `nats://nats:4222`)

Notes:
- If `JWT_SECRET` is not aligned with the token issuer, requests to protected endpoints will return `401`.
- When `NATS_DISABLED=true`, the service only serves HTTP APIs and does not mirror auth events.

## Running locally (workspace)

This repository is a monorepo. From the repo root (`outbib-backend/`), typical commands are:

- Build:
  - `npm -w @outbib/contracts run build`
  - `npm -w users-service run build`
- Dev:
  - `npm -w users-service run start:dev`

## Docker

`apps/users-service/Dockerfile` is a multi-stage build:

- **builder** stage
  - installs dev deps (`npm ci --include=dev`)
  - builds `@outbib/contracts` then `users-service`
  - runs `npm -w users-service run prisma:generate`
- **runtime** stage
  - installs prod deps (`npm ci --omit=dev`)
  - copies compiled `dist/`, `prisma/`, and generated Prisma client (`node_modules/.prisma`)

With docker compose (from `outbib-backend/`):
- `docker compose build users-service`
- `docker compose up -d users-service`

## API

### Swagger

- `GET /docs`: Swagger UI

### Health

- `GET /health`
  - Returns: `{ "status": "ok" }`

### Root

- `GET /`
  - Returns a simple string from `AppService`.

### Users (protected)

All endpoints below require an `Authorization: Bearer <jwt>` header.

#### Via api-gateway (recommended)

- `GET http://localhost:8080/users/me`
- `PATCH http://localhost:8080/users/me`

#### Direct to the service (no gateway)

- `GET http://<users-service-host>:3000/users/me`
- `PATCH http://<users-service-host>:3000/users/me`

#### Endpoints

- `GET /users/me`
  - Response: `UserMeResponseDto`
  - Behavior:
    - reads `userId` from JWT `sub`
    - fetches profile from DB; falls back to JWT claims for `email`, `role`, `status` when DB values are missing

- `PATCH /users/me`
  - Body: `UpdateMeRequestDto`
  - Response: `UserMeResponseDto`
  - Behavior:
    - upserts the user profile in DB with provided fields

## Events (NATS / JetStream)

When enabled, the service subscribes to Outbib auth events and mirrors user metadata into `UserProfile`.

Stream/subjects:
- Stream ensured/used: `OUTBIB_EVENTS`
- Subjects: `outbib.>`

Consumers/subscriptions created (durable):
- `users-service-auth-user-registered-v1` → `EventNames.AuthUserRegisteredV1`
- `users-service-auth-user-role-updated-v1` → `EventNames.AuthUserRoleUpdatedV1`
- `users-service-auth-user-disabled-v1` → `EventNames.AuthUserDisabledV1`

Handlers:
- **User registered**: creates/updates profile with `email`, `role`, `status`
- **Role updated**: updates `role`
- **User disabled**: updates `status` (defaults to `disabled` when missing)
