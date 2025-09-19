// backend/src/prisma/fixetabemail.js
// Usage:
// node backend/src/prisma/fixetabemail.js
// node backend/src/prisma/fixetabemail.js --dry-run
// node backend/src/prisma/fixetabemail.js --establishmentId <id>
// node backend/src/prisma/fixetabemail.js --by-matricule
// node backend/src/prisma/fixetabemail.js --from-acronym ipgei --to-acronym esp
// node backend/src/prisma/fixetabemail.js --force

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

/** Defaults */
const DEFAULT_ESP_EID = 'cmfe3psxw0003cpr035aoqete';
const DEFAULT_FROM = 'ipgei';
const DEFAULT_TO   = 'esp';

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = process.argv[i + 1];
    if (v && !v.startsWith('--')) { out[k] = v; i++; } else { out[k] = true; }
  }
  return out;
}

function sanitizeAcronym(acr) {
  return String(acr || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const {
    establishmentId = DEFAULT_ESP_EID,
    'from-acronym': fromAcronymArg = DEFAULT_FROM,
    'to-acronym'  : toAcronymArg   = DEFAULT_TO,
    'by-matricule': byMatricule,
    'dry-run'     : dryRun,
    force,
  } = parseArgs();

  const fromAcr = sanitizeAcronym(fromAcronymArg) || DEFAULT_FROM;
  const toAcr   = sanitizeAcronym(toAcronymArg)   || DEFAULT_TO;
  const fromDomain = `${fromAcr}.mr`;
  const toDomain   = `${toAcr}.mr`;

  console.log('=== Fix ESP emails ===');
  console.log('Mode            :', byMatricule ? 'by matricule third digit = 1' : 'by establishmentId');
  console.log('EstablishmentId :', establishmentId);
  console.log('From domain     :', fromDomain);
  console.log('To domain       :', toDomain);
  console.log('Dry run         :', !!dryRun);
  console.log('Force           :', !!force);
  console.log('----------------------------------------');

  // Build the candidate list using parameterized queries (NO raw string interpolation)
  let candidates = [];
  const fromRegex = `@${fromDomain}$`;
  const toRegex   = `@${toDomain}$`;

  if (byMatricule) {
    // 3rd digit = 1  => ^..1
    candidates = await prisma.$queryRaw`
      SELECT
        p."id",
        p."matricule",
        p."email" AS old_email,
        LOWER(p."matricule" || '@' || ${toDomain}) AS new_email
      FROM "Person" p
      WHERE p."matricule" ~ '^[0-9]{2}1[0-9]+$'
        AND p."matricule" IS NOT NULL
        AND LENGTH(TRIM(p."matricule")) > 0
        AND p."email" IS NOT NULL
        AND LENGTH(TRIM(p."email")) > 0
        AND (
          p."email" ~* ${fromRegex}
          OR p."email" !~* ${toRegex}
        )
        AND p."email" IS DISTINCT FROM LOWER(p."matricule" || '@' || ${toDomain})
    `;
  } else {
    // By establishment id
    candidates = await prisma.$queryRaw`
      SELECT
        p."id",
        p."matricule",
        p."email" AS old_email,
        LOWER(p."matricule" || '@' || ${toDomain}) AS new_email
      FROM "Person" p
      WHERE p."establishmentId" = ${establishmentId}
        AND p."matricule" IS NOT NULL
        AND LENGTH(TRIM(p."matricule")) > 0
        AND p."email" IS NOT NULL
        AND LENGTH(TRIM(p."email")) > 0
        AND (
          p."email" ~* ${fromRegex}
          OR p."email" !~* ${toRegex}
        )
        AND p."email" IS DISTINCT FROM LOWER(p."matricule" || '@' || ${toDomain})
    `;
  }

  console.log(`Found ${candidates.length} person(s) to change.`);

  if (candidates.length === 0) {
    console.log('Nothing to update. Done.');
    return;
  }

  // Intra-batch collisions
  const counts = new Map();
  for (const c of candidates) {
    const key = String(c.new_email).toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const batchCollisions = [...counts.entries()].filter(([, n]) => n > 1);
  if (batchCollisions.length) {
    console.error('❌ Intra-batch email collisions:');
    batchCollisions.forEach(([mail, n]) => console.error(`  ${mail} -> ${n} rows`));
    if (!force) {
      console.error('Aborting. Resolve duplicates or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: first 10 changes ---');
    candidates.slice(0, 10).forEach(c => {
      console.log(`${c.matricule}: ${c.old_email ?? '(null)'}  ->  ${c.new_email}`);
    });
    console.log('No changes written (dry run).');
    return;
  }

  // Temp table (TEXT ids for CUIDs)
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _fix_esp_email_candidates;`);
  await prisma.$executeRawUnsafe(`CREATE TEMP TABLE _fix_esp_email_candidates (id TEXT, new_email TEXT);`);

  // Insert candidates in chunks with parameter arrays (safe)
  const CHUNK = 2000;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const ids = slice.map(c => String(c.id));
    const emails = slice.map(c => String(c.new_email));
    await prisma.$executeRaw`
      INSERT INTO _fix_esp_email_candidates (id, new_email)
      SELECT * FROM UNNEST(${ids}::text[], ${emails}::text[]);
    `;
  }

  // Existing conflicts
  const conflicts = await prisma.$queryRaw`
    SELECT c.new_email, COUNT(*) AS cnt
    FROM _fix_esp_email_candidates c
    JOIN "Person" p ON p."email" = c.new_email AND p."id" <> c.id
    GROUP BY c.new_email
    HAVING COUNT(*) > 0;
  `;
  if (conflicts.length) {
    console.error('❌ Conflicts with existing Person emails:');
    for (const r of conflicts) console.error(`  ${r.new_email} already used by ${r.cnt} person(s)`);
    if (!force) {
      console.error('Aborting. Resolve conflicts or rerun with --force (NOT recommended).');
      process.exit(1);
    }
  }

  // Backup
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS person_email_backup_espfix (
      id TEXT PRIMARY KEY,
      old_email TEXT,
      backup_at timestamptz DEFAULT now()
    );
  `;
  await prisma.$executeRaw`
    INSERT INTO person_email_backup_espfix (id, old_email)
    SELECT c.id, p."email"
    FROM _fix_esp_email_candidates c
    JOIN "Person" p ON p."id" = c.id
    ON CONFLICT (id) DO UPDATE SET old_email = EXCLUDED.old_email, backup_at = now();
  `;

  // Update
  const updated = await prisma.$executeRaw`
    UPDATE "Person" p
    SET "email" = c.new_email
    FROM _fix_esp_email_candidates c
    WHERE p."id" = c.id;
  `;

  const updatedCount = typeof updated === 'number' ? updated : (updated?.rowCount ?? 0);
  console.log(`✅ Updated ${updatedCount} ESP email(s) to *@${toDomain}.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
