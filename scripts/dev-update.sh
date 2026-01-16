#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="outbib"
NS="outbib"

cd "$(dirname "$0")/.."

command -v git >/dev/null || { echo "❌ git not found"; exit 1; }
command -v docker >/dev/null || { echo "❌ docker not found"; exit 1; }
command -v kind >/dev/null || { echo "❌ kind not found"; exit 1; }
command -v kubectl >/dev/null || { echo "❌ kubectl not found"; exit 1; }

echo "== Outbib dev update =="

# Ensure kind cluster exists
if ! kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "❌ kind cluster '${CLUSTER_NAME}' not found."
  echo "Run: ./scripts/dev-up.sh"
  exit 1
fi

# Save current revision before pull
OLD_REV="$(git rev-parse HEAD)"

echo "== Pulling latest changes =="
# Use --ff-only to avoid weird merges for teammates
git pull --ff-only || {
  echo "❌ git pull failed. Resolve conflicts manually, then rerun dev-update."
  exit 1
}

NEW_REV="$(git rev-parse HEAD)"

if [ "$OLD_REV" = "$NEW_REV" ]; then
  echo "✅ Already up-to-date. No changes pulled."
  exit 0
fi

echo "== Changes detected =="
CHANGED_FILES="$(git diff --name-only "$OLD_REV" "$NEW_REV")"
echo "$CHANGED_FILES"
echo

# Re-apply manifests only if k8s changed
K8S_CHANGED="no"
if echo "$CHANGED_FILES" | grep -qE '^k8s/'; then
  K8S_CHANGED="yes"
fi

# Detect which services changed
SERVICES=(auth-service users-service doctors-service pharmacies-service reminders-service emergencies-service ai-service api-gateway)
CHANGED_SERVICES=()

for s in "${SERVICES[@]}"; do
  if echo "$CHANGED_FILES" | grep -qE "^apps/${s}/"; then
    CHANGED_SERVICES+=("$s")
  fi
done

# If nothing under apps or k8s changed, stop
if [ "${#CHANGED_SERVICES[@]}" -eq 0 ] && [ "$K8S_CHANGED" = "no" ]; then
  echo "ℹ️  No service or k8s changes detected. Nothing to redeploy."
  exit 0
fi

# Apply k8s changes if needed
if [ "$K8S_CHANGED" = "yes" ]; then
  echo "== k8s/ changed: re-applying manifests =="
  # Apply base manifests in correct order
  kubectl apply -f k8s/base/namespace.yaml || true
  kubectl apply -f k8s/base/configmap.yaml || true
  kubectl apply -f k8s/base/secrets.yaml || true
  kubectl apply -f k8s/base/postgres.yaml || true
  kubectl apply -f k8s/base/redis.yaml || true

  # Apply service manifests (safe to re-apply even if unchanged)
  for s in "${SERVICES[@]}"; do
    if [ -f "k8s/base/${s}.yaml" ]; then
      kubectl apply -f "k8s/base/${s}.yaml"
    fi
  done

  kubectl apply -f k8s/base/ingress.yaml || true
  echo
fi

# Build + load only changed services
if [ "${#CHANGED_SERVICES[@]}" -gt 0 ]; then
  echo "== Rebuilding changed services =="
  echo "Changed services: ${CHANGED_SERVICES[*]}"
  echo

  for s in "${CHANGED_SERVICES[@]}"; do
    echo "🐳 Build: outbib-$s:dev"
    docker build -t "outbib-$s:dev" "apps/$s"

    echo "📦 kind load: outbib-$s:dev"
    kind load docker-image "outbib-$s:dev" --name "$CLUSTER_NAME"

    echo "🔁 Restart deployment: $s"
    kubectl rollout restart deploy -n "$NS" "$s"
    echo
  done

  echo "== Waiting for rollouts =="
  for s in "${CHANGED_SERVICES[@]}"; do
    kubectl rollout status deploy -n "$NS" "$s"
  done
fi

echo
echo "== Quick health check =="
echo "In-cluster gateway:"
kubectl run tmp-curl --rm -i --restart=Never -n "$NS" --image=curlimages/curl -- \
  curl -sS http://api-gateway/health || true
echo

echo "External:"
curl -sS http://outbib.local/health || true
echo

echo "✅ dev-update complete."
