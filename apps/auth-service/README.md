# Outbib Auth Service

NestJS microservice responsible for authentication, authorization (role-based access), and user account status management.

- **Language/Framework**: Node.js + NestJS
- **Database**: PostgreSQL (via Prisma)
- **Auth**: JWT access tokens + rotating JWT refresh tokens
- **Async events**: NATS (optional; can be disabled)
- **Docs**: Swagger UI at `/docs`

## How it works (architecture & flow)

### Main building blocks

- **HTTP layer**: `src/auth/auth.controller.ts`
  - Exposes `/auth/*` endpoints.
  - Uses NestJS validation (`ValidationPipe`) to validate DTOs.

- **Business logic**: `src/auth/auth.service.ts`
  - Handles register/login/refresh/logout/me.
  - Handles admin actions (set role / disable user).

- **Database access**: `src/prisma/prisma.service.ts`
  - Wraps Prisma client and connects on module init.
  - Uses `DATABASE_URL` to reach Postgres.

- **Security**
  - `src/auth/guards/jwt-auth.guard.ts`: verifies `Authorization: Bearer <token>` using `JWT_SECRET` and sets `req.user`.
  - `src/auth/guards/roles.guard.ts`: enforces roles using metadata from `src/auth/roles.decorator.ts`.

- **Event publishing**: `src/events/auth-events.publisher.ts`
  - After key changes, publishes events to NATS (`AuthUserRegisteredV1`, `AuthUserRoleUpdatedV1`, `AuthUserDisabledV1`).
  - If `NATS_DISABLED=true`, publishing is skipped so the service can run without NATS (useful for local dev).

### Auth flows

- **Register** (`POST /auth/register`)
  1. Email is normalized to lowercase.
  2. Password is bcrypt-hashed.
  3. User is created with default `role=user`, `status=active`.
  4. `AuthUserRegisteredV1` event is published (unless NATS is disabled).

- **Login** (`POST /auth/login`)
  1. Email is normalized to lowercase.
  2. Password is verified via bcrypt.
  3. If `status=disabled`, login is rejected.
  4. Issues **access token** (15m) + **refresh token** (default 7d).
  5. Stores a bcrypt hash of the refresh token in DB (`refreshTokenHash`).

- **Refresh** (`POST /auth/refresh`)
  1. Refresh token is verified with `JWT_REFRESH_SECRET` (fallback: `JWT_SECRET`).
  2. Refresh token is compared against the stored bcrypt hash.
  3. Issues a **new access token and a new refresh token** (rotation).
  4. Replaces `refreshTokenHash` with the new token hash.

- **Logout** (`POST /auth/logout`)
  - Best-effort: verifies the refresh token; if valid, clears `refreshTokenHash` in DB.

- **Admin actions**
  - Protected by **JWT + role**.
  - `PATCH /auth/admin/users/:id/role`: updates role and publishes `AuthUserRoleUpdatedV1`.
  - `PATCH /auth/admin/users/:id/disable`: sets `status=disabled` and publishes `AuthUserDisabledV1`.

## Quick start

### Run with Docker Compose (recommended)
This repo’s `docker-compose.yml` starts Postgres + this service.

- Service: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`

Auth-service compose env (from `outbib-backend/docker-compose.yml`):

- `PORT=3000`
- `DATABASE_URL=postgresql://outbib:outbib@postgres:5432/outbib_auth`
- `NATS_DISABLED=true`

> Note: compose also mounts `./docker/postgres/init` into Postgres for initialization scripts.

### Run locally (without Docker)

1. Ensure Postgres is running and create a database for auth (example: `outbib_auth`).
2. Set environment variables (see below).
3. Install deps and run:
   - `npm install`
   - `npm -w auth-service run prisma:generate`
   - `npm -w auth-service run prisma:migrate:deploy`
   - `npm -w auth-service run start:dev`

## Running in Docker

### What Docker Compose does

In `outbib-backend/docker-compose.yml`:

