FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root config
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/server/ ./apps/server/

# Install dependencies
RUN npm install --workspace=packages/shared-types --workspace=apps/server

# Build shared-types first, then server
RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=apps/server

# ─── Production image ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/

EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]
