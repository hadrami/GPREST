// backend/src/routes/plans.js  (ESM)
import * as XLSX from "xlsx";

/* =========================
   Normalization / helpers
   ========================= */
function normalizeLabel(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Map French labels -> Prisma enum keys (IMPORTANT!)
const MEAL_MAP = {
  // BREAKFAST family -> PETIT_DEJEUNER
  "petit dejeuner": "PETIT_DEJEUNER",
  "petit-dejeuner": "PETIT_DEJEUNER",
  "petit_dejeuner": "PETIT_DEJEUNER",
  "pt dej": "PETIT_DEJEUNER",
  "ptdejeuner": "PETIT_DEJEUNER",
  "pt-dej": "PETIT_DEJEUNER",
  "pdj": "PETIT_DEJEUNER",
  "p dj": "PETIT_DEJEUNER",
  "p dej": "PETIT_DEJEUNER",
  breakfast: "PETIT_DEJEUNER",

  // LUNCH family -> DEJEUNER (campus sometimes writes "repas")
  "dejeuner": "DEJEUNER",
  "dej": "DEJEUNER",
  "dejeune": "DEJEUNER",
  "repas": "DEJEUNER",
  lunch: "DEJEUNER",

  // DINNER family -> DINER
  "diner": "DINER",
  "din": "DINER",
  "soir": "DINER",
  dinner: "DINER",
};
function normMealLabel(s) {
  const key = normalizeLabel(s).replace(/\s+/g, " ");
  return MEAL_MAP[key] || null;
}

function isChecked(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "number") return v === 1;
  const s = normalizeLabel(v);
  return (
    s === "1" ||
    s === "true" ||
    s === "x" ||
    s === "vrai" ||
    s === "oui" ||
    s === "yes" ||
    s === "y" ||
    s === "check" ||
    s === "ok" ||
    s === "✓"
  );
}

/* ====== DATE HELPERS (robust, no SSF) ====== */
// Excel serial (1900 system): day 1 = 1899-12-31; practical base = 1899-12-30
function excelSerialToISO(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(n) * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function validYMD(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const thirty = [4, 6, 9, 11];
  if (thirty.includes(m) && d > 30) return false;
  if (m === 2 && d > 29) return false;
  return true;
}
// supports yyyy/mm/dd, dd/mm/yyyy, yyyy/dd/mm + native Date strings
function parseDateStringToISO(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    let [_, Y, A, B] = m;
    if (Number(A) > 12 && validYMD(Y, B, A))
      return `${Y}-${String(B).padStart(2, "0")}-${String(A).padStart(2, "0")}`;
    if (Number(B) > 12 && validYMD(Y, A, B))
      return `${Y}-${String(A).padStart(2, "0")}-${String(B).padStart(2, "0")}`;
    if (validYMD(Y, A, B))
      return `${Y}-${String(A).padStart(2, "0")}-${String(B).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let [_, D, M, Y] = m;
    if (validYMD(Y, M, D))
      return `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.valueOf())) {
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    return `${Y}-${M}-${D}`;
  }
  return null;
}
function isDateCell(cell) {
  if (!cell) return false;
  if (cell.t === "n" && typeof cell.v === "number") return true;
  return !!parseDateStringToISO(cell.v);
}
function toISODateFromCell(cell) {
  if (!cell) return null;
  if (cell.t === "n" && typeof cell.v === "number") return excelSerialToISO(cell.v);
  return parseDateStringToISO(cell.v);
}

/* ===== matricule/email helpers ===== */
function looksNumericId(v) {
  const s = String(v ?? "").trim();
  return /^\d{3,10}$/.test(s);
}
function deriveMatriculeFromEmail(v) {
  const s = String(v ?? "").trim();
  const at = s.indexOf("@");
  if (at > 0) {
    const left = s.slice(0, at);
    if (/^[a-z0-9]{3,20}$/i.test(left)) return left;
  }
  return null;
}

/* =========================
   Header parsing (dates + 3 meals)
   ========================= */
