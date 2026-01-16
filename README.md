# Outbib Backend — Microservices & Kubernetes Setup

This repository contains the **backend infrastructure and services** for **Outbib – PocketDoc**, implemented using a **microservices architecture** deployed on **Kubernetes (kind)** for local development.

The backend is designed to be:

* Modular
* Scalable
* Team-friendly
* Production-ready

Any developer can run the full backend locally with **one command**.

---

## 1. Architecture Overview

### 1.1 Architecture Style

The backend follows a **microservices architecture** with:

* Independent services
* Single API Gateway
* Centralized ingress
* Containerized deployment
* Kubernetes orchestration

Each service:

* Is isolated
* Has its own Docker image
* Can be scaled and restarted independently
* Communicates over internal Kubernetes networking

---

### 1.2 High-Level Components

* **API Gateway** (NestJS)
* **Business Microservices** (NestJS)
* **PostgreSQL** (relational database)
* **Redis** (cache & lightweight coordination)
* **Ingress NGINX** (external access)
* **Kubernetes (kind)** for orchestration

---

## 2. Microservices

All backend services are implemented using **NestJS** and run internally on **port 3000**.

| Service               | Responsibility                      |
| --------------------- | ----------------------------------- |
| `api-gateway`         | Single entry point, request routing |
| `auth-service`        | Authentication & JWT                |
| `users-service`       | User profiles & preferences         |
| `doctors-service`     | Doctor discovery & search           |
| `pharmacies-service`  | Pharmacy discovery                  |
| `reminders-service`   | Health reminders                    |
| `emergencies-service` | Emergency information               |
| `ai-service`          | AI medical assistant                |

Each service exposes:

```
GET /health
```

Used for Kubernetes liveness and readiness probes.

---

## 3. Repository Structure

```text
outbib-backend/
├── apps/                  # All NestJS microservices
│   ├── auth-service/
│   ├── users-service/
│   ├── doctors-service/
│   ├── pharmacies-service/
│   ├── reminders-service/
│   ├── emergencies-service/
│   ├── ai-service/
│   └── api-gateway/
│
├── k8s/
│   ├── kind-cluster.yaml   # kind cluster config
│   └── base/               # Kubernetes manifests
│       ├── namespace.yaml
│       ├── ingress.yaml
│       ├── postgres.yaml
│       ├── redis.yaml
│       └── *.yaml          # service deployments
│
├── scripts/
│   ├── dev-up.sh           # Full setup
│   ├── dev-update.sh       # Update after git pull
│   └── dev-down.sh         # Clean teardown
│
└── README.md
```

---

## 4. Technology Stack

### Backend

* Node.js
* NestJS
* TypeScript
* REST APIs

### Infrastructure

* Docker
* Kubernetes (kind)
* Ingress NGINX

### Data

* PostgreSQL
* Redis

---

## 5. Local Development Setup

### 5.1 Prerequisites (install once)

#### macOS (Homebrew)

```bash
brew install docker kubectl kind node
npm i -g @nestjs/cli
```

Install **Docker Desktop** and ensure it is running.

#### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y docker.io kubectl nodejs npm
npm i -g @nestjs/cli
```

#### Windows (PowerShell Admin)

```powershell
winget install Docker.DockerDesktop
winget install Kubernetes.kubectl
winget install Kubernetes.kind
winget install OpenJS.NodeJS.LTS
npm i -g @nestjs/cli
```

---

### 5.2 Clone Repository

```bash
git clone <REPO_URL>
cd outbib-backend
```

---

### 5.3 Configure Local Domain (one time)

#### macOS / Linux

```bash
sudo sh -c 'grep -q "outbib.local" /etc/hosts || echo "127.0.0.1 outbib.local" >> /etc/hosts'
```

#### Windows

```powershell
Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1 outbib.local"
```

---

## 6. Running the Backend

### 6.1 Start Everything (One Command)

```bash
./scripts/dev-up.sh
```

This command will:

* Create a kind Kubernetes cluster
* Install ingress-nginx
* Build all service Docker images
* Load images into the cluster
* Deploy Postgres & Redis
* Deploy all microservices
* Apply Ingress

---

### 6.2 Verify

```bash
curl http://outbib.local/health
```

Expected:

```json
{"status":"ok"}
```

---

## 7. Updating After `git pull`

Whenever new changes are pulled:

```bash
./scripts/dev-update.sh
```

This script:

* Pulls latest code
* Detects changed services
* Rebuilds only what changed
* Reloads images into kind
* Restarts only affected deployments
* Re-applies Kubernetes manifests if needed

---

## 8. Stopping / Resetting

### Stop everything

```bash
./scripts/dev-down.sh
```

### Clean reset

```bash
./scripts/dev-down.sh
./scripts/dev-up.sh
```

---

## 9. Debugging & Useful Commands

```bash
kubectl get pods -n outbib
kubectl logs -n outbib deploy/api-gateway
kubectl describe pod -n outbib -l app=api-gateway
```

Check internal routing:

```bash
kubectl run tmp-curl --rm -i --restart=Never -n outbib --image=curlimages/curl -- \
  curl http://auth-service:3000/health
```

---

## 10. Design Decisions (for Defense)

* **Microservices**: scalability, fault isolation, parallel team work
* **API Gateway**: single entry point, routing, security layer
* **Kubernetes**: orchestration, self-healing, production parity
* **kind**: local Kubernetes identical to cloud environments
* **Monorepo**: easier coordination, shared scripts, unified CI

---

## 11. Status

✅ Backend infrastructure complete
✅ Microservices scaffolded
✅ Kubernetes fully operational
✅ Team-ready local setup

---

## 12. Next Steps

* Implement business logic per service
* Add Prisma & database migrations
* Secure endpoints with JWT
* Connect frontend (React Native)
* Add CI/CD pipeline

---

**Maintainer:** Outbib Backend Team
**Project:** Outbib – PocketDoc
