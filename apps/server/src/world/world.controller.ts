import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Put, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { WorldService } from './world.service.js';
import { SaveWorldBody } from './world.schema.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Мир текущего пользователя: комната, предметы, персонаж — одним документом. */
@Controller('world')
@UseGuards(AuthGuard)
export class WorldController {
  constructor(@Inject(WorldService) private readonly worlds: WorldService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    const world = await this.worlds.get(user.id);
    if (!world) throw new NotFoundException('Мира на сервере ещё нет');
    return world;
  }

  @Put()
  async save(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const parsed = SaveWorldBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Мир не похож на мир Interna');
    return this.worlds.save(user.id, parsed.data.world as Prisma.InputJsonValue, parsed.data.baseVersion);
  }
}
