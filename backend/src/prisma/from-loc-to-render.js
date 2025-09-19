// backend/src/prisma/from-loc-to-render.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const LOCAL_URL  = process.env.LOCAL_URL;
const RENDER_URL = process.env.RENDER_URL;

if (!LOCAL_URL || !RENDER_URL) {
  console.error('❌ Please set LOCAL_URL and RENDER_URL env vars.');
  process.exit(1);
}

// Simple arg parser
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) continue;
  const k = process.argv[i].slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith('--')) { args[k] = v; i++; } else { args[k] = true; }
}
const MODE = String(args.mode || 'insert').toLowerCase(); // insert | upsert | replace
const DRY  = !!args['dry-run'];

const local  = new PrismaClient({ datasources: { db: { url: LOCAL_URL  } } });
const render = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

const CHUNK = 500;

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function whereAmI(client, label) {
  const [row] = await client.$queryRaw`
    SELECT current_database() AS db,
           current_user AS usr,
           inet_server_addr()::text AS host
  `;
  console.log(`→ ${label}: db=${row.db} host=${row.host} user=${row.usr}`);
}

function stripSystemFields(rows, fields = ['createdAt', 'updatedAt']) {
  return rows.map(r => {
    const c = { ...r };
    for (const f of fields) if (f in c) delete c[f];
    return c;
  });
}

async function copyInsert(modelName, readFn, writeFn, keyDesc) {
  const items = await readFn();
  console.log(`• ${modelName}: local has ${items.length} rows`);
  if (items.length === 0) return { created: 0 };

  let created = 0;
  for (const batch of chunk(items)) {
    if (DRY) continue;
    const res = await writeFn(batch);
    created += res.count ?? 0;
  }
  console.log(`  ↳ inserted (new) = ${created} (skipDuplicates by ${keyDesc})`);
  return { created };
}

async function copyUpsert(modelName, readFn, upsertOne, key = 'id') {
  const items = await readFn();
  console.log(`• ${modelName}: local has ${items.length} rows`);
  if (items.length === 0) return { upserted: 0 };

  let upserted = 0;
  for (const batch of chunk(items)) {
    if (DRY) continue;
    await Promise.all(batch.map(async row => {
      const where = { [key]: row[key] };
      const data  = stripSystemFields([row])[0];
      await upsertOne(where, data);
      upserted++;
    }));
  }
  console.log(`  ↳ upserted (created or updated) = ${upserted}`);
  return { upserted };
}