- **Postgres** container
  - Exposes `5432:5432`
  - Persists data in the named volume `postgres_data`
  - Runs init scripts from `./docker/postgres/init` (mounted read-only)
  - Has a `pg_isready` healthcheck

- **auth-service** container
  - Built from `apps/auth-service/Dockerfile`
  - Waits for Postgres to become healthy (`depends_on` with `service_healthy`)
  - Runs the compiled NestJS app (`node dist/main.js` via the Dockerfile `CMD`)
  - Uses `DATABASE_URL` to reach the `postgres` service over the Docker network

### Important note: migrations

Docker Compose does **not** run Prisma migrations automatically for auth-service.

If you are using Compose and the schema isn’t applied yet, run migrations against the running container (or run them locally targeting the compose Postgres). This project uses:

- `npm -w auth-service run prisma:migrate:deploy`

## Running in Kubernetes (k8s)

Kubernetes manifests live under `outbib-backend/k8s/base/`.

### auth-service deployment

File: `k8s/base/auth-service.yaml`

- Uses an **initContainer** named `migrate` to run DB migrations before the application starts:
  - `npm -w auth-service run prisma:migrate:deploy`
- Then starts the app container (`auth-service`) on port `3000`.
- Loads configuration from:
  - ConfigMap: `outbib-config` (`k8s/base/configmap.yaml`) → provides `NODE_ENV`, `NATS_URL`, etc.
  - Secret: `outbib-secrets` (not in this repo snippet) → expected to provide sensitive values like JWT secrets.
- Sets `DATABASE_URL` for auth DB: `postgresql://outbib:outbib@postgres:5432/outbib_auth`

### Probes (readiness/liveness)

`k8s/base/auth-service.yaml` probes `/health`.

If `/health` is not implemented in this service, probes will fail and Kubernetes will keep restarting the pod. In that case you have two options:

1. Implement a `GET /health` endpoint in auth-service, or
2. Adjust probes to a valid path (or remove probes).

### admin bootstrap job

File: `k8s/base/auth-admin-bootstrap-job.yaml`

- Runs migrations via an initContainer (same as the deployment).
- Then runs the bootstrap script:
  - `node dist/auth/bootstrap-admin-job.js`
- This job relies on env vars like `AUTH_ADMIN_EMAIL` and `AUTH_ADMIN_PASSWORD`.

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `NODE_ENV` | no | `development` | Node environment. |
| `PORT` | no | `3000` | HTTP port the service listens on. |
| `DATABASE_URL` | yes | — | PostgreSQL connection string used by Prisma. |
| `JWT_SECRET` | no | `dev-secret` | Secret used to sign/verify **access tokens**. |
| `JWT_REFRESH_SECRET` | no | `JWT_SECRET` / `dev-secret` | Secret used to sign/verify **refresh tokens**. Strongly recommended to set separately in production. |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh token TTL (`jsonwebtoken` format). |
| `NATS_DISABLED` | no | `false` | If `true`, event publishing is skipped (auth still works). |
| `NATS_URL` | no | `nats://nats:4222` | NATS server URL. Ignored when `NATS_DISABLED=true`. |
| `AUTH_ADMIN_BOOTSTRAP_ENABLED` | no | `true` | Enables the admin bootstrap job. |
| `AUTH_ADMIN_EMAIL` | sometimes | — | Admin bootstrap email (required to create/promote admin). |
| `AUTH_ADMIN_PASSWORD` | sometimes | — | Admin bootstrap password (>= 12 chars incl. upper/lower/number/symbol). |
| `AUTH_ADMIN_PROMOTE_EXISTING` | no | `false` | If `true`, an existing non-admin user with `AUTH_ADMIN_EMAIL` is promoted to admin. |

### Token behavior

- **Access token**: signed with `JWT_SECRET`, expires in **15m** (see `JwtModule.register` in `src/auth/auth.module.ts`).
- **Refresh token**:
  - signed with `JWT_REFRESH_SECRET` (or `JWT_SECRET` fallback)
  - expiry controlled by `JWT_REFRESH_EXPIRES_IN` (default `7d`)
  - is **rotated** on every successful `POST /auth/refresh`
  - only a **bcrypt hash** is stored in DB (`User.refreshTokenHash`)

