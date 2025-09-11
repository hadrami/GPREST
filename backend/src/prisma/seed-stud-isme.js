// Usage:
//   node src/prisma/seed-stud-isme.js /path/to/liste_Elèves_ISME_SP.xlsx [establishmentId] [emailDomain]
//
// Examples:
//   node src/prisma/seed-stud-isme.js ./liste_Elèves_ISME_SP.xlsx
//   node src/prisma/seed-stud-isme.js ./liste_Elèves_ISME_SP.xlsx cmXXXXXXXX isme.mr
//
// Notes:
// - Scans **all sheets** (each year) in the workbook.
// - Detects header row by looking for a cell "matricule" (robust to accents/case) in the first 20 rows.
// - Expects ONE full name column like "Nom et Prénom" (many variants handled).
// - Upserts by unique `matricule` into `person` with type "STUDENT".
// - Email generated as `${matricule}@<emailDomain>` (default "isme.mr").
// - If no establishmentId is given, tries to find an establishment whose name contains "ISME" (case-insensitive).

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const prisma = new PrismaClient();

// ---------- helpers ----------
function stripAccents(s) {
  return s?.normalize("NFD").replace(/\p{Diacritic}+/gu, "") || "";
}
function normCell(v) {
  // normalize: lowercase, strip accents, remove spaces & non-alnum
  return stripAccents(String(v ?? ""))
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function safeString(v) {
  return v == null ? "" : String(v).trim();
}
function titleCase(s) {
  return safeString(s)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}
function detectHeaderRow(rows2D, lookFor = "matricule", maxScan = 20) {
  const target = normCell(lookFor);
  const limit = Math.min(rows2D.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows2D[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normCell(row[c]) === target) return r;
    }
  }
  return -1;
}
function findColumnIndex(headerRow, ...candidates) {
  const headerNorm = headerRow.map(normCell);
  for (const candidate of candidates) {
    const idx = headerNorm.indexOf(normCell(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

async function resolveEstablishmentId(maybeId) {
  if (maybeId) return maybeId;
  const est = await prisma.establishment.findFirst({
    where: { name: { contains: "ISME", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!est?.id) {
    throw new Error(
      "Aucun établissement 'ISME' détecté. Passez l'ID en 2ᵉ argument."
    );
  }
  console.log(`🏫 Établissement: ${est.name} (${est.id})`);
  return est.id;
}

// ---------- main ----------
async function main() {
  const xlsxPathArg = process.argv[2];
  const establishmentId = await resolveEstablishmentId(process.argv[3]).catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
  const emailDomain = (process.argv[4] || "isme.mr").replace(/^@/, "");

  if (!xlsxPathArg) {
    console.error("Usage: node src/prisma/seed-stud-isme.js <file.xlsx> [establishmentId] [emailDomain]");
    process.exit(1);
  }

  const xlsxPath = path.isAbsolute(xlsxPathArg)
    ? xlsxPathArg
    : path.resolve(process.cwd(), xlsxPathArg);

  console.log("🔎 Lecture du classeur:", xlsxPath);
  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });

  let totalCreated = 0, totalUpdated = 0, totalProblems = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows2D.length) {
      console.log(`⚠️ Feuille vide: ${sheetName}`);
      continue;
    }

    // Locate header row
    const headerRowIndex = detectHeaderRow(rows2D, "matricule", 20);
    if (headerRowIndex === -1) {
      console.log(`⚠️ Pas de colonne 'matricule' détectée dans "${sheetName}" → feuille ignorée.`);
      continue;
    }

    const header = rows2D[headerRowIndex];
    const dataRows = rows2D.slice(headerRowIndex + 1);

    // Columns:
    // matricule (try to find, fallback to 3rd col index=2 like your earlier sheets)
    let colMat = findColumnIndex(
      header,
      "matricule", "n° matricule", "n matricule", "nmatricule", "n°matricule", "mat"
    );
    if (colMat === -1) colMat = 2; // fallback

    // FULL NAME column (single)
    // handle typical variants in French and normalized compact forms
    const fullNameCandidates = [
      "nom et prénom",
      "nom et prenom",
      "nom&prénom",
      "nom&prenom",
      "nom_prénom",
      "nom_prenom",
      "nomprenom",
      "nom complet",
      "nomcomplet",
      "fullname",
      "name",
    ];
    let colFull = findColumnIndex(header, ...fullNameCandidates);
    // As a last resort, try to guess a column named something like 'nom'
    if (colFull === -1) {
      colFull = findColumnIndex(header, "nom");
    }

    if (colFull === -1) {
      console.log(
        `⚠️ Aucune colonne "Nom et Prénom" (ou équivalent) détectée dans "${sheetName}" → feuille ignorée.`
      );
      continue;
    }

    let created = 0, updated = 0;
    const problems = [];

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const rowIndex1 = headerRowIndex + 2 + i;

      const matricule = safeString(r[colMat]);
      if (!matricule) {
        problems.push({ row: rowIndex1, reason: "Matricule manquant" });
        continue;
      }

      const fullNameRaw = safeString(r[colFull]);
      if (!fullNameRaw) {
        problems.push({ row: rowIndex1, matricule, reason: "Nom et Prénom manquant" });
        continue;
      }

      // Keep original casing but trim; optional titleCase if you prefer:
      const name = fullNameRaw.trim(); // or: titleCase(fullNameRaw)
      const email = `${matricule}@${emailDomain}`;

      try {
        const existing = await prisma.person.findUnique({
          where: { matricule },
          select: { id: true },
        });

        if (!existing) {
          await prisma.person.create({
            data: {
              matricule,
              name,
              email,
              establishmentId,
              type: "STUDENT",
            },
          });
          created++;
        } else {
          await prisma.person.update({
            where: { matricule },
            data: {
              name,
              email,
              establishmentId,
              type: "STUDENT",
            },
          });
          updated++;
        }
      } catch (e) {
        problems.push({ row: rowIndex1, matricule, reason: e.message });
      }
    }

    console.log(
      `📄 Feuille: ${sheetName} → Créés: ${created} — MAJ: ${updated} — Problèmes: ${problems.length}`
    );
    if (problems.length) {
      console.table(problems.slice(0, 10));
      if (problems.length > 10) console.log(`… +${problems.length - 10} autres`);
    }

    totalCreated += created;
    totalUpdated += updated;
    totalProblems += problems.length;
  }

  console.log("✅ Import ISME terminé.");
  console.log("Totaux → Créés:", totalCreated, "— Mis à jour:", totalUpdated, "— Problèmes:", totalProblems);
}

main()
  .catch((e) => { console.error("❌ Import error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
