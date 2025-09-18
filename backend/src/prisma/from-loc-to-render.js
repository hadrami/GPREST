

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const LOCAL_URL  = process.env.LOCAL_URL;
const RENDER_URL = process.env.RENDER_URL;

if (!LOCAL_URL || !RENDER_URL) {
  console.error('❌ Please set LOCAL_URL and RENDER_URL env vars.');
  process.exit(1);
}

// Two Prisma clients in one process (override datasource urls)
const local  = new PrismaClient({ datasources: { db: { url: LOCAL_URL  } } });
const render = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

const CHUNK = 1000; // adjust if you ever move very large datasets

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

async function copyTableAll(modelName, readFn, writeFn, keyDesc) {
  const items = await readFn();
  console.log(`• ${modelName}: local has ${items.length} rows`);

  if (items.length === 0) return { created: 0 };

  let created = 0;
  for (const batch of chunk(items)) {
    // createMany with skipDuplicates will insert only rows that don’t violate PK/unique constraints
    const res = await writeFn(batch);
    created += res.count ?? 0;
  }
  console.log(`  ↳ inserted (new) = ${created} (skipDuplicates by ${keyDesc})`);
  return { created };
}

async function run() {
  await whereAmI(local,  'LOCAL');
  await whereAmI(render, 'RENDER');

  console.log('\n== Establishment ==');
  await copyTableAll(
    'Establishment',
    () => local.establishment.findMany(),
    (rows) => render.establishment.createMany({ data: rows, skipDuplicates: true }),
    'id'
  );

  console.log('\n== Person ==');
  await copyTableAll(
    'Person',
    () => local.person.findMany(),
    (rows) => render.person.createMany({ data: rows, skipDuplicates: true }),
    'id'
  );

  console.log('\n== User ==');
  // If you prefer to only push STUDENT users, add: where: { role: 'STUDENT' }
  await copyTableAll(
    'User',
    () => local.user.findMany(),
    (rows) => render.user.createMany({ data: rows, skipDuplicates: true }),
    'id/username/email'
  );

  console.log('\n== MealPlan ==');
  // If table doesn’t exist in your schema, Prisma will throw — just comment this block out
  try {
    await copyTableAll(
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

  console.log('\n== MealConsumption ==');
  try {
    await copyTableAll(
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

  console.log('\n✅ Done.');
}

run()
  .catch((e) => { console.error('❌ Fatal:', e); process.exit(1); })
  .finally(async () => {
    await local.$disconnect();
    await render.$disconnect();
  });
