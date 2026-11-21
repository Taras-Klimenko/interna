import { PrismaService } from '../prisma.service.js';
import { generateInviteCode } from '../invites.js';

/**
 * Выдать инвайт-коды: `pnpm invite "Аня" "Миша"` — по коду на каждое имя (имя — только заметка в базе).
 * Без аргументов — один код без заметки.
 */
const notes = process.argv.slice(2);
const prisma = new PrismaService();
try {
  for (const note of notes.length > 0 ? notes : ['']) {
    const invite = await prisma.invite.create({ data: { code: generateInviteCode(), note } });
    console.log(`${invite.code}${note ? `  — ${note}` : ''}`);
  }
} finally {
  await prisma.$disconnect();
}
