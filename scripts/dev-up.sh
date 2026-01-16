#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="outbib"
NS="outbib"

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

echo "== 2) Install ingress-nginx =="
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s

echo "== 3) Build images =="
SERVICES=(auth-service users-service doctors-service pharmacies-service reminders-service emergencies-service ai-service api-gateway)
for s in "${SERVICES[@]}"; do
  docker build -t "outbib-$s:dev" "apps/$s"
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
echo "Test: curl http://outbib.local/health"
