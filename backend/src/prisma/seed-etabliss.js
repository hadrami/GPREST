// backend/src/scripts/seed-establishments.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Charge backend/.env (DATABASE_URL)
dotenv.config({ path: path.join(__dirname, "../../.env") });

const prisma = new PrismaClient();

// Vous avez demandé à garder l’acronyme dans le name pour ne pas compliquer :
const ESTABS = [
  { name: "Institut Préparatoire aux Grandes Ecoles d'Ingénieurs (IPGEI)" },
  { name: "Institut Supérieur des Métiers de la Statistique (ISMS)" },
  { name: "Institut Supérieur des Métiers de l'Energie (ISME)" },
  { name: "Ecole Supérieure Polytechnique (ESP)" },
];

async function main() {
  console.log("Seeding établissements…");

  for (const e of ESTABS) {
    // name est UNIQUE dans le schéma → upsert garantit l’idempotence
    await prisma.establishment.upsert({
      where: { name: e.name },
      update: {},
      create: { name: e.name },
    });
  }

  const list = await prisma.establishment.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  console.table(list);
  console.log(`✅ Terminé. Total: ${list.length} établissements.`);
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
