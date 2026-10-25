# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /repo

ARG VITE_BASE=/admin/
ENV VITE_BASE=${VITE_BASE}

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/i18n/package.json packages/i18n/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/i18n packages/i18n
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/admin apps/admin

RUN npm run build -w @neochat/i18n \
 && npm run build -w @neochat/shared \
 && npm run build -w @neochat/ui \
 && npm run build -w @neochat/admin

FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache wget
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
