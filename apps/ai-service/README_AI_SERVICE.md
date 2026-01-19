# AI Service Microservice

This service handles medical queries using a failover strategy with OpenRouter (Free Tier).

## Setup
1. Copy `.env.example` to `.env`.
2. Add your OpenRouter API Key.

## Environment Variables
Required in `.env`:
```bash
PORT=3009
OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY-HERE
APP_URL=[http://outbib.local](http://outbib.local)
APP_NAME=Outbib-PocketDoc

# AI Configuration
AI_MODEL_PRIMARY=google/gemini-2.0-flash-exp:free
AI_MODEL_FALLBACKS=xiaomi/mimo-v2-flash:free,meta-llama/llama-3-8b-instruct:free





## Features
Failover: Automatically switches models if one is down (404/429).
Privacy: Strips PII (Phone/Email) before sending data.
Legal: System prompt enforces Moroccan Law 09-08 compliance.