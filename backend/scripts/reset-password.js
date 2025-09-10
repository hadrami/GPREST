// backend/scripts/reset-password.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/passwords.js"; // adjust if your path differs

// Load backend/.env no matter where this script is run from
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

async function findUser(identifier) {
  // Try username exact
  let user = await prisma.user.findUnique({ where: { username: identifier } }).catch(() => null);
  if (user) return user;

  // If it looks like an email, try email exact
  if (identifier.includes("@")) {
    user = await prisma.user.findUnique({ where: { email: identifier } }).catch(() => null);
    if (user) return user;
  }

  // Case-insensitive fallback (works on PG)
  user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } },
      ],
    },
  }).catch(() => null);

  return user;
}

async function main() {
  const identifier = process.argv[2]; // username OR email
  const newPass = process.argv[3];

  if (!identifier || !newPass) {
    console.log("Usage: node scripts/reset-password.js <username|email> <newPassword>");
    process.exit(1);
  }

  const user = await findUser(identifier);

  if (!user) {
    console.error("User not found");
    process.exit(2);
  }

  const passwordHash = await hashPassword(newPass);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
  });

  console.log("✅ Password updated for:", {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  });
}

main()
  .catch((e) => { console.error(e); process.exit(2); })
  .finally(() => prisma.$disconnect());
