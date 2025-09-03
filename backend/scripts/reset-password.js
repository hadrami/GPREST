// backend/scripts/reset-password.js  (ESM)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const [,, email, newPassword] = process.argv;
  if (!email || !newPassword) {
    console.error('Usage:\n  node scripts/reset-password.js <email> <newPassword>');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name: 'Admin',
      email,
      passwordHash,
      role: 'ADMIN',
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
    update: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
  });

  console.log(`✅ Password reset for ${user.email}. mustChangePassword=true`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
