import { randomInt } from 'node:crypto';

/** Без похожих символов (0/O, 1/I/L), чтобы код было легко продиктовать и переписать с телефона. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const GROUPS = 3;
const GROUP_LENGTH = 4;

/** Новый инвайт-код вида K7QM-3XPA-9WTR: 12 символов из 31 — около 59 бит, подобрать нереально. */
export function generateInviteCode() {
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  );
  return groups.join('-');
}

/** Код, как его ввёл человек (строчные, пробелы, без дефисов), → как он хранится в базе. Null — не похоже на код. */
export function normalizeInviteCode(input: string) {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.length !== GROUPS * GROUP_LENGTH) return null;
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_LENGTH) groups.push(raw.slice(i, i + GROUP_LENGTH));
  return groups.join('-');
}
