import { createHash, randomBytes } from 'node:crypto';

/** Токен сессии для клиента: 32 случайных байта. */
export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** В базе храним только хэш токена: утёкшая база не даёт войти ни в чей мир. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
