import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { WorldService } from './world/world.service.js';
import { WorldController } from './world/world.controller.js';
import { HealthController } from './health.controller.js';
import { ChatService } from './chat/chat.service.js';
import { ChatController } from './chat/chat.controller.js';
import { MemoryService } from './chat/memory.service.js';
import { MemoryController } from './chat/memory.controller.js';

@Module({
  controllers: [AuthController, WorldController, ChatController, MemoryController, HealthController],
  providers: [PrismaService, AuthService, AuthGuard, WorldService, ChatService, MemoryService],
})
export class AppModule {}
