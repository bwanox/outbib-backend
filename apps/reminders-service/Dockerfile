FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/reminders-service/package.json apps/reminders-service/package.json

# Install all deps needed for build (including dev deps)
RUN npm ci --include=dev

# Copy sources
COPY packages/contracts packages/contracts
COPY apps/reminders-service apps/reminders-service

# Build only what we need
RUN npm -w @outbib/contracts run build

# Generate Prisma client for reminders-service BEFORE compiling
RUN npm -w reminders-service run prisma:generate

RUN npm -w reminders-service run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Ensure Node can resolve deps within the workspace
ENV NODE_PATH=/app/apps/reminders-service/node_modules

# Install production dependencies for the required workspaces
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/reminders-service/package.json apps/reminders-service/package.json
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/reminders-service/dist ./dist

# Copy Prisma schema + generated client/engines
COPY --from=builder /app/apps/reminders-service/prisma ./prisma
COPY --from=builder /app/apps/reminders-service/node_modules/.prisma ./apps/reminders-service/node_modules/.prisma
COPY --from=builder /app/apps/reminders-service/node_modules/.prisma/reminders-service ./node_modules/.prisma/client

# Copy workspace node_modules and contracts dist so runtime resolution works
COPY --from=builder /app/apps/reminders-service/node_modules ./apps/reminders-service/node_modules
COPY --from=builder /app/packages/contracts/dist ./node_modules/@outbib/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./node_modules/@outbib/contracts/package.json

EXPOSE 3000
CMD ["node","dist/main.js"]
