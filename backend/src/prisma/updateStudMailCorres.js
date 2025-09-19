// Usage examples:
//
// node src/prisma/updateStudMailCorres.js \
//   --establishmentId  \
//   --acronym ipgei
//
// node src/prisma/updateStudMailCorres.js \
//   --establishmentId example : 4npjv \
//   --acronym ipgei \
//   --student-literal STUDENT \
//   --dry-run
//
// Flags:
//   --establishmentId   required
//   --acronym           required (e.g. esp, ipegei)
//   --student-literal   optional; your PersonType enum literal (default: STUDENT)
//   --dry-run           optional
//   --force             optional

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

function sanitizeAcronym(acronym) {
  const clean = String(acronym || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!clean) throw new Error('Invalid --acronym. Use letters/digits only.');
  return clean;
}

async function main() {
  const {
    establishmentId,
    acronym,
    'student-literal': studentLiteral = 'STUDENT',
    'dry-run': dryRun,
    force,
  } = parseArgs();

  if (!establishmentId) throw new Error('Missing --establishmentId');
  if (!acronym) throw new Error('Missing --acronym (e.g., esp, ipegei)');

  const cleanAcr = sanitizeAcronym(acronym);
  const domain = `${cleanAcr}.mr`;

  console.log('=== Update Student Emails By Acronym ===');
  console.log('Establishment  :', establishmentId);
  console.log('Acronym        :', cleanAcr);
  console.log('Domain         :', domain);
  console.log('Student literal:', studentLiteral, '(must match "PersonType" enum)');
  console.log('Dry run        :', !!dryRun);
  console.log('Force          :', !!force);
  console.log('----------------------------------------');

  // Select students of that establishment whose email would change
  const candidates = await prisma.$queryRaw`
    SELECT
      p."id",
      p."matricule",
      p."email" AS old_email,
      LOWER(p."matricule" || '@' || ${domain}) AS new_email
    FROM "Person" p
    WHERE p."establishmentId" = ${establishmentId}
      AND p."type" = CAST(${studentLiteral} AS "PersonType")
      AND p."matricule" IS NOT NULL
      AND LENGTH(TRIM(p."matricule")) > 0
      AND p."email" IS DISTINCT FROM LOWER(p."matricule" || '@' || ${domain})
  `;

  console.log(`Found ${candidates.length} student(s) to change.`);

  if (candidates.length === 0) {
    console.log('Nothing to update. Done.');
    return;
  }

  // Intra-batch collisions
  const counts = new Map();
  for (const c of candidates) counts.set(c.new_email, (counts.get(c.new_email) || 0) + 1);
  const batchCollisions = [...counts.entries()].filter(([, n]) => n > 1);
  if (batchCollisions.length) {
    console.error('❌ Intra-batch email collisions detected:');
    batchCollisions.forEach(([mail, n]) => console.error(`  ${mail} -> ${n} rows`));
    if (!force) {
      console.error('Aborting. Resolve duplicates or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: first 10 changes ---');
    candidates.slice(0, 10).forEach((c) => {
      console.log(`${c.matricule}: ${c.old_email ?? '(null)'}  ->  ${c.new_email}`);
    });
    console.log('No changes written (dry run).');
    return;
  }

  // 🔧 FIX #1: use TEXT (NOT uuid) for id in the temp table
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _email_candidates;`);
  await prisma.$executeRawUnsafe(`CREATE TEMP TABLE _email_candidates (id TEXT, new_email TEXT);`);

  // Efficiently insert candidates into temp table using UNNEST + parameters
  const CHUNK = 2000;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const ids = slice.map((c) => c.id);
    const emails = slice.map((c) => c.new_email);

    // Arrays are safely bound by Prisma; we cast to text[]
    await prisma.$executeRaw`
      INSERT INTO _email_candidates (id, new_email)
      SELECT * FROM UNNEST(${ids}::text[], ${emails}::text[]);
    `;
  }

  // Conflicts with existing rows (outside the one being updated)
  const conflicts = await prisma.$queryRawUnsafe(`
    SELECT c.new_email, COUNT(*) AS cnt
    FROM _email_candidates c
    JOIN "Person" p ON p."email" = c.new_email AND p."id" <> c.id
    GROUP BY c.new_email
    HAVING COUNT(*) > 0;
  `);

  if (conflicts.length) {
    console.error('❌ Conflicts with existing emails in DB:');
    for (const r of conflicts) console.error(`  ${r.new_email} already used by ${r.cnt} other person(s)`);
    if (!force) {
      console.error('Aborting. Resolve duplicates or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  // 🔧 FIX #2: make backup table id TEXT as well (drop/recreate or alter if needed)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS person_email_backup (
      id TEXT PRIMARY KEY,
      old_email TEXT,
      backup_at timestamptz DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO person_email_backup (id, old_email)
    SELECT c.id, p."email"
    FROM _email_candidates c
    JOIN "Person" p ON p."id" = c.id
    ON CONFLICT (id) DO UPDATE SET old_email = EXCLUDED.old_email, backup_at = now();
  `);

  // Perform the update
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Person" p
    SET "email" = c.new_email
    FROM _email_candidates c
    WHERE p."id" = c.id;
  `);

  const updatedCount = typeof updated === 'number' ? updated : (updated?.rowCount ?? 0);
  console.log(`✅ Updated ${updatedCount} student email(s) to *@${domain}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
