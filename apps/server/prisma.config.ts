import { defineConfig } from 'prisma/config';

// Prisma CLI сама .env не читает: подхватываем его встроенным в Node способом (если файл есть).
try {
  process.loadEnvFile('.env');
} catch {
  // На хостинге переменные приходят из окружения, без файла.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
