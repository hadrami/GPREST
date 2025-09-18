// scripts/seed-stud-isme.mjs
//
// Usage:
//   node scripts/seed-stud-isme.mjs ./liste_Etudiants_ISME.xlsx cmfe3psxq0002cpr0z8ki8frr isme
//
// Args:
//   [2] xlsxPath         - Excel file path
//   [3] establishmentId  - ISME establishment id
//   [4] acronym          - email suffix (default: "isme") -> email = `${matricule}@${acronym}`
//
// Requirements:
//   - DATABASE_URL in your .env
//   - npm i @prisma/client xlsx
//   - npx prisma generate

import dotenv from "dotenv";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs"; // ESM build
XLSX.set_fs(fs); // enable readFile/writeFile in Node

import { PrismaClient } from "@prisma/client";
dotenv.config();
const prisma = new PrismaClient();

const [,, XLSX_PATH_IN, ESTABLISHMENT_ID_IN, ACRONYM_IN] = process.argv;
const XLSX_PATH = XLSX_PATH_IN || "./liste_Etudiants_ISME.xlsx";
const EST_ID    = ESTABLISHMENT_ID_IN || "cmfe3psxq0002cpr0z8ki8frr"; // ISME default
const ACRONYM   = (ACRONYM_IN || "isme").toLowerCase();

// ---------- helpers ----------
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const toStringKeep = (v) => (v == null ? "" : String(v).trim());
const deaccentLower = (s) =>
  clean(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const titleCase = (s) =>
  clean(s).toLowerCase().replace(/\b\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));

function mergeNameParts(prenom, nom) {
  const P = titleCase(prenom);
  const N = titleCase(nom);
  return clean([P, N].filter(Boolean).join(" "));
}

function yearFromSheetName(name) {
  const n = String(name || "").toUpperCase();
  // tolerant to "L1", "L1 2025", "1ERE", "PREMIERE", etc.
  if (/\bL\s*1\b|1ERE|PREMIERE/.test(n)) return 1;
  if (/\bL\s*2\b|2EME|DEUXIEME/.test(n)) return 2;
  if (/\bL\s*3\b|3EME|TROISIEME/.test(n)) return 3;
  return null;
}

function pickIndex(headers, ...candidates) {
  const H = headers.map(deaccentLower);
  const C = candidates.map(deaccentLower);
  for (const c of C) {
    const i = H.findIndex((h) => h === c || h.includes(c));
    if (i !== -1) return i;
  }
  return -1;
}

function findHeaderRow(rows2D) {
  // pick the first row that looks like a header (contains "matricule" or similar)
  for (let i = 0; i < rows2D.length; i++) {
    const r = rows2D[i] || [];
    const hasMat = r.some((c) => deaccentLower(c).includes("matricule") || deaccentLower(c).includes("mat"));
    if (hasMat) return i;
  }
  return 0; // fallback
}

// ---------- import logic ----------
async function importSheet(ws, sheetName) {
  const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows2D.length) {
    return { created: 0, updated: 0, skipped: 0, problems: [`${sheetName}: feuille vide`] };
  }

  const headerIdx = findHeaderRow(rows2D);
  const headers   = (rows2D[headerIdx] || []).map(String);

  const iMat      = pickIndex(headers, "matricule", "mat");
  // allow either one-column full name OR (nom + prenom)
  const iNameFull = pickIndex(headers, "nom et prenom", "nom/prenom", "nom complet", "name", "full name");
  const iNom      = pickIndex(headers, "nom", "last name", "lastname", "family name");
  const iPrenom   = pickIndex(headers, "prenom", "prénom", "first name", "firstname", "given name");

  if (iMat === -1) {
    return { created: 0, updated: 0, skipped: rows2D.length, problems: [`${sheetName}: colonne 'matricule' introuvable`] };
  }
  if (iNameFull === -1 && (iNom === -1 || iPrenom === -1)) {
    return { created: 0, updated: 0, skipped: rows2D.length, problems: [`${sheetName}: colonne 'nom et prénom' ou ('nom','prenom') introuvables`] };
  }

  const studentYear = yearFromSheetName(sheetName);
  if (!studentYear) {
    return { created: 0, updated: 0, skipped: rows2D.length, problems: [`${sheetName}: année non détectée (attendu L1/L2/L3)`] };
  }

  let created = 0, updated = 0, skipped = 0;
  const problems = [];

  for (let r = headerIdx + 1; r < rows2D.length; r++) {
    const row = rows2D[r] || [];
    const matricule = toStringKeep(row[iMat]);
    if (!matricule) { skipped++; continue; }

    let name = "";
    if (iNameFull !== -1) {
      name = clean(row[iNameFull] || "");
      if (!name) {
        // fallback if empty full-name cell but we have parts
        const nom = clean(row[iNom] || "");
        const prenom = clean(row[iPrenom] || "");
        name = mergeNameParts(prenom, nom) || matricule;
      } else {
        // normalize casing
        name = name.split(/\s+/).map(titleCase).join(" ");
      }
    } else {
      const nom = clean(row[iNom] || "");
      const prenom = clean(row[iPrenom] || "");
      name = mergeNameParts(prenom, nom) || matricule;
    }

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
            studentYear, // <-- your Prisma field for the student's year
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
            studentYear, // <-- if your field is `year`, rename this key to `year`
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

  console.log(`📄 Lecture: ${path.basename(XLSX_PATH)} (ISME)`);
  const wb = XLSX.readFile(XLSX_PATH);

  // Only sheets that look like L1/L2/L3
  const sheets = wb.SheetNames.filter((n) => /\bL\s*([123])\b|1ere|2eme|3eme|premiere|deuxieme|troisieme/i.test(String(n)));
  if (!sheets.length) {
    console.log(`⚠️ Aucune feuille L1/L2/L3 trouvée. Feuilles: ${wb.SheetNames.join(", ")}`);
  }

  let totalC = 0, totalU = 0, totalS = 0, totalP = 0;
  for (const s of sheets) {
    const yr = yearFromSheetName(s);
    console.log(`→ Import ${s} (year ${yr ?? "?"})`);
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
