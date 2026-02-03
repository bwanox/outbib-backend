# Base image
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy EVERYTHING
COPY . .

# 2. Force-delete Windows garbage
RUN rm -rf node_modules
RUN find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# 3. Install Project Dependencies (This installs Axios too)
RUN npm install

# 4. Install Build Tools
RUN npm install --save-dev webpack webpack-cli ts-loader @nestjs/cli
RUN npm install @nestjs/platform-express
RUN npm install -g @nestjs/cli

# 5. THE FIX: Generate Prisma Client BEFORE building
ARG APP_NAME

# If a schema exists for this app, generate the types so the build doesn't crash
RUN if [ -f apps/${APP_NAME}/prisma/schema.prisma ]; then \
      npx prisma generate --schema=apps/${APP_NAME}/prisma/schema.prisma; \
    fi

# 6. Build the specific app (Now safe to build)
RUN nest build ${APP_NAME}

# --- Production Image ---
FROM node:20-alpine AS runner
WORKDIR /app
ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

# Copy the built app and the node_modules (which now contain the generated Prisma client)
COPY --from=builder /app/dist/apps/${APP_NAME} ./dist/apps/${APP_NAME}
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/${APP_NAME}/prisma ./prisma

EXPOSE 3000
CMD node dist/apps/$APP_NAME/main