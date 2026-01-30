FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY apps/pharmacies-service/package.json apps/pharmacies-service/package.json

# Install deps needed for build (including dev deps)
RUN npm ci --include=dev

# Copy sources
COPY apps/pharmacies-service apps/pharmacies-service

# Build only what we need
RUN npm -w pharmacies-service run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Ensure Node can resolve deps within the workspace
ENV NODE_PATH=/app/apps/pharmacies-service/node_modules

# Install production dependencies for the required workspaces
COPY package.json package-lock.json ./
COPY apps/pharmacies-service/package.json apps/pharmacies-service/package.json
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/pharmacies-service/dist ./dist

# Copy workspace node_modules so runtime resolution works
COPY --from=builder /app/apps/pharmacies-service/node_modules ./apps/pharmacies-service/node_modules

EXPOSE 3000
CMD ["node","dist/main.js"]

