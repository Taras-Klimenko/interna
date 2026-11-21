import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type SessionUser } from './auth.service.js';

type AuthedRequest = Request & { user?: SessionUser };

/** Пропускает запрос только с действующим токеном сессии в заголовке Authorization: Bearer … */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException('Нужно войти заново');
    request.user = user;
    return true;
  }
}

/** Текущий пользователь (после AuthGuard). */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthedRequest>().user!;
});
