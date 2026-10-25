# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/crypto/package.json packages/crypto/
COPY packages/i18n/package.json packages/i18n/
COPY packages/plugins/package.json packages/plugins/
COPY packages/providers/package.json packages/providers/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api

RUN npm run build -w @neochat/config \
 && npm run build -w @neochat/crypto \
 && npm run build -w @neochat/i18n \
 && npm run build -w @neochat/plugins \
 && npm run build -w @neochat/providers \
 && npm run build -w @neochat/shared \
 && npm run build -w @neochat/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY --from=builder /repo/package.json /repo/package-lock.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/packages/config/package.json ./packages/config/
COPY --from=builder /repo/packages/config/dist ./packages/config/dist
COPY --from=builder /repo/packages/crypto/package.json ./packages/crypto/
COPY --from=builder /repo/packages/crypto/dist ./packages/crypto/dist
COPY --from=builder /repo/packages/i18n/package.json ./packages/i18n/
COPY --from=builder /repo/packages/i18n/dist ./packages/i18n/dist
COPY --from=builder /repo/packages/plugins/package.json ./packages/plugins/
COPY --from=builder /repo/packages/plugins/dist ./packages/plugins/dist
COPY --from=builder /repo/packages/providers/package.json ./packages/providers/
COPY --from=builder /repo/packages/providers/dist ./packages/providers/dist
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist

WORKDIR /app/apps/api
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
