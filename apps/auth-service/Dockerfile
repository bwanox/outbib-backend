FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Ensure native deps (bcrypt) can compile if prebuilt download isn't available
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/auth-service/package.json apps/auth-service/package.json

# Install all workspaces (includes devDependencies needed for builds, e.g. typescript/nest)
RUN npm ci --include=dev

# Copy source
COPY packages/contracts packages/contracts
COPY apps/auth-service apps/auth-service

# Build contracts then auth-service
RUN npm -w @outbib/contracts run build
RUN npm -w auth-service run build

# Generate Prisma client (needed @ runtime)
RUN npm -w auth-service run prisma:generate

FROM node:20-bookworm-slim
WORKDIR /app

# Prisma engines may require OpenSSL/CA certs which can be missing from slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Ensure Node can resolve dependencies installed under the workspace folder.
ENV NODE_PATH=/app/apps/auth-service/node_modules

# NOTE: No build tooling in runtime image. Native modules must be installed as prebuilds.

# Install production deps at the repo root so workspace dependencies are installed.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/auth-service/package.json apps/auth-service/package.json
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/auth-service/dist ./dist

# Copy Prisma schema + generated client
COPY --from=builder /app/apps/auth-service/prisma ./prisma
COPY --from=builder /app/apps/auth-service/node_modules/.prisma ./apps/auth-service/node_modules/.prisma
COPY --from=builder /app/apps/auth-service/node_modules/.prisma/auth-service ./node_modules/.prisma/client

# Copy workspace node_modules so runtime has @nestjs/platform-express (and other deps) where Node resolves it.
COPY --from=builder /app/apps/auth-service/node_modules ./apps/auth-service/node_modules

# Copy compiled contracts output required at runtime
COPY --from=builder /app/packages/contracts/dist ./node_modules/@outbib/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./node_modules/@outbib/contracts/package.json

EXPOSE 3000
CMD ["node","dist/main.js"]
