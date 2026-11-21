import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Жив ли сервер и есть ли связь с базой: для хостинга и для проверки руками. */
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
