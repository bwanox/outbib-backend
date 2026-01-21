# Base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files (for caching)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the specific app (we pass the APP_NAME as an argument)
ARG APP_NAME
RUN npm run build ${APP_NAME}

# --- Production Image ---
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose port (can be overridden)
EXPOSE 3000

# Start command (we pass the APP_NAME env var)
CMD ["node", "dist/apps/ai-service/main"]