async function run() {
  console.log(`=== Sync LOCAL -> RENDER (mode=${MODE}${DRY ? ', dry-run' : ''}) ===`);
  await whereAmI(local,  'LOCAL');
  await whereAmI(render, 'RENDER');

  if (MODE === 'insert') {
    // Establishment
    await copyInsert(
      'Establishment',
      () => local.establishment.findMany(),
      (rows) => render.establishment.createMany({ data: rows, skipDuplicates: true }),
      'id'
    );
    // Person
    await copyInsert(
      'Person',
      () => local.person.findMany(),
      (rows) => render.person.createMany({ data: rows, skipDuplicates: true }),
      'id'
    );
    // User
    await copyInsert(
      'User',
      () => local.user.findMany(),
      (rows) => render.user.createMany({ data: rows, skipDuplicates: true }),
      'id/username/email'
    );
    // MealPlan (optional)
    try {
      await copyInsert(
        'MealPlan',
        () => local.mealPlan.findMany(),
        (rows) => render.mealPlan.createMany({ data: rows, skipDuplicates: true }),
        'id'
      );
    } catch (e) {
      if (String(e.message || e).includes('Invalid prisma.mealPlan')) {
        console.log('  (skipped: MealPlan model not found in schema)');
      } else throw e;
    }
    // MealConsumption (optional)
    try {
      await copyInsert(
        'MealConsumption',
        () => local.mealConsumption.findMany(),
        (rows) => render.mealConsumption.createMany({ data: rows, skipDuplicates: true }),
        'id'
      );
    } catch (e) {
      if (String(e.message || e).includes('Invalid prisma.mealConsumption')) {
        console.log('  (skipped: MealConsumption model not found in schema)');
      } else throw e;
    }
  } else if (MODE === 'upsert') {
    // Establishment
    await copyUpsert(
      'Establishment',
      () => local.establishment.findMany(),
      (where, data) => render.establishment.upsert({ where, update: data, create: data })
    );
    // Person
    await copyUpsert(
      'Person',
      () => local.person.findMany(),
      (where, data) => render.person.upsert({ where, update: data, create: data })
    );
    // User
    await copyUpsert(
      'User',
      () => local.user.findMany(),
      (where, data) => render.user.upsert({ where, update: data, create: data })
    );
    // MealPlan (optional)
    try {
      await copyUpsert(
        'MealPlan',
        () => local.mealPlan.findMany(),
        (where, data) => render.mealPlan.upsert({ where, update: data, create: data })
      );
    } catch (e) {
      if (String(e.message || e).includes('Invalid prisma.mealPlan')) {
        console.log('  (skipped: MealPlan model not found in schema)');
      } else throw e;
    }
    // MealConsumption (optional)
    try {
      await copyUpsert(
        'MealConsumption',
        () => local.mealConsumption.findMany(),
        (where, data) => render.mealConsumption.upsert({ where, update: data, create: data })
      );
    } catch (e) {
      if (String(e.message || e).includes('Invalid prisma.mealConsumption')) {
        console.log('  (skipped: MealConsumption model not found in schema)');
      } else throw e;
    }
  } else if (MODE === 'replace') {
    // Replace everything on Render with what's on Local, obeying FK order
    const dry = DRY;

    await render.$transaction(async (tx) => {
      console.log('  ↳ deleting on RENDER (child→parent order)...');
      if (!dry) {
        try { await tx.mealConsumption.deleteMany({}); } catch {}
        try { await tx.mealPlan.deleteMany({}); } catch {}
        await tx.person.deleteMany({});
        await tx.user.deleteMany({});
        await tx.establishment.deleteMany({});
      }

      console.log('  ↳ inserting on RENDER (parent→child order)...');

      // Establishment
      {
        const rows = await local.establishment.findMany();
        console.log(`• Establishment: local has ${rows.length} rows`);
        if (!dry && rows.length) await tx.establishment.createMany({ data: rows });
      }
      // Person
      {
        const rows = await local.person.findMany();
        console.log(`• Person: local has ${rows.length} rows`);
        if (!dry && rows.length) await tx.person.createMany({ data: rows });
      }
      // User
      {
        const rows = await local.user.findMany();
        console.log(`• User: local has ${rows.length} rows`);
        if (!dry && rows.length) await tx.user.createMany({ data: rows });
      }
      // MealPlan (optional)
      try {
        const rows = await local.mealPlan.findMany();
        console.log(`• MealPlan: local has ${rows.length} rows`);
        if (!dry && rows.length) await tx.mealPlan.createMany({ data: rows });
      } catch (e) {
        if (String(e.message || e).includes('Invalid prisma.mealPlan')) {
          console.log('  (skipped: MealPlan model not found in schema)');
        } else throw e;
      }
      // MealConsumption (optional)
      try {
        const rows = await local.mealConsumption.findMany();
        console.log(`• MealConsumption: local has ${rows.length} rows`);
        if (!dry && rows.length) await tx.mealConsumption.createMany({ data: rows });
      } catch (e) {
        if (String(e.message || e).includes('Invalid prisma.mealConsumption')) {
          console.log('  (skipped: MealConsumption model not found in schema)');
        } else throw e;
      }
    });

    console.log('  ↳ replace completed.');
  } else {
    console.error(`❌ Unknown mode "${MODE}". Use --mode insert|upsert|replace`);
    process.exit(1);
  }

  console.log('\n✅ Done.');
}

run()
  .catch((e) => { console.error('❌ Fatal:', e); process.exit(1); })
  .finally(async () => {
    await local.$disconnect();
    await render.$disconnect();
  });
