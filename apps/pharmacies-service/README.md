# pharmacies-service (Outbib)

Pharmacy discovery + caching service for **Outbib**.

This service syncs pharmacies from **Google Maps / Places API** for a given city, stores them in **PostgreSQL** as the source of truth, and uses **Redis** for fast reads. The API serves local data after sync to reduce external API calls.

- **Service API base**: `http://localhost:3004` (docker-compose)
- **Gateway API base**: `http://localhost:8080/pharmacies`
- **Health**: `GET /health` → `{"status":"ok"}`
- **Swagger**: `GET /docs`

---

## Technology

- **Runtime**: Node.js 20
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma (`prisma`, `@prisma/client`)
- **Cache**: Redis (list + detail caching)
- **API docs**: Swagger UI at `/docs`
- **Validation**: `class-validator` + `class-transformer` via Nest global `ValidationPipe`

---

## Data model (Prisma)

Core entities:

- **Pharmacy**
  - `placeId` (unique), `name`, `address`, `city`, `country`, `lat`, `lng`
  - `phone`, `website`, `rating`, `ratingsCount`
  - `openingHoursJson`, `isOpenNow`, `types`, `source`, `lastSyncedAt`
- **PharmacyReview** (optional)
  - `authorName`, `rating`, `text`, `relativeTimeDescription`, `time`
- **SyncJob**
  - `city`, `status`, `startedAt`, `finishedAt`, `fetchedCount`, `upsertedCount`, `errorsJson`

See `prisma/schema.prisma` for full schema.

---

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | - | Postgres connection string |
| `REDIS_URL` | no | `redis://redis:6379` | Redis connection string |
| `GOOGLE_MAPS_API_KEY` | yes (for sync) | - | Google Places API key |
| `MAPS_DEFAULT_COUNTRY` | no | - | Optional default country for sync |
| `SYNC_CONCURRENCY` | no | `3` | Max parallel detail requests |

### Local `.env` (dev)

This repo includes `apps/pharmacies-service/.env` for local dev with Docker:

```
DATABASE_URL=postgresql://outbib:outbib@localhost:5432/outbib_pharmacies
REDIS_URL=redis://localhost:6379
GOOGLE_MAPS_API_KEY=
MAPS_DEFAULT_COUNTRY=
SYNC_CONCURRENCY=3
```

---

## API endpoints

### Public read endpoints

- `GET /pharmacies`
  - Query: `city` (required), optional `q`, `page`, `limit`, `minRating`
- `GET /pharmacies/nearby`
  - Query: `lat`, `lng`, optional `radiusMeters` (default 3000), `limit`
- `GET /pharmacies/:id`
- `GET /pharmacies/by-place/:placeId`

### Sync/admin endpoints

- `POST /pharmacies/sync`
  - Body: `{ "city": string, "country"?: string, "force"?: boolean }`
  - Triggers Google Places sync + upserts
- `GET /pharmacies/sync/status?city=...`

---

## Caching

- `GET /pharmacies`: cached by `city + page + limit + q + minRating` for 1 hour
- `GET /pharmacies/nearby`: cached by rounded coords + radius for 1 hour
- `GET /pharmacies/:id` and `GET /pharmacies/by-place/:placeId`: cached for 24 hours

Cache entries are invalidated on sync (best-effort, by prefix).

---

## Running locally

This service expects Postgres + Redis. Use the shared `docker-compose.yml` at the repo root, or run services manually.

### Docker Compose

The root `docker-compose.yml` includes:
- `pharmacies-migrate` (runs `prisma migrate deploy`)
- `pharmacies-service` (port `3004:3000`)
- Postgres + Redis

### Prisma

```bash
# From repo root
DATABASE_URL=postgresql://outbib:outbib@localhost:5432/outbib_pharmacies \
  npx prisma migrate dev --schema apps/pharmacies-service/prisma/schema.prisma --name init

DATABASE_URL=postgresql://outbib:outbib@localhost:5432/outbib_pharmacies \
  npx prisma generate --schema apps/pharmacies-service/prisma/schema.prisma
```

### Start service

```bash
# From repo root
npm -w pharmacies-service run start:dev
```

### Tests (watchman note)

If you hit a Watchman permission error, run:

```bash
npm -w pharmacies-service test -- --watchman=false
```

---

## Example sync

```bash
curl -X POST http://localhost:3000/pharmacies/sync \
  -H "Content-Type: application/json" \
  -d '{"city":"Casablanca","country":"Morocco"}'
```

### Via API Gateway

```bash
curl -X POST http://localhost:8080/pharmacies/sync \
  -H "Content-Type: application/json" \
  -d '{"city":"Casablanca","country":"Morocco"}'
```

---

## Notes

- **Postgres** is the source of truth. Redis is a performance layer.
- Google Places API is only used for initial sync or periodic refresh.
- The Maps client is rate-limit friendly with basic concurrency control and pagination handling.
- API Gateway proxies `/pharmacies/*` to the service. Set `PHARMACIES_URL` in the gateway environment (already wired in docker-compose).
