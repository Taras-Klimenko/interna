import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { normalizeInviteCode } from '../invites.js';
import { hashToken, newSessionToken } from './tokens.js';

export interface SessionUser {
  id: string;
  name: string;
  sessionId: string;
}

/** Отметку «был в сети» обновляем не чаще раза в столько миллисекунд, чтобы не писать в базу на каждый запрос. */
const SEEN_INTERVAL_MS = 10 * 60 * 1000;

/*
 * Во всех конструкторах — @Inject с явным классом: в разработке сервер запускается через tsx (esbuild),
 * а он не сохраняет метаданные типов, по которым Nest обычно сам находит зависимости.
 */

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Вход по инвайт-коду. Первый вход создаёт пользователя, следующие (с телефона, из другого браузера)
   * входят в того же пользователя. Возвращает токен новой сессии.
   */
  async login(input: string, userAgent: string) {
    const code = normalizeInviteCode(input);
    const invite = code ? await this.prisma.invite.findUnique({ where: { code } }) : null;
    if (!invite) throw new UnauthorizedException('Такого кода нет. Проверьте, нет ли опечатки');

    const user = invite.userId
      ? await this.prisma.user.findUniqueOrThrow({ where: { id: invite.userId } })
      : await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data: {} });
          // Условие userId: null защищает от гонки: два первых входа одновременно не создадут двух пользователей.
          const claimed = await tx.invite.updateMany({
            where: { code: invite.code, userId: null },
            data: { userId: created.id, usedAt: new Date() },
          });
          if (claimed.count === 0) throw new UnauthorizedException('Код только что использовали, попробуйте ещё раз');
          return created;
        });

    const token = newSessionToken();
    await this.prisma.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, userAgent: userAgent.slice(0, 300) },
    });
    return { token, user: { id: user.id, name: user.name } };
  }

  async userForToken(token: string): Promise<SessionUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (Date.now() - session.lastSeenAt.getTime() > SEEN_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return { id: session.user.id, name: session.user.name, sessionId: session.id };
  }

  async logout(sessionId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }
}
