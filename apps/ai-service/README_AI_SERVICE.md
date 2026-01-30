# Outbib AI Service (Microservice)

This NestJS microservice handles **medical Q&A** requests for Outbib using **OpenRouter** (free-tier friendly) with a **model failover strategy**, plus basic **PII stripping** and a **legal/system prompt** aligned with Moroccan **Law 09-08**.

---

## What this service does

- Exposes an HTTP API that receives a user medical question (and optional context).
- **Sanitizes** input to remove obvious PII (email/phone) before sending to the LLM.
- Sends the sanitized prompt to **OpenRouter** using a **primary model**.
- If the primary model fails with certain transient/provider errors, it **fails over** to one or more fallback models.
- Returns the model answer to the caller (typically the API gateway or frontend).

---

## Request flow (high level)

1. **Client** (usually API Gateway) sends a medical query to this service.
2. Controller validates/parses the payload.
3. Service layer:
   - Strips PII (email/phone).
   - Builds a **system prompt** (safety + legal constraints).
   - Calls OpenRouter with `AI_MODEL_PRIMARY`.
4. If OpenRouter returns a failover-eligible error (ex: **429 rate limit**, **404 not found / model unavailable**), the service tries the next model from `AI_MODEL_FALLBACKS`.
5. First successful response is returned.
6. If all models fail, the service returns an error response.

---

## Failover strategy

Configured by environment variables:

- `AI_MODEL_PRIMARY`: first model to try
- `AI_MODEL_FALLBACKS`: comma-separated list tried in order

Failover is intended for provider/model instability and free-tier limits. Typical failover triggers:
- `429` (rate limited)
- `404` (model not found / temporarily unavailable)

---

## Privacy / PII stripping

Before calling the LLM provider, the service removes **basic PII patterns**:
- Emails (e.g., `name@domain.com`)
- Phone numbers (common formats)

This is best-effort and is meant to reduce accidental leakage; it does not replace a full DLP solution.

---

## Legal / Safety guardrails

The service uses a system prompt to:
- Keep responses aligned with medical safety best practices (no definitive diagnosis, encourage professional care where appropriate).
- Enforce handling aligned with Moroccan data/privacy expectations (Law 09-08) by minimizing personal data usage and encouraging anonymization.

---

## Configuration

Create `.env` (copy from `.env.example` if present) and set:

```bash
PORT=3009
OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY-HERE

APP_URL=http://outbib.local
APP_NAME=Outbib-PocketDoc

# AI configuration
AI_MODEL_PRIMARY=google/gemini-2.0-flash-exp:free
AI_MODEL_FALLBACKS=xiaomi/mimo-v2-flash:free,meta-llama/llama-3-8b-instruct:free
```

### Notes
- `OPENROUTER_API_KEY` is required to call OpenRouter.
- Make sure the configured models exist in OpenRouter and are available to your key/tier.

---

## API

> Exact routes may vary depending on the controller implementation.

Typical pattern:
- `POST /ai/query` (or similar)
- Body includes the user question and optional metadata/context.

Example payload:

```json
{
  "question": "I have a sore throat and mild fever for 2 days. What should I do?",
  "language": "fr",
  "context": {
    "age": 28,
    "sex": "female"
  }
}
```

Example response:

```json
{
  "answer": "Based on your symptoms ... If you develop difficulty breathing ... consult a clinician.",
  "model": "google/gemini-2.0-flash-exp:free"
}
```

---

## Running locally

From `outbib-backend/apps/ai-service`:

```sh
npm install
npm run start:dev
```

Service will listen on `PORT` (default `3009` from your `.env`).

---

## Running with Docker

If you use the provided Dockerfile:

```sh
docker build -t outbib-ai-service .
docker run --env-file .env -p 3009:3009 outbib-ai-service
```

---

## Health / diagnostics

Common checks:
- Verify the service is up: `GET /health` (if implemented)
- Confirm `OPENROUTER_API_KEY` is loaded
- Try a test query and confirm failover works by temporarily setting an invalid primary model.

---

## Project layout (ai-service)

- `src/main.ts`: NestJS bootstrap
- `src/app.module.ts`: module wiring
- `src/app.controller.ts`: HTTP endpoints
- `src/app.service.ts` and/or `src/ai.service.ts`: OpenRouter calling logic, failover, prompt and sanitization

---

## Troubleshooting

### 401 / Unauthorized
- `OPENROUTER_API_KEY` missing/invalid.

### 404 / Model not found
- Model ID is wrong or not available; service should try fallbacks if configured.

### 429 / Rate limit
- Free-tier throttling; failover should help, otherwise reduce traffic or use a paid tier.

---

## Security notes

- Do not log raw user prompts containing sensitive medical or personal data.
- Keep the OpenRouter key out of source control (`.env` should be gitignored).
- Consider adding stronger PII detection and request auditing depending on production requirements.