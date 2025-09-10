// backend/src/scripts/seed-establishments.js (ESM)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charge backend/.env explicitement (important pour les scripts Node)
const envPath = path.join(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn("⚠️  .env introuvable à", envPath, "— Prisma utilisera les variables d'env du shell.");
}

const prisma = new PrismaClient();

// Liste à insérer (idempotent via upsert sur name)
const ESTABLISHMENTS = [
  { name: "Institut Préparatoire aux Grandes Ecoles d'Ingénieurs (IPGEI)" },
  { name: "Institut Supérieur des Métiers de la Mine de Zouerate (IS2M)" },
  { name: "Institut Supérieur des Métiers de l'Energie (ISME)" },
  { name: "Ecole Supérieure Polytechnique (ESP)" },
];

async function main() {
  console.log("Seeding establishments…");
  for (const e of ESTABLISHMENTS) {
    await prisma.establishment.upsert({
      where: { name: e.name },   // nécessite name @unique dans le schema
      update: {},                // rien à mettre à jour (on garde juste le nom)
      create: { name: e.name },
    });
  }

  const all = await prisma.establishment.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log("\n✅ Établissements présents en base :");
  for (const e of all) console.log(`- ${e.name}  ->  ${e.id}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
