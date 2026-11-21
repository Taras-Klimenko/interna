import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

/** Мир с книгами и плейлистами — это только метаданные (файлы остаются на устройстве), но с запасом: 2 МБ. */
const BODY_LIMIT = '2mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.setGlobalPrefix('api');
  // За прокси хостинга IP клиента приходит в X-Forwarded-For: без этого ограничение попыток входа считало бы всех одним человеком.
  app.set('trust proxy', 1);
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) app.enableCors({ origin: origins });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Interna API: http://localhost:${port}/api`);
}

void bootstrap();
