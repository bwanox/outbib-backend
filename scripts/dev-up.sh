#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="outbib"
NS="outbib"

# Pin to a released ingress-nginx manifest for reproducible local dev.
INGRESS_NGINX_VERSION="controller-v1.14.2"
INGRESS_NGINX_MANIFEST_URL="https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX_VERSION}/deploy/static/provider/kind/deploy.yaml"

cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "❌ docker not found"; exit 1; }
command -v kind >/dev/null || { echo "❌ kind not found"; exit 1; }
command -v kubectl >/dev/null || { echo "❌ kubectl not found"; exit 1; }

echo "== 1) Create kind cluster (if missing) =="
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "ℹ️  kind cluster '${CLUSTER_NAME}' already exists"
else
  kind create cluster --config k8s/kind-cluster.yaml
fi

echo "== 2) Install ingress-nginx (${INGRESS_NGINX_VERSION}) =="
# Avoid re-downloading the manifest every run (raw.githubusercontent.com can be blocked/slow).
if kubectl -n ingress-nginx get deploy ingress-nginx-controller >/dev/null 2>&1; then
  echo "ℹ️  ingress-nginx already installed; skipping manifest apply"
else
  echo "ℹ️  applying: ${INGRESS_NGINX_MANIFEST_URL}"
  kubectl apply -f "${INGRESS_NGINX_MANIFEST_URL}"
fi

# Wait for the admission jobs to complete (these create the webhook cert secret).
# The patch job can complete and disappear quickly depending on k8s/job settings, so don't hard-fail.
if kubectl -n ingress-nginx get job ingress-nginx-admission-create >/dev/null 2>&1; then
  kubectl wait --namespace ingress-nginx \
    --for=condition=complete job/ingress-nginx-admission-create \
    --timeout=300s || true
fi
if kubectl -n ingress-nginx get job ingress-nginx-admission-patch >/dev/null 2>&1; then
  kubectl wait --namespace ingress-nginx \
    --for=condition=complete job/ingress-nginx-admission-patch \
    --timeout=300s || true
fi

# Then wait for the controller deployment to be available.
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=300s

echo "== 3) Build images =="
SERVICES=(auth-service users-service doctors-service pharmacies-service reminders-service emergencies-service ai-service api-gateway)
for s in "${SERVICES[@]}"; do
  if [[ -f "apps/$s/Dockerfile" ]]; then
    # Build from repo root so Dockerfiles can COPY workspace paths (packages/*, apps/*).
    docker build -t "outbib-$s:dev" -f "apps/$s/Dockerfile" .
  else
    echo "❌ Missing Dockerfile for $s"; exit 1
  fi
done

echo "== 4) Load images into kind =="
for s in "${SERVICES[@]}"; do
  kind load docker-image "outbib-$s:dev" --name "${CLUSTER_NAME}"
done

echo "== 5) Apply manifests =="
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secrets.yaml
kubectl apply -f k8s/base/postgres.yaml
kubectl apply -f k8s/base/redis.yaml
kubectl apply -f k8s/base/nats.yaml

kubectl apply -f k8s/base/auth-service.yaml
kubectl apply -f k8s/base/users-service.yaml
kubectl apply -f k8s/base/doctors-service.yaml
kubectl apply -f k8s/base/pharmacies-service.yaml
kubectl apply -f k8s/base/reminders-service.yaml
kubectl apply -f k8s/base/emergencies-service.yaml
kubectl apply -f k8s/base/ai-service.yaml
kubectl apply -f k8s/base/api-gateway.yaml
kubectl apply -f k8s/base/ingress.yaml

echo "== 6) Wait for gateway =="
kubectl rollout status deploy/api-gateway -n "$NS"

echo "✅ Done. Add to /etc/hosts once:"
echo "127.0.0.1 outbib.local"
echo "Test: curl http://outbib.local:18081/health"
