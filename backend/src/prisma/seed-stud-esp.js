// backend/src/prisma/seed-stud-esp.js
// Usage:
//   node src/prisma/seed-stud-esp.js /path/to/esp-students.xlsx
//   node src/prisma/seed-stud-esp.js /path/to/esp-students.xlsx cmfe3psxw0003cpr035aoqete
//
// This version auto-detects the header row (looks for a cell "matricule" in the first 20 rows).

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const prisma = new PrismaClient();
const DEFAULT_EST_ID = "cmfe3psxw0003cpr035aoqete";

// ---------- helpers ----------
function stripAccents(s) {
  return s?.normalize("NFD").replace(/\p{Diacritic}+/gu, "") || "";
}
function normCell(v) {
  return stripAccents(String(v ?? ""))
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function safeString(v) {
  if (v == null) return "";
  return String(v).trim();
}
function buildName(prenom, nom) {
  const p = safeString(prenom);
  const n = safeString(nom);
  return (p && n) ? `${p} ${n}`.trim() : (p || n || "").trim();
}

function detectHeaderRow(rows2D, lookFor = "matricule", maxScan = 20) {
  const target = normCell(lookFor);
  const limit = Math.min(rows2D.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows2D[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normCell(row[c]) === target) {
        return r; // header row index
      }
    }
  }
  return -1;
}

function findColumnIndex(headerRow, ...candidates) {
  // candidates are possible header names: e.g. "prenom", "prénom", "first name"...
  const headerNorm = headerRow.map(normCell);
  for (const candidate of candidates) {
    const idx = headerNorm.indexOf(normCell(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ---------- main ----------
async function main() {
  const xlsxPathArg = process.argv[2];
  const establishmentId = process.argv[3] || DEFAULT_EST_ID;

  if (!xlsxPathArg) {
    console.error("Usage: node src/prisma/seed-stud-esp.js <file.xlsx> [establishmentId]");
    process.exit(1);
  }

  const xlsxPath = path.isAbsolute(xlsxPathArg)
    ? xlsxPathArg
    : path.resolve(process.cwd(), xlsxPathArg);

  console.log("🔎 Lecture:", xlsxPath);

  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Read as 2D array; defval to keep empty cells
  const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows2D.length) {
    console.error("❌ Feuille vide ou non lisible");
    process.exit(1);
  }

  // 1) Auto-detect header row by finding a cell "matricule"
  const headerRowIndex = detectHeaderRow(rows2D, "matricule", 20);
  if (headerRowIndex === -1) {
    console.error("❌ Impossible de trouver la ligne d'entêtes (pas de cellule 'matricule' dans les 20 premières lignes).");
    console.error("Astuce: mettez 'matricule' exact dans une cellule d'entête de colonne, ou modifiez le script pour la valeur recherchée.");
    process.exit(1);
  }

  const header = rows2D[headerRowIndex];
  const dataRows = rows2D.slice(headerRowIndex + 1);

  // 2) Map columns
  // You said: matricule is the *third* column from the left.
  // We still try to *find* it by header text, but we also accept the "3rd column" as fallback.
  let colMat = findColumnIndex(header, "matricule");
  if (colMat === -1) {
    // Fallback: third column (index 2)
    colMat = 2;
  }

  // Try to find usual headers for prenom & nom (we keep robust list)
  let colPrenom = findColumnIndex(
    header,
    "prenom", "prénom", "first name", "prenomdel'etudiant", "prenometudiant", "prenom_eleve", "givenname"
  );
  let colNom = findColumnIndex(
    header,
    "nom", "nomdefamille", "last name", "nometudiant", "nom_eleve", "surname"
  );

  // If not found, try common French headers with spaces/accents removed are already handled by normCell()
  // Still, leave -1 if not found; we'll cope.

  console.log("🧭 Header détecté à la ligne (1-based):", headerRowIndex + 1);
  console.log("   Colonnes détectées -> matricule:", colMat, "| prenom:", colPrenom, "| nom:", colNom);

  let created = 0, updated = 0;
  const problems = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowIndex1 = headerRowIndex + 2 + i; // 1-based index for display

    const matriculeRaw = r[colMat];
    const prenomRaw = colPrenom >= 0 ? r[colPrenom] : "";
    const nomRaw = colNom >= 0 ? r[colNom] : "";

    const matricule = safeString(matriculeRaw);
    if (!matricule) {
      problems.push({ row: rowIndex1, reason: "Matricule manquant" });
      continue;
    }

    const name = buildName(prenomRaw, nomRaw);
    if (!name) {
      problems.push({ row: rowIndex1, matricule, reason: "Nom/Prénom manquant(s)" });
      continue;
    }

    const email = `${matricule}@esp.mr`;

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

  console.log("✅ Import ESP terminé.");
  console.log("Créés:", created, "— Mis à jour:", updated, "— Problèmes:", problems.length);
  if (problems.length) {
    console.table(problems.slice(0, 10));
    if (problems.length > 10) {
      console.log(`… +${problems.length - 10} autres problèmes`);
    }
  }
}

main()
  .catch((e) => { console.error("❌ Import error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
