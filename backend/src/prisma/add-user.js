// add-user.js (ESM)
// Usage (student mode):
//   node add-user.js --student 231245 --acronym isme --name 231245 --role STUDENT
// Usage (manual mode):
//   node add-user.js --username tourad --email tourad@gprest.local --name tourad --role ADMIN --password password123
//
// Env:
//   DATABASE_URL=postgresql://...   (use ?sslmode=require for Render External)

import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---- Map your User columns here (adjust if your names differ) ----
const USERNAME_FIELD = 'username';
const EMAIL_FIELD    = 'email';
const PASSWORD_FIELD = 'passwordHash';      // your schema requires passwordHash
const NAME_FIELD     = 'name';
const ROLE_FIELD     = 'role';
const MUST_CHANGE_FIELD = 'mustChangePassword'; // <- always set true on create
// ------------------------------------------------------------------

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Modes/args
const matricule = arg('--student');
const acronym   = (arg('--acronym') || 'isme').toLowerCase();

let username = arg('--username');
let email    = arg('--email');
let nameArg  = arg('--name');   // REQUIRED and must equal username (or matricule)
let role     = (arg('--role') || 'STUDENT').toUpperCase();
let password = arg('--password');

if (!nameArg) {
  console.error('❌ --name is required and must equal the username (or matricule in student mode).');
  process.exit(1);
}

if (matricule) {
  // Student mode
  username = username || matricule;
  email    = email || `${matricule}@${acronym}`;
  password = password || matricule;

  if (nameArg !== matricule) {
    console.error(`❌ In student mode, --name must equal the matricule. Got --name='${nameArg}', matricule='${matricule}'.`);
    process.exit(1);
  }
} else {
  // Manual mode
  if (!username || !email) {
    console.error('❌ Manual mode needs --username <u> and --email <e> (or use --student <matricule>).');
    process.exit(1);
  }
  password = password || username;

  if (nameArg !== username) {
    console.error(`❌ In manual mode, --name must equal --username. Got --name='${nameArg}', --username='${username}'.`);
    process.exit(1);
  }
}

async function main() {
  // Uniqueness check by username OR email
  const existing = await prisma.user.findFirst({
    where: { OR: [ { [USERNAME_FIELD]: username }, { [EMAIL_FIELD]: email } ] },
    select: { id: true },
  });

  if (existing) {
    console.log(`ℹ️ User already exists. Nothing to do.`);
    return;
  }

    const hashed = await argon2.hash(password);
    
  const data = {
    [USERNAME_FIELD]: username,
    [EMAIL_FIELD]: email,
    [PASSWORD_FIELD]: hashed,          // write to passwordHash
    [NAME_FIELD]: nameArg,             // enforce name === username/matricule
    [ROLE_FIELD]: role,
    [MUST_CHANGE_FIELD]: true,         // ALWAYS true on create
  };

  const created = await prisma.user.create({ data });
  console.log('✅ User created:', {
    id: created.id,
    username: created[USERNAME_FIELD],
    name: created[NAME_FIELD],
    email: created[EMAIL_FIELD],
    role: created[ROLE_FIELD],
    mustChangePassword: created[MUST_CHANGE_FIELD],
  });
}

await main().catch(e => { console.error('❌ Error:', e.message || e); process.exit(1); });
await prisma.$disconnect();
