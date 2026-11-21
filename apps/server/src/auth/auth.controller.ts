import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthService, type SessionUser } from './auth.service.js';
import { AuthGuard, CurrentUser } from './auth.guard.js';
import { checkLoginRate } from './rate-limit.js';

const LoginBody = z.object({ code: z.string().min(1).max(40) });

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    checkLoginRate(ip);
    const parsed = LoginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Введите инвайт-код');
    return this.auth.login(parsed.data.code, userAgent ?? '');
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: SessionUser) {
    await this.auth.logout(user.sessionId);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser) {
    return { id: user.id, name: user.name };
  }
}
