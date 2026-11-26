import { Controller, Delete, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { MemoryService } from './memory.service.js';

/**
 * Что персонаж помнит — хозяину видно всё: факты о нём (их можно стереть по одному или все сразу)
 * и дневник персонажа.
 */
@Controller('memory')
@UseGuards(AuthGuard)
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memory: MemoryService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    const [facts, diary] = await Promise.all([this.memory.list(user.id, 'fact'), this.memory.list(user.id, 'diary', 50)]);
    return { facts, diary };
  }

  /** Забыть один факт. */
  @Delete('facts/:id')
  async forget(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.memory.deleteFact(user.id, id);
    return { ok: true };
  }

  /** Забыть всё, что персонаж знает о хозяине. Дневник остаётся. */
  @Delete('facts')
  async forgetAll(@CurrentUser() user: SessionUser) {
    await this.memory.clearFacts(user.id);
    return { ok: true };
  }
}
