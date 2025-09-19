// scripts/fixEspMatricules.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 🔧 EDIT THESE 3 CONSTANTS
 */
const ESTABLISHMENT_ID = ''; // <-- ✏️ change to your target establishment
const PERSON_TYPE      = 'STUDENT';                    // <-- ✏️ must match your PersonType enum literal
const INSERT_DIGIT     = '2';                          // <-- ✏️ the digit to insert after the first 2 chars

async function main() {
  // 1) Backup the affected rows (only 5-digit matricules)
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS person_matricule_backup AS
    SELECT *
    FROM "Person"
    WHERE "establishmentId" = ${ESTABLISHMENT_ID}
      AND "type" = CAST(${PERSON_TYPE} AS "PersonType")
      AND "matricule" ~ '^[0-9]{5}$';
  `;

  // 2) Update:
  // new_matricule = first 2 chars + '2' + last 3 chars
  // Guard against collisions with other people’s matricules.
  await prisma.$executeRaw`
    UPDATE "Person" p
    SET "matricule" =
      substring(p."matricule" FROM 1 FOR 2) || ${INSERT_DIGIT} || substring(p."matricule" FROM 3 FOR 3)
    WHERE p."establishmentId" = ${ESTABLISHMENT_ID}
      AND p."type" = CAST(${PERSON_TYPE} AS "PersonType")
      AND p."matricule" ~ '^[0-9]{5}$'
      AND NOT EXISTS (
        SELECT 1
        FROM "Person" px
        WHERE px."matricule" =
          substring(p."matricule" FROM 1 FOR 2) || ${INSERT_DIGIT} || substring(p."matricule" FROM 3 FOR 3)
          AND px."id" <> p."id"
      );
  `;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
