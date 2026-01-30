FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/emergencies-service/package.json apps/emergencies-service/package.json

# Install all deps needed for build (including dev deps)
RUN npm ci --include=dev

# Copy sources
COPY packages/contracts packages/contracts
COPY apps/emergencies-service apps/emergencies-service

# Build only what we need
RUN npm -w @outbib/contracts run build
RUN npm -w emergencies-service run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Ensure Node can resolve deps within the workspace
ENV NODE_PATH=/app/apps/emergencies-service/node_modules

# Install production dependencies for the required workspaces
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/emergencies-service/package.json apps/emergencies-service/package.json
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/emergencies-service/dist ./dist

# Copy workspace node_modules and contracts dist so runtime resolution works
COPY --from=builder /app/apps/emergencies-service/node_modules ./apps/emergencies-service/node_modules
COPY --from=builder /app/packages/contracts/dist ./node_modules/@outbib/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./node_modules/@outbib/contracts/package.json

EXPOSE 3000
CMD ["node","dist/main.js"]

