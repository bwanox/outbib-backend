#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"

if ! command -v curl >/dev/null; then
  echo "❌ curl not found"
  exit 1
fi
if ! command -v node >/dev/null; then
  echo "❌ node not found (used to parse JSON)"
  exit 1
fi

echo "== Gateway health =="
resp="$(curl -sS -X GET "${BASE_URL}/health" -w '\nHTTP_STATUS:%{http_code}\n')"
status="$(printf '%s' "$resp" | tail -n1 | sed 's/HTTP_STATUS://')"
if [[ "$status" != "200" ]]; then
  echo "❌ gateway /health failed (status $status)"
  printf '%s\n' "$resp" | sed '$d'
  exit 1
fi
echo "✅ gateway /health ok"

echo "== AI health =="
ai_resp="$(curl -sS -X GET "${BASE_URL}/ai/health" -w '\nHTTP_STATUS:%{http_code}\n')"
ai_status="$(printf '%s' "$ai_resp" | tail -n1 | sed 's/HTTP_STATUS://')"
if [[ "$ai_status" != "200" ]]; then
  echo "❌ ai /health failed (status $ai_status)"
  printf '%s\n' "$ai_resp" | sed '$d'
  exit 1
fi
echo "✅ ai /health ok"

email="health+$(date +%s)@example.com"
password="Test1234!"

echo "== Auth register/login + Users /me =="
reg_payload="$(printf '{"email":"%s","password":"%s"}' "$email" "$password")"
reg_resp="$(curl -sS -X POST "${BASE_URL}/api/auth/register" -H "Content-Type: application/json" -d "$reg_payload" -w '\nHTTP_STATUS:%{http_code}\n')"
reg_status="$(printf '%s' "$reg_resp" | tail -n1 | sed 's/HTTP_STATUS://')"
if [[ "$reg_status" != "201" ]]; then
  echo "❌ register failed (status $reg_status)"
  printf '%s\n' "$reg_resp" | sed '$d'
  exit 1
fi

login_resp="$(curl -sS -X POST "${BASE_URL}/api/auth/login" -H "Content-Type: application/json" -d "$reg_payload" -w '\nHTTP_STATUS:%{http_code}\n')"
login_status="$(printf '%s' "$login_resp" | tail -n1 | sed 's/HTTP_STATUS://')"
if [[ "$login_status" != "201" ]]; then
  echo "❌ login failed (status $login_status)"
  printf '%s\n' "$login_resp" | sed '$d'
  exit 1
fi
login_body="$(printf '%s' "$login_resp" | sed '$d')"
access_token="$(node -e "const t=JSON.parse(process.argv[1]); console.log(t.accessToken||'')" "$login_body")"
if [[ -z "$access_token" ]]; then
  echo "❌ access token missing in login response"
  printf '%s\n' "$login_body"
  exit 1
fi

me_resp="$(curl -sS -X GET "${BASE_URL}/users/me" -H "Authorization: Bearer ${access_token}" -w '\nHTTP_STATUS:%{http_code}\n')"
me_status="$(printf '%s' "$me_resp" | tail -n1 | sed 's/HTTP_STATUS://')"
if [[ "$me_status" != "200" ]]; then
  echo "❌ users/me failed (status $me_status)"
  printf '%s\n' "$me_resp" | sed '$d'
  exit 1
fi

echo "✅ auth + users via gateway ok"
