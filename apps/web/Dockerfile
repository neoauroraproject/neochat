# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/i18n/package.json packages/i18n/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/i18n packages/i18n
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/web apps/web

RUN npm run build -w @neochat/i18n \
 && npm run build -w @neochat/shared \
 && npm run build -w @neochat/ui \
 && npm run build -w @neochat/web

FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache wget
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
