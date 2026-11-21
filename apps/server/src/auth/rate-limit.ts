import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Простое ограничение попыток входа по IP, в памяти процесса: не больше LIMIT попыток за WINDOW_MS.
 * Для прототипа на одном сервере этого достаточно; если серверов станет несколько — перенести в базу или Redis.
 */
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRate(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 10_000) {
      for (const [key, value] of attempts) if (value.resetAt < now) attempts.delete(key);
    }
    return;
  }
  entry.count++;
  if (entry.count > LIMIT) {
    throw new HttpException('Слишком много попыток входа, попробуйте через несколько минут', HttpStatus.TOO_MANY_REQUESTS);
  }
}