function parseHeader(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const maxScanHeaderRows = Math.min(12, range.e.r - range.s.r + 1);

  const planCols = [];
  let detectedHeaderTop = null;

  for (let r = range.s.r; r <= range.s.r + maxScanHeaderRows - 1; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const top = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!isDateCell(top)) continue;
      const dateStr = toISODateFromCell(top);
      if (!dateStr) continue;

      // search next 1..3 rows for meal labels near this date (merged header tolerant)
      let foundForThisDate = 0;
      for (let rr = r + 1; rr <= Math.min(r + 3, range.e.r); rr++) {
        for (let cc = c; cc <= Math.min(c + 5, range.e.c); cc++) {
          const bot = sheet[XLSX.utils.encode_cell({ r: rr, c: cc })];
          const meal = normMealLabel(bot?.v);
          if (meal) {
            planCols.push({ kind: "plan", c: cc, date: dateStr, meal });
            foundForThisDate++;
          }
        }
        if (foundForThisDate >= 3) break; // PDJ/Repas/Diner complete
      }

      // if nothing labeled, assume triad c..c+2 (same date)
      if (foundForThisDate === 0) {
        planCols.push({ kind: "plan", c: c,     date: dateStr, meal: "PETIT_DEJEUNER" });
        if (c + 1 <= range.e.c) planCols.push({ kind: "plan", c: c + 1, date: dateStr, meal: "DEJEUNER" });
        if (c + 2 <= range.e.c) planCols.push({ kind: "plan", c: c + 2, date: dateStr, meal: "DINER" });
      }

      if (detectedHeaderTop == null) detectedHeaderTop = r;
    }
  }

  if (planCols.length === 0) {
    throw new Error("Aucune colonne 'Date + Repas' détectée (en-têtes).");
  }

  // Find "Matricule" column by synonyms
  const matriculeSynonyms = [
    "matricule", "n matricule", "numero matricule", "no matricule",
    "num etudiant", "n etudiant", "n° etudiant", "id etudiant", "mat",
  ];
  let matriculeCol = null;
  let emailCol = null;
  let matriculeHeaderRow = null;

  for (let r = 0; r <= Math.min(detectedHeaderTop ?? 3, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const val = normalizeLabel(cell?.v);
      if (!val) continue;
      if (matriculeSynonyms.includes(val) && matriculeCol == null) {
        matriculeCol = c; matriculeHeaderRow = r;
      }
      if ((val === "email" || val === "e mail") && emailCol == null) {
        emailCol = c;
      }
    }
  }

  // if still not found, try guessing first column under header as matricule
  if (matriculeCol == null) matriculeCol = range.s.c;

  const headerBottom = Math.max(
    detectedHeaderTop ?? 0,
    (matriculeHeaderRow ?? 0)
  );

  return {
    planCols,            // [{ c, date(YYYY-MM-DD), meal: 'PETIT_DEJEUNER'|'DEJEUNER'|'DINER' }]
    matriculeCol,        // column index for Matricule
    emailCol,            // optional
    dataStartRow: headerBottom + 1,
    range,
  };
}

/* =========================
   Route
   ========================= */
 export default async function plansRoutes(fastify) {
  const { prisma } = fastify;

  fastify.post("/import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const file = await req.file(); // requires @fastify/multipart at app level
    if (!file) return reply.code(400).send({ message: "Fichier 'file' requis (multipart/form-data)." });

    // read additional fields
    const kind = req.body?.kind ? String(req.body.kind) : "student"; // 'student' | 'staff'
    const typeFilter = kind === "staff" ? "STAFF" : "STUDENT";

    // read workbook
    const buf = await file.toBuffer();
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return reply.code(400).send({ message: "Feuille Excel introuvable." });

    // parse header (dates + meals + matricule col)
    const meta = parseHeader(ws); // robust header detection
    const { planCols, matriculeCol, emailCol, dataStartRow, range } = meta;

    // collect selections per row
    const mats = new Set();
    const selections = []; // { matricule, date: 'YYYY-MM-DD', meal: 'PETIT_DEJEUNER'|'DEJEUNER'|'DINER', selected: true }

    for (let r = dataStartRow; r <= range.e.r; r++) {
      const matCell = ws[XLSX.utils.encode_cell({ r, c: matriculeCol })];
      let matricule = matCell?.v != null ? String(matCell.v).trim() : "";

      if (!matricule && emailCol != null) {
        const emailCell = ws[XLSX.utils.encode_cell({ r, c: emailCol })];
        const derived = deriveMatriculeFromEmail(emailCell?.v);
        if (derived) matricule = derived;
      }
      if (!matricule) continue;

      // tolerate numeric-only ids (common student matricules)
      if (!looksNumericId(matricule)) {
        // keep alphanum too, but trimmed
        matricule = String(matricule).trim();
      }

      mats.add(matricule);

      for (const col of planCols) {
        const v = ws[XLSX.utils.encode_cell({ r, c: col.c })];
        if (!v || v.v == null || v.v === "") continue;
        if (!isChecked(v.v)) continue; // only store checked
        selections.push({ matricule, date: col.date, meal: col.meal, selected: true });
      }
    }

    if (mats.size === 0) {
      return reply.code(400).send({ message: "Aucun matricule valide trouvé dans le fichier." });
    }

    // fetch persons
    const people = await prisma.person.findMany({
      where: { matricule: { in: Array.from(mats) }, type: typeFilter },
      select: { id: true, matricule: true },
    });

    const byMat = new Map(people.map(p => [p.matricule, p]));

    // upsert meal plans
    let created = 0, updated = 0;
    const issues = [];

    for (const sel of selections) {
      const p = byMat.get(sel.matricule);
      if (!p) {
        issues.push({ matricule: sel.matricule, reason: "Matricule introuvable pour ce type (student/staff)" });
        continue;
      }

      // check if exists for (personId, date, meal)
      const exists = await prisma.mealPlan.findFirst({
        where: { personId: p.id, date: new Date(sel.date + "T00:00:00.000Z"), meal: sel.meal },
        select: { id: true },
      });

      if (!exists) {
        await prisma.mealPlan.create({
          data: {
            personId: p.id,
            date: new Date(sel.date + "T00:00:00.000Z"),
            meal: sel.meal,           // PETIT_DEJEUNER | DEJEUNER | DINER
            planned: true,             // ✅ schema field
          },
        });
        created++;
      } else {
        await prisma.mealPlan.update({
          where: { id: exists.id },
          data: { planned: true },
        });
        updated++;
      }
    }

    return { ok: true, created, updated, totalRows: selections.length, unresolvedMatricules: issues };
  });
  

}

