#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="outbib"

if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  kind delete cluster --name "${CLUSTER_NAME}"
  echo "✅ Deleted kind cluster '${CLUSTER_NAME}'"
else
  echo "ℹ️  No kind cluster named '${CLUSTER_NAME}'"
fi
