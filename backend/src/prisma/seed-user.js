// backend/scripts/seed-user.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../utils/passwords.js"; // adjust if your path differs

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || "admin";
  const email = process.argv[3] || "admin@gprest.local";
  const password = process.argv[4] || "admin1234";

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      email,
      name: "Admin",
      role: Role.SCAN_AGENT,
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log("✅ Seeded user:", { id: user.id, username: user.username, email: user.email });
}

main()
  .catch((e) => { console.error(e); process.exit(2); })
  .finally(() => prisma.$disconnect());
