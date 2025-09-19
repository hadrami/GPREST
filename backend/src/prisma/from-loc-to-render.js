import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * ENV:
 *  LOCAL_URL  – connection string for your local DB
 *  RENDER_URL – connection string for your Render DB (likely needs ?sslmode=require)
 */
const LOCAL_URL  = process.env.LOCAL_URL;
const RENDER_URL = process.env.RENDER_URL;

if (!LOCAL_URL || !RENDER_URL) {
  console.error('❌ Please set LOCAL_URL and RENDER_URL env vars.');
  process.exit(1);
}

// ---- CLI FLAGS --------------------------------------------------------------
// --dry-run             : show planned actions only
// --prefer-local        : ignore updatedAt; always push Local fields to Render
// --prefer-remote       : opposite; only create missing rows, never update
// --delete-extraneous   : delete rows that are in Render but not Local
// --tables              : comma list subset, e.g. Establishment,Person,User
// --chunk               : batch size for per-row upserts (default 500)
// -----------------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) continue;
  const k = process.argv[i].slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith('--')) { args[k] = v; i++; } else { args[k] = true; }
}

const DRY            = !!args['dry-run'];
const PREFER_LOCAL   = !!args['prefer-local'];
const PREFER_REMOTE  = !!args['prefer-remote'];
const DELETE_EXTRA   = !!args['delete-extraneous'];
const TABLE_FILTER   = (args.tables || '').split(',').map(s => s.trim()).filter(Boolean);
const CHUNK          = Number(args.chunk || 500);

if (PREFER_LOCAL && PREFER_REMOTE) {
  console.error('❌ Use at most one of --prefer-local or --prefer-remote.');
  process.exit(1);
}

const local  = new PrismaClient({ datasources: { db: { url: LOCAL_URL  } } });
const render = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });

// ---- helpers ----------------------------------------------------------------

