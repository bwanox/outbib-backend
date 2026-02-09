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

# Ensure commands like `npm -w auth-service ...` run from the expected workspace location.
WORKDIR /app/apps/auth-service

# Copy compiled output into the workspace folder (initContainer runs from /app/apps/auth-service)
COPY --from=builder /app/apps/auth-service/dist ./dist

# Copy Prisma schema + generated client into the workspace folder
# K8s initContainer expects `./prisma/schema.prisma` relative to /app/apps/auth-service.
COPY --from=builder /app/apps/auth-service/prisma ./prisma

# Ensure prisma migrations are present for `prisma migrate deploy`
# (without this, deploy will say "No migration found in prisma/migrations" and tables won't be created)
COPY --from=builder /app/apps/auth-service/prisma/migrations ./prisma/migrations

# Prisma Client generation in npm workspaces typically writes artifacts under the repo-root node_modules.
# Copy both the generated client runtime (.prisma) and the @prisma packages from the root.
COPY --from=builder /app/node_modules/.prisma /app/apps/auth-service/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/apps/auth-service/node_modules/@prisma

# Copy workspace node_modules so runtime has deps where Node resolves it.
COPY --from=builder /app/apps/auth-service/node_modules ./node_modules

# Copy compiled contracts output required at runtime
COPY --from=builder /app/packages/contracts/dist /app/node_modules/@outbib/contracts/dist
COPY --from=builder /app/packages/contracts/package.json /app/node_modules/@outbib/contracts/package.json

EXPOSE 3000
CMD ["node","dist/main.js"]
