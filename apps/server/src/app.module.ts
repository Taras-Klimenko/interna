import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { WorldService } from './world/world.service.js';
import { WorldController } from './world/world.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [AuthController, WorldController, HealthController],
  providers: [PrismaService, AuthService, AuthGuard, WorldService],
})
export class AppModule {}
