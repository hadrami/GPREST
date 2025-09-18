// Usage:
// node seed-stud-isms.mjs ./List_ISMS_2025.xlsx cmfe3psxl0001cpr0fi2fu5rt isms
//
// Args: [2]xlsxPath [3]establishmentId [4]acronym
// Email will be `${matricule}@${acronym}` (default "isms")

import dotenv from "dotenv";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

// ---- XLSX import (ESM build) ----
import * as XLSX from "xlsx/xlsx.mjs";
XLSX.set_fs(fs); // important for readFile/writeFile in Node

import { PrismaClient } from "@prisma/client";
dotenv.config(); // uses DATABASE_URL

const prisma = new PrismaClient();

const [,, XLSX_PATH = "./List_ISMS_2025.xlsx",
       EST_ID = "cmfe3psxl0001cpr0fi2fu5rt",
       ACRONYM_IN = "isms"] = process.argv;
const ACRONYM = String(ACRONYM_IN).toLowerCase();

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const deaccentLower = (s) =>
  clean(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const toStringKeep = (v) => (v == null ? "" : String(v).trim());

const titleCase = (s) =>
  clean(s).toLowerCase().replace(/\b\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));

const mergeName = (prenom, nom) => {
  const P = titleCase(prenom);
  const N = titleCase(nom);
  return clean([P, N].filter(Boolean).join(" "));
};

const yearFromSheetName = (n) => {
  const u = String(n || "").toUpperCase();
  if (/\bL2\b/.test(u)) return 2;
  if (/\bL3\b/.test(u)) return 3;
  return null;
};

function pickIndex(headers, ...cands) {
  const H = headers.map(deaccentLower);
  const C = cands.map(deaccentLower);
  for (const c of C) {
    const i = H.findIndex((h) => h === c || h.includes(c));
    if (i !== -1) return i;
  }
  return -1;
}

async function importSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) {
    return { created: 0, updated: 0, skipped: 0, problems: [`${sheetName}: feuille vide`] };
  }

  const headers = rows[0].map(String);
  const iMat    = pickIndex(headers, "matricule", "mat");
  const iNom    = pickIndex(headers, "nom", "last name", "lastname", "name");
  const iPrenom = pickIndex(headers, "prenom", "prénom", "first name", "firstname");

  if (iMat === -1)   return { created:0, updated:0, skipped:rows.length, problems:[`${sheetName}: colonne 'matricule' introuvable`] };
  if (iNom === -1 || iPrenom === -1)
    return { created:0, updated:0, skipped:rows.length, problems:[`${sheetName}: colonnes 'nom' et/ou 'prenom' introuvables`] };

  const studentYear = yearFromSheetName(sheetName);
  if (!studentYear) {
    return { created:0, updated:0, skipped:rows.length, problems:[`${sheetName}: année non détectée (attendu L2/L3)`] };
  }

  let created = 0, updated = 0, skipped = 0;
  const problems = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const matricule = toStringKeep(row[iMat]);
    const nom       = clean(row[iNom]);
    const prenom    = clean(row[iPrenom]);

    if (!matricule) { skipped++; continue; }

    const name  = mergeName(prenom, nom) || matricule;
    const email = `${matricule}@${ACRONYM}`;

    try {
      const existing = await prisma.person.findUnique({
        where: { matricule },
        select: { id: true },
      });

      if (existing) {
        await prisma.person.update({
          where: { matricule },
          data: {
            name,
            email,
            establishmentId: EST_ID,
            type: "STUDENT",
            studentYear, // <-- adjust if your column is named differently
          },
        });
        updated++;
      } else {
        await prisma.person.create({
          data: {
            matricule,
            name,
            email,
            establishmentId: EST_ID,
            type: "STUDENT",
            studentYear, // <-- adjust if needed
          },
        });
        created++;
      }
    } catch (e) {
      problems.push(`Ligne ${r + 1}: ${e?.message || e}`);
    }
  }

  return { created, updated, skipped, problems };
}

async function main() {
  try { await fsp.access(XLSX_PATH); }
  catch { console.error(`❌ Fichier introuvable: ${XLSX_PATH}`); process.exit(1); }

  console.log(`📄 Lecture: ${path.basename(XLSX_PATH)} (ISMS)`);
  const wb = XLSX.readFile(XLSX_PATH);

  // Only L2 and L3 for ISMS
  const sheets = wb.SheetNames.filter((n) => /^L[23]$/i.test(n));
  if (!sheets.length) {
    console.log(`⚠️ Aucune feuille L2/L3 trouvée. Feuilles: ${wb.SheetNames.join(", ")}`);
  }

  let totalC = 0, totalU = 0, totalS = 0, totalP = 0;

  for (const s of sheets) {
    console.log(`→ Import ${s} (year ${yearFromSheetName(s)})`);
    const res = await importSheet(wb.Sheets[s], s);
    console.log(`   créés=${res.created} maj=${res.updated} ignorés=${res.skipped} problèmes=${res.problems.length}`);
    res.problems.slice(0, 10).forEach((p) => console.log("   !", p));
    totalC += res.created; totalU += res.updated; totalS += res.skipped; totalP += res.problems.length;
  }

  console.log("✅ Terminé.");
  console.log(`Totaux: créés=${totalC}, maj=${totalU}, ignorés=${totalS}, problèmes=${totalP}`);
}

main()
  .catch((e) => { console.error("❌ Erreur import:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
