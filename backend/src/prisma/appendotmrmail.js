// Usage:
// node src/prisma/appendMrToStudentEmails.js
// node src/prisma/appendMrToStudentEmails.js --dry-run
// node src/prisma/appendMrToStudentEmails.js --student-literal STUDENT --role-enum Role
// node src/prisma/appendMrToStudentEmails.js --student-literal Etudiant --role-enum UserRole
// node src/prisma/appendMrToStudentEmails.js --force   # (bypass collision aborts)

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = process.argv[i + 1];
    if (v && !v.startsWith('--')) {
      out[k] = v;
      i++;
    } else {
      out[k] = true;
    }
  }
  return out;
}

async function main() {
  const {
    'student-literal': studentLiteral = 'STUDENT',
    'role-enum': roleEnum = 'Role',
    'dry-run': dryRun,
    force,
  } = parseArgs();

  console.log('=== Append ".mr" to STUDENT emails ===');
  console.log('Student literal :', studentLiteral);
  console.log('Role enum type  :', roleEnum);
  console.log('Dry run         :', !!dryRun);
  console.log('Force           :', !!force);
  console.log('--------------------------------------');

  // Pull candidates: users with role = STUDENT whose email doesn't already end with .mr (case-insensitive).
  const candidates = await prisma.$queryRawUnsafe(`
    SELECT
      u."id",
      u."email" AS old_email,
      (u."email" || '.mr') AS new_email
    FROM "User" u
    WHERE u."role" = CAST($1 AS "${roleEnum}")
      AND u."email" IS NOT NULL
      AND LENGTH(TRIM(u."email")) > 0
      AND u."email" !~* '\\.mr$'
  `, studentLiteral);

  console.log(`Found ${candidates.length} user(s) to change.`);

  if (candidates.length === 0) {
    console.log('Nothing to update. Done.');
    return;
  }

  // 1) Intra-batch collisions (same new_email generated more than once)
  const counts = new Map();
  for (const c of candidates) {
    const key = String(c.new_email).toLowerCase(); // case-insensitive domain safety
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const batchCollisions = [...counts.entries()].filter(([, n]) => n > 1);
  if (batchCollisions.length) {
    console.error('❌ Intra-batch email collisions detected:');
    for (const [mail, n] of batchCollisions) console.error(`  ${mail} -> ${n} rows`);
    if (!force) {
      console.error('Aborting. Resolve duplicates or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: first 10 changes ---');
    candidates.slice(0, 10).forEach((c) => {
      console.log(`${c.old_email ?? '(null)'}  ->  ${c.new_email}`);
    });
    console.log('No changes written (dry run).');
    return;
  }

  // Temp staging table for collision checks + update.
  // Use TEXT for id because your IDs are likely CUIDs, not UUID.
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _user_email_candidates;`);
  await prisma.$executeRawUnsafe(`CREATE TEMP TABLE _user_email_candidates (id TEXT, new_email TEXT);`);

  // Insert candidates in chunks using parameterized arrays (safe)
  const CHUNK = 2000;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const ids = slice.map((c) => String(c.id));
    const emails = slice.map((c) => String(c.new_email));
    await prisma.$executeRaw`
      INSERT INTO _user_email_candidates (id, new_email)
      SELECT * FROM UNNEST(${ids}::text[], ${emails}::text[]);
    `;
  }

  // 2) Conflicts with existing rows (outside the one being updated)
  const conflicts = await prisma.$queryRawUnsafe(`
    SELECT c.new_email, COUNT(*) AS cnt
    FROM _user_email_candidates c
    JOIN "User" u ON u."email" = c.new_email AND u."id" <> c.id
    GROUP BY c.new_email
    HAVING COUNT(*) > 0;
  `);

  if (conflicts.length) {
    console.error('❌ Conflicts with existing emails in DB:');
    for (const r of conflicts) console.error(`  ${r.new_email} already used by ${r.cnt} other user(s)`);
    if (!force) {
      console.error('Aborting. Resolve duplicates or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  // Backup table (id TEXT to support CUIDs)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_email_backup (
      id TEXT PRIMARY KEY,
      old_email TEXT,
      backup_at timestamptz DEFAULT now()
    );
  `);

  // Save previous email for those ids (idempotent upsert)
  await prisma.$executeRawUnsafe(`
    INSERT INTO user_email_backup (id, old_email)
    SELECT c.id, u."email"
    FROM _user_email_candidates c
    JOIN "User" u ON u."id" = c.id
    ON CONFLICT (id) DO UPDATE SET old_email = EXCLUDED.old_email, backup_at = now();
  `);

  // Do the update
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "User" u
    SET "email" = c.new_email
    FROM _user_email_candidates c
    WHERE u."id" = c.id;
  `);

  const updatedCount = typeof updated === 'number' ? updated : (updated?.rowCount ?? 0);
  console.log(`✅ Updated ${updatedCount} user email(s) to append ".mr".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
