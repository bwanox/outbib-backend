# Base image
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy Config Files FIRST
COPY package*.json ./
COPY tsconfig*.json ./

# 2. Install dependencies (Clean install for Linux)
RUN npm install

# 3. Copy the rest of the source code
COPY . .

# 4. Build the specific app
ARG APP_NAME
# RESOLUTION: Using the direct binary path (Your Fix) because it's stable on Windows/Docker
RUN ./node_modules/.bin/nest build ${APP_NAME}

# --- Production Image ---
FROM node:20-alpine AS runner

WORKDIR /app

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

# Copy built assets (Standard NestJS output path)
COPY --from=builder /app/dist/apps/${APP_NAME} ./dist/apps/${APP_NAME}
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# RESOLUTION: Keep Team's addition for Prisma support
COPY --from=builder /app/apps/${APP_NAME}/prisma ./prisma

EXPOSE 3000

# Start command
CMD node dist/apps/$APP_NAME/main