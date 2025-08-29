// backend/src/prisma/seed.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // <-- points to backend/.env

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@gprest.local';
  const password = 'Admin@123';
  const hash = await argon2.hash(password);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Admin', email, passwordHash: hash, role: 'ADMIN', mustChangePassword: true },
    select: { id: true, email: true, role: true, mustChangePassword: true }
  });
  console.log('Seeded admin:', admin);
}

main().catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
