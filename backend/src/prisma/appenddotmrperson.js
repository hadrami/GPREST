// Usage:
// node src/prisma/appendMrToPersonStudentEmails.js
// node src/prisma/appendMrToPersonStudentEmails.js --dry-run
// node src/prisma/appendMrToPersonStudentEmails.js --student-literal STUDENT
// node src/prisma/appendMrToPersonStudentEmails.js --student-literal Etudiant
// node src/prisma/appendMrToPersonStudentEmails.js --force   # bypass collision aborts

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
      out[k] = true; // boolean flags like --dry-run, --force
    }
  }
  return out;
}

async function main() {
  const {
    'student-literal': studentLiteral = 'STUDENT',
    'dry-run': dryRun,
    force,
  } = parseArgs();

  console.log('=== Append ".mr" to Person emails where type = STUDENT ===');
  console.log('PersonType literal:', studentLiteral);
  console.log('Dry run           :', !!dryRun);
  console.log('Force             :', !!force);
  console.log('---------------------------------------------------------');

  // Candidates: Person.type = STUDENT, email present, not already ending with .mr (case-insensitive)
  const candidates = await prisma.$queryRaw`
    SELECT
      p."id",
      p."email" AS old_email,
      (p."email" || '.mr') AS new_email
    FROM "Person" p
    WHERE p."type" = CAST(${studentLiteral} AS "PersonType")
      AND p."email" IS NOT NULL
      AND LENGTH(TRIM(p."email")) > 0
      AND p."email" !~* '\\.mr$'
  `;

  console.log(`Found ${candidates.length} person(s) to change.`);

  if (candidates.length === 0) {
    console.log('Nothing to update. Done.');
    return;
  }

  // Intra-batch collisions (same new_email generated more than once)
  const counts = new Map();
  for (const c of candidates) {
    const key = String(c.new_email).toLowerCase();
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

  // Use TEXT for id (your IDs are CUIDs)
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _person_email_candidates;`);
  await prisma.$executeRawUnsafe(`CREATE TEMP TABLE _person_email_candidates (id TEXT, new_email TEXT);`);

  // Insert candidates in chunks using parameterized arrays
  const CHUNK = 2000;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const ids = slice.map((c) => String(c.id));
    const emails = slice.map((c) => String(c.new_email));
    await prisma.$executeRaw`
      INSERT INTO _person_email_candidates (id, new_email)
      SELECT * FROM UNNEST(${ids}::text[], ${emails}::text[]);
    `;
  }

  // Conflicts with existing rows (outside the current row)
  const conflicts = await prisma.$queryRawUnsafe(`
    SELECT c.new_email, COUNT(*) AS cnt
    FROM _person_email_candidates c
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

  // Backup table (TEXT id to support CUIDs)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS person_email_backup_global (
      id TEXT PRIMARY KEY,
      old_email TEXT,
      backup_at timestamptz DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO person_email_backup_global (id, old_email)
    SELECT c.id, p."email"
    FROM _person_email_candidates c
    JOIN "Person" p ON p."id" = c.id
    ON CONFLICT (id) DO UPDATE SET old_email = EXCLUDED.old_email, backup_at = now();
  `);

  // Perform the update
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Person" p
    SET "email" = c.new_email
    FROM _person_email_candidates c
    WHERE p."id" = c.id;
  `);

  const updatedCount = typeof updated === 'number' ? updated : (updated?.rowCount ?? 0);
  console.log(`✅ Updated ${updatedCount} Person email(s) to append ".mr".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
