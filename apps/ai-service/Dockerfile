FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Copy workspace manifests first for caching
COPY package.json package-lock.json ./
COPY apps/ai-service/package.json apps/ai-service/package.json

# Install workspaces (includes dev deps needed for nest build)
RUN npm ci --include=dev

# Copy source
COPY apps/ai-service apps/ai-service

# Build only this workspace
RUN npm -w ai-service run build

FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_PATH=/app/apps/ai-service/node_modules

# Install production deps at the repo root so workspace dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/ai-service/package.json apps/ai-service/package.json
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/ai-service/dist ./dist

# Copy workspace node_modules so runtime resolves deps
COPY --from=builder /app/apps/ai-service/node_modules ./apps/ai-service/node_modules

EXPOSE 3009
CMD ["node","dist/main.js"]

