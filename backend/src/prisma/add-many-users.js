// Creates a User for each Person with type='STUDENT'.
// Fields: username, email, passwordHash (argon2 of matricule), name, mustChangePassword=true, role='STUDENT'.
// Skips any already-existing username/email and logs it.
// Optional: --force-reset to re-set mustChangePassword=true for existing users (no password change).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client'; // <- Role enum

// Load backend/.env explicitly
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Put it in backend/.env or export it in your shell.');
  process.exit(1);
}

const prisma = new PrismaClient();
const FORCE_RESET = process.argv.includes('--force-reset');

const USERNAME_FIELD = 'username';
const EMAIL_FIELD    = 'email';
const PASSWORD_FIELD = 'passwordHash';
const NAME_FIELD     = 'name';
const ROLE_FIELD     = 'role';
const MUST_CHANGE_FIELD = 'mustChangePassword';
const DEFAULT_ROLE = Role.STUDENT; // <- required enum value

const clean = (v) => String(v ?? '').trim();

async function whereAmI() {
  const [row] = await prisma.$queryRaw`
    SELECT current_database() AS db,
           current_user       AS usr,
           inet_server_addr()::text AS host
  `;
  console.log(`→ Target DB: db=${row.db}, host=${row.host}, user=${row.usr}`);
}

async function main() {
  await whereAmI();

  const students = await prisma.person.findMany({
    where: { type: 'STUDENT' },               // Person has no mustChangePassword field
    select: { id: true, matricule: true, email: true },
  });

  console.log(`Found ${students.length} student person records.`);

  let created = 0, skippedExists = 0, skippedMissing = 0, resetFlag = 0, problems = 0;

  for (const p of students) {
    const matricule = clean(p.matricule);
    const email     = clean(p.email);

    if (!matricule || !email) {
      console.log(`↩︎ skipped (missing matricule/email) personId=${p.id}`);
      skippedMissing++;
      continue;
    }

    const username = matricule;
    const name     = matricule;

    try {
      // Check by username OR email
      const existing = await prisma.user.findFirst({
        where: { OR: [{ [USERNAME_FIELD]: username }, { [EMAIL_FIELD]: email }] },
        select: { id: true, [MUST_CHANGE_FIELD]: true },
      });

      if (existing) {
        if (FORCE_RESET && existing[MUST_CHANGE_FIELD] !== true) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { [MUST_CHANGE_FIELD]: true },
          });
          console.log(`↺ reset mustChangePassword for username='${username}' (userId=${existing.id})`);
          resetFlag++;
        } else {
          console.log(`↩︎ exists, skipped username='${username}' email='${email}'`);
          skippedExists++;
        }
        continue;
      }

      const hashed = await argon2.hash(matricule);

      await prisma.user.create({
        data: {
          [USERNAME_FIELD]: username,
          [EMAIL_FIELD]: email,
          [PASSWORD_FIELD]: hashed,
          [NAME_FIELD]: name,
          [MUST_CHANGE_FIELD]: true,
          [ROLE_FIELD]: DEFAULT_ROLE, // <- REQUIRED: role = 'STUDENT'
        },
      });

      console.log(`✓ created username='${username}' email='${email}' role='${DEFAULT_ROLE}'`);
      created++;
    } catch (e) {
      problems++;
      console.error(`! Failed for matricule='${matricule}': ${e.message || e}`);
    }
  }

  console.log('— Summary —');
  console.log(`  Created:           ${created}`);
  console.log(`  Skipped (exists):  ${skippedExists}`);
  console.log(`  Skipped (missing): ${skippedMissing}`);
  console.log(`  Reset flags:       ${resetFlag}`);
  console.log(`  Problems:          ${problems}`);
}

await main().catch(e => { console.error('Fatal:', e); process.exit(1); });
await prisma.$disconnect();