## Database (Prisma)

- Prisma schema: `prisma/schema.prisma`
- Main model: `User`
  - `email` unique
  - `role`: `user` (default) or `admin` (set via admin endpoint/job)
  - `status`: `active` (default) or `disabled`
  - `passwordHash`: bcrypt hash
  - `refreshTokenHash`: bcrypt hash (nullable)

### Prisma scripts

From `apps/auth-service/package.json`:

- `prisma:generate`: generate Prisma client
- `prisma:migrate:deploy`: apply migrations
- `prisma:migrate:status`: show migration status

## Events (NATS)

Publishing is implemented in `src/events/auth-events.publisher.ts` and uses `src/events/nats-connection.ts`.

If `NATS_DISABLED=true`, the publisher will silently skip publishing.

Published event names come from `@outbib/contracts`:

- `EventNames.AuthUserRegisteredV1`
- `EventNames.AuthUserRoleUpdatedV1`
- `EventNames.AuthUserDisabledV1`

## Admin bootstrap job

File: `src/auth/bootstrap-admin-job.ts` (compiled to `dist/auth/bootstrap-admin-job.js`).

Run after build:

- Script: `npm -w auth-service run bootstrap:admin`

Behavior:

- If `AUTH_ADMIN_EMAIL` and `AUTH_ADMIN_PASSWORD` are set:
  - creates an admin user if it doesn’t exist
  - optionally promotes an existing user when `AUTH_ADMIN_PROMOTE_EXISTING=true`
- Enforces password strength (>= 12 chars, includes upper/lower/number/symbol).

## API

Base path: `/auth`

### Swagger

- UI: `GET /docs`

### Authentication

Protected endpoints require:

- `Authorization: Bearer <accessToken>`

### Endpoints

#### Register
- **POST** `/auth/register`
- Auth: no
- Body: `RegisterRequestDto` (`email`, `password`)
- Response: `MeResponseDto`

#### Login
- **POST** `/auth/login`
- Auth: no
- Body: `LoginRequestDto` (`email`, `password`)
- Response: `AuthTokensDto` (`accessToken`, `refreshToken`)

#### Refresh tokens (rotate)
- **POST** `/auth/refresh`
- Auth: no
- Body: `RefreshRequestDto` (`refreshToken`)
- Response: `AuthTokensDto` (`accessToken`, `refreshToken`)

#### Logout
- **POST** `/auth/logout`
- Auth: no
- Body: `LogoutRequestDto` (`refreshToken`)
- Response: `{ "status": "ok" }`

#### Get current user
- **GET** `/auth/me`
- Auth: Bearer access token
- Response: `MeResponseDto`

#### Admin: set user role
- **PATCH** `/auth/admin/users/:id/role`
- Auth: Bearer access token + role `admin`
- Body: `SetRoleRequestDto` (`role`: `user` | `admin`)
- Response: `MeResponseDto`

#### Admin: disable user
- **PATCH** `/auth/admin/users/:id/disable`
- Auth: Bearer access token + role `admin`
- Body: `DisableUserRequestDto` (currently empty DTO)
- Response: `MeResponseDto`

## HTTP error handling

A global exception filter is registered in `src/main.ts` (`HttpExceptionFilter`). Validation uses a global `ValidationPipe` with:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

## Repo notes / implementation pointers

- Controllers: `src/auth/auth.controller.ts`
- Business logic: `src/auth/auth.service.ts`
- Guards:
  - JWT: `src/auth/guards/jwt-auth.guard.ts`
  - Roles: `src/auth/guards/roles.guard.ts`
- Role decorator: `src/auth/roles.decorator.ts`

## Docker

The service Docker image is built by `apps/auth-service/Dockerfile`.

- Build stage compiles NestJS + generates Prisma client.
- Runtime stage installs production deps and copies `dist/` + Prisma artifacts.