async function whereAmI(client, label) {
  const [row] = await client.$queryRaw`
    SELECT current_database() AS db,
           current_user AS usr,
           inet_server_addr()::text AS host
  `;
  console.log(`→ ${label}: db=${row.db} host=${row.host} user=${row.usr}`);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** Remove read-only/system fields when comparing/pushing */
function stripSystemFields(row, fields = ['createdAt', 'updatedAt']) {
  const copy = { ...row };
  for (const f of fields) delete copy[f];
  return copy;
}

/** Deep-ish compare by JSON after stripping system fields */
function isDifferent(localRow, remoteRow, opts = {}) {
  const l = stripSystemFields(localRow, opts.strip || undefined);
  const r = stripSystemFields(remoteRow, opts.strip || undefined);
  return JSON.stringify(l) !== JSON.stringify(r);
}

/** Chunk an array */
function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Decide if we should update based on timestamps & flags */
function shouldUpdate(localRow, remoteRow) {
  if (PREFER_REMOTE) return false;
  if (PREFER_LOCAL) return true;
  // Prefer newer updatedAt if present on both sides
  const l = localRow.updatedAt ? new Date(localRow.updatedAt).getTime() : 0;
  const r = remoteRow.updatedAt ? new Date(remoteRow.updatedAt).getTime() : 0;
  return l > r;
}

// ---- per-table merge policies -----------------------------------------------
// Add/adjust models here to define which columns to compare/preserve.
// For User we *intentionally* avoid clobbering password-related fields.

const MODELS = [
  {
    name: 'Establishment',
    key: 'id',
    // Compare all fields except timestamps:
    compare: (L, R) => isDifferent(L, R),
    // What to send to upsert/update:
    toData: (row) => stripSystemFields(row),
    // Allow deletions?
    allowDelete: true,
  },
  {
    name: 'Person',
    key: 'id',
    compare: (L, R) => isDifferent(L, R),
    toData: (row) => stripSystemFields(row),
    allowDelete: true,
  },
  {
    name: 'User',
    key: 'id',
    compare: (L, R) => {
      // Don’t consider password/mustChangePassword flips unless prefer-local
      // Compare a reduced view to avoid clobbering auth state
      const keys = Object.keys(L).filter(k => !['createdAt','updatedAt','password','passwordHash','mustChangePassword'].includes(k));
      const l = pick(L, keys);
      const r = pick(R, keys);
      return JSON.stringify(l) !== JSON.stringify(r);
    },
    toData: (row) => {
      const data = stripSystemFields(row);
      // Preserve Render’s password/mustChangePassword unless prefer-local explicitly
      if (!PREFER_LOCAL) {
        delete data.password;
        delete data.passwordHash;
        delete data.mustChangePassword;
      }
      return data;
    },
    allowDelete: false, // usually we don't delete users automatically
  },
  // Optional models (wrap in try/catch during use if your schema doesn’t have them):
  {
    name: 'MealPlan',
    key: 'id',
    compare: (L, R) => isDifferent(L, R),
    toData: (row) => stripSystemFields(row),
    allowDelete: true,
    optional: true,
  },
  {
    name: 'MealConsumption',
    key: 'id',
    compare: (L, R) => isDifferent(L, R),
    toData: (row) => stripSystemFields(row),
    allowDelete: true,
    optional: true,
  },
];

// ---- core sync ---------------------------------------------------------------

async function loadAll(client, modelName) {
  // Load all rows from a model on a client
  return await client[modelName[0].toLowerCase() + modelName.slice(1)].findMany();
}

async function upsertOne(client, modelName, where, data) {
  const prismaModel = client[modelName[0].toLowerCase() + modelName.slice(1)];
  return prismaModel.upsert({ where, update: data, create: { ...data, ...where } });
}

async function updateOne(client, modelName, where, data) {
  const prismaModel = client[modelName[0].toLowerCase() + modelName.slice(1)];
  return prismaModel.update({ where, data });
}

async function createMany(client, modelName, rows) {
  const prismaModel = client[modelName[0].toLowerCase() + modelName.slice(1)];
  return prismaModel.createMany({ data: rows, skipDuplicates: true });
}

async function deleteManyByIds(client, modelName, ids, key = 'id') {
  const prismaModel = client[modelName[0].toLowerCase() + modelName.slice(1)];
  return prismaModel.deleteMany({ where: { [key]: { in: ids } } });
}

async function smartSyncModel(model) {
  const { name, key, compare, toData, allowDelete, optional } = model;
  if (TABLE_FILTER.length && !TABLE_FILTER.includes(name)) return;

  console.log(`\n=== ${name} ===`);
  let L = [], R = [];
  try {
    [L, R] = await Promise.all([loadAll(local, name), loadAll(render, name)]);
  } catch (e) {
    if (optional && String(e.message || e).includes('Invalid prisma')) {
      console.log(`  (skipped: ${name} model not found in schema)`);
      return;
    }
    throw e;
  }

  console.log(`Local: ${L.length} • Render: ${R.length}`);

  // Index by key
  const mapL = new Map(L.map(row => [row[key], row]));
  const mapR = new Map(R.map(row => [row[key], row]));

  const toCreate = [];
  const toUpdate = []; // [where, data]

  for (const [id, lrow] of mapL.entries()) {
    const rrow = mapR.get(id);
    if (!rrow) {
      // create
      toCreate.push(toData(lrow));
    } else {
      // maybe update
      if (!compare(lrow, rrow)) continue;           // same (after policy)
      if (!shouldUpdate(lrow, rrow)) continue;      // respect updatedAt unless prefer-local
      toUpdate.push([{ [key]: id }, toData(lrow)]);
    }
  }

  const extraIds = [];
  if (DELETE_EXTRA && allowDelete) {
    for (const id of mapR.keys()) if (!mapL.has(id)) extraIds.push(id);
  }

  console.log(`Plan: +${toCreate.length} create, ~${toUpdate.length} update${extraIds.length ? `, -${extraIds.length} delete` : ''}`);
  if (DRY) {
    // Print a small sample
    console.log('  (dry-run) sample create:', toCreate.slice(0, 2));
    console.log('  (dry-run) sample update:', toUpdate.slice(0, 2).map(([w,d]) => ({ where:w, data:d })));
    if (extraIds.length) console.log('  (dry-run) sample delete ids:', extraIds.slice(0, 5));
    return;
  }

  // Apply creates in batches
  for (const batch of chunk(toCreate)) {
    await createMany(render, name, batch);
  }

  // Apply updates in batches (parallel per batch)
  for (const batch of chunk(toUpdate)) {
    await Promise.all(batch.map(([where, data]) => updateOne(render, name, where, data)));
  }

  // Deletes last (be careful with FK order; we only allow table delete if policy allows)
  if (extraIds.length) {
    await deleteManyByIds(render, name, extraIds, key);
  }

  console.log('✔ done');
}

async function run() {
  console.log(`=== Smart Sync LOCAL → RENDER ${DRY ? '(dry-run)' : ''} ===`);
  await whereAmI(local,  'LOCAL');
  await whereAmI(render, 'RENDER');

  // IMPORTANT: parent-first order for *creates/updates*,
  // and reverse order would be needed for cross-table deletes if you turn them on broadly.
  const order = [
    'Establishment',
    'Person',
    'User',
    'MealPlan',
    'MealConsumption',
  ];

  for (const name of order) {
    const model = MODELS.find(m => m.name === name);
    if (!model) continue;
    await smartSyncModel(model);
  }

  console.log('\n✅ Smart-sync finished.');
}

run()
  .catch((e) => { console.error('❌ Fatal:', e); process.exit(1); })
  .finally(async () => {
    await local.$disconnect();
    await render.$disconnect();
  });
