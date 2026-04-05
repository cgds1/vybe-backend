# ---- Stage 1: Install production dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: Build the application ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/
COPY prisma.config.ts ./
RUN npm run build

# ---- Stage 3: Production image ----
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules/

# Copy built application
COPY --from=build /app/dist ./dist/

# Copy Prisma schema and migrations (needed for prisma migrate deploy)
COPY --from=build /app/prisma ./prisma/

# Copy generated Prisma client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client/

# Copy package.json (needed for scripts)
COPY package.json ./

# Copy Prisma CLI for migrations (devDependency not included in prod deps)
COPY --from=build /app/node_modules/prisma ./node_modules/prisma/
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy Prisma config (required by Prisma 7 for datasource URL at runtime)
COPY prisma.config.ts ./

USER appuser

EXPOSE ${PORT:-3000}

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
