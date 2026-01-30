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
# Build only the selected workspace (apps/<app>)
RUN npm -w ${APP_NAME} run build

# --- Production Image ---
FROM node:20-alpine AS runner

WORKDIR /app

# Which app to run (passed at build time)
ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Copy built assets from builder (workspace outputs to apps/<app>/dist)
COPY --from=builder /app/apps/${APP_NAME}/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Copy Prisma schema and migrations for the selected app
COPY --from=builder /app/apps/${APP_NAME}/prisma ./prisma

# Expose port (can be overridden)
EXPOSE 3000

# Start the selected app
CMD ["sh","-c","node dist/main.js"]