# Образ сервера Interna. Собирается из корня репозитория (там pnpm-lock.yaml и настройки workspace):
#   docker build -f apps/server/Dockerfile -t interna-server .
# При старте контейнер применяет миграции базы, затем запускает API на $PORT (по умолчанию 3000).
# Нужные переменные: DATABASE_URL, CORS_ORIGINS (адрес клиента), PORT — если хостинг задаёт свой.

FROM node:24-slim AS base
# Движку миграций Prisma нужен OpenSSL, в slim-образе его нет.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# --- Сборка: все зависимости, TypeScript, генерация клиента Prisma ---
FROM base AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /app
# Сначала только манифесты: пока зависимости не менялись, Docker берёт установку из кэша.
# package.json остальных пакетов workspace нужны, чтобы pnpm сверился с lock-файлом.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @interna/server
COPY apps/server apps/server
RUN pnpm --filter @interna/server build
# Отдельная папка только с рабочими зависимостями сервера — без инструментов сборки и пакетов из корня репозитория.
RUN pnpm --filter @interna/server deploy --prod /out

# --- Итоговый образ: собранный сервер и то, что нужно ему для работы ---
FROM base
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/prisma ./prisma
COPY --from=build /app/apps/server/prisma.config.ts ./
EXPOSE 3000
USER node

# exec — чтобы сигнал остановки от хостинга дошёл до Node, и сервер закрыл соединения с базой.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
