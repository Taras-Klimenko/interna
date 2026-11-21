import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class WorldService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const world = await this.prisma.world.findUnique({ where: { userId } });
    return world && { world: world.data, version: world.version, updatedAt: world.updatedAt };
  }

  /**
   * Сохраняет мир, если клиент менял ту версию, что сейчас на сервере. Иначе — 409 с серверной версией:
   * мир успели поменять с другого устройства, и клиент сам решает, что делать.
   */
  async save(userId: string, data: Prisma.InputJsonValue, baseVersion: number | null) {
    if (baseVersion === null) {
      const existing = await this.prisma.world.findUnique({ where: { userId } });
      if (existing) throw this.conflict(existing);
      const created = await this.prisma.world.create({ data: { userId, data } });
      return { version: created.version, updatedAt: created.updatedAt };
    }
    // Обновляем, только если версия совпала: одной командой, без гонки между двумя устройствами.
    const updated = await this.prisma.world.updateMany({
      where: { userId, version: baseVersion },
      data: { data, version: { increment: 1 } },
    });
    const current = await this.prisma.world.findUnique({ where: { userId } });
    if (!current) throw new ConflictException({ message: 'Мира на сервере нет', world: null, version: null });
    if (updated.count === 0) throw this.conflict(current);
    return { version: current.version, updatedAt: current.updatedAt };
  }

  private conflict(current: { data: Prisma.JsonValue; version: number; updatedAt: Date }) {
    return new ConflictException({
      message: 'Мир изменился на другом устройстве',
      world: current.data,
      version: current.version,
      updatedAt: current.updatedAt,
    });
  }
}
