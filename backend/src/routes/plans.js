// src/routes/plans.js
// ESM module
import fp from "fastify-plugin";
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

const MEAL_MAP = {
  "petit dejeuner": "BREAKFAST",
  "petit-dejeuner": "BREAKFAST",
  "petit_dejeuner": "BREAKFAST",
  breakfast: "BREAKFAST",
  dejeuner: "LUNCH",
  "dejeuner ": "LUNCH",
  "dejeuner  ": "LUNCH",
  "déjeuner": "LUNCH",
  lunch: "LUNCH",
  diner: "DINNER",
  "diner ": "DINNER",
  "dîner": "DINNER",
  dinner: "DINNER",
};

function normMealLabel(s) {
  const key = normalizeLabel(s).replace(/\s+/g, " ");
  return MEAL_MAP[key] || null;
}

function isChecked(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = normalizeLabel(v);
  return (
    s === "1" ||
    s === "true" ||
    s === "x" ||
    s === "vrai" ||
    s === "oui" ||
    s === "yes" ||
    s === "y" ||
    s === "✓"
  );
}

/* ====== DATE HELPERS (no SSF / robust) ====== */

// Excel serial (1900 system): day 1 = 1899-12-31; practical base = 1899-12-30
function excelSerialToISO(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const epoch = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
  const ms = epoch + Math.round(n) * 86400000; // days → ms
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function validYMD(y, m, d) {
  y = Number(y);
  m = Number(m);
  d = Number(d);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const thirty = [4, 6, 9, 11];
  if (thirty.includes(m) && d > 30) return false;
  if (m === 2 && d > 29) return false; // good enough
  return true;
}

// Parse string dates: supports yyyy/mm/dd, dd/mm/yyyy, yyyy/dd/mm
function parseDateStringToISO(s) {
  if (!s) return null;
  s = String(s).trim();

  // yyyy-mm-dd or yyyy/mm/dd
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

  // dd-mm-yyyy or dd/mm/yyyy
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let [_, D, M, Y] = m;
    if (validYMD(Y, M, D))
      return `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  }

  // Fallback to native Date (e.g., "Sep 3, 2025")
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
  return /^\d{3,10}$/.test(s); // change if matricules are alphanum
}

function deriveMatriculeFromEmail(v) {
  const s = String(v ?? "").trim();
  const at = s.indexOf("@");
  if (at > 0) {
    const left = s.slice(0, at);
    if (/^\d{3,10}$/.test(left)) return left;
  }
  return null;
}

/* =========================
   Header parsing (robust)
   ========================= */

function parseHeader(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const maxScanHeaderRows = Math.min(10, range.e.r - range.s.r + 1);

  // Try two-row header (row r = dates, row r+1 = meals)
  let planCols = [];
  let headerRowStart = null;
  let headerRowCount = 1;

  for (let r = range.s.r; r <= range.s.r + maxScanHeaderRows - 2; r++) {
    const pairs = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const top = sheet[XLSX.utils.encode_cell({ r, c })];
      const bot = sheet[XLSX.utils.encode_cell({ r: r + 1, c })];
      if (isDateCell(top)) {
        const dateStr = toISODateFromCell(top);
        const meal = normMealLabel(bot?.v);
        if (dateStr && meal) {
          pairs.push({ kind: "plan", c, date: dateStr, meal });
        }
      }
    }
    if (pairs.length >= 2) {
      planCols = pairs;
      headerRowStart = r;
      headerRowCount = 2;
      break;
    }
  }

  // If not found, try flat headers in the first 10 rows (“YYYY-MM-DD Déjeuner”)
  if (planCols.length === 0) {
    for (let r = range.s.r; r <= range.s.r + maxScanHeaderRows - 1; r++) {
      const flats = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const label = String(cell?.v ?? "").trim();
        if (!label) continue;
        const parts = label.split(/\s+/);
        if (parts.length >= 2) {
          const meal = normMealLabel(parts.slice(1).join(" "));
          const iso = parseDateStringToISO(parts[0]);
          if (meal && iso) {
            flats.push({ kind: "plan", c, date: iso, meal });
          }
        }
      }
      if (flats.length >= 2) {
        planCols = flats;
        headerRowStart = r;
        headerRowCount = 1;
        break;
      }
    }
  }

  if (planCols.length === 0) {
    throw new Error("Aucune colonne 'Date + Repas' détectée (en-têtes).");
  }

  // Find "Matricule" column by synonyms or guess
  const matriculeSynonyms = [
    "matricule",
    "n matricule",
    "numero matricule",
    "no matricule",
    "num etudiant",
    "n etudiant",
    "n° etudiant",
    "id etudiant",
    "mat",
  ];
  let matriculeCol = null;
  let matriculeHeaderRow = null;

  for (let r = range.s.r; r <= range.s.r + maxScanHeaderRows - 1; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const n = normalizeLabel(cell?.v);
      if (!n) continue;
      if (matriculeSynonyms.some((key) => n.includes(key))) {
        matriculeCol = c;
        matriculeHeaderRow = r;
        break;
      }
    }
    if (matriculeCol != null) break;
  }

  // If not found, guess by numeric-like IDs
  if (matriculeCol == null) {
    const scores = new Map(); // c -> { count, total }
    for (let c = range.s.c; c <= range.e.c; c++) {
      let count = 0,
        total = 0;
      for (
        let r = headerRowStart + headerRowCount;
        r <= Math.min(range.e.r, headerRowStart + headerRowCount + 100);
        r++
      ) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v != null) {
          total++;
          if (looksNumericId(cell.v)) count++;
        }
      }
      if (total > 0) scores.set(c, { count, total });
    }
    let best = null,
      bestRatio = 0;
    for (const [c, { count, total }] of scores.entries()) {
      const ratio = count / total;
      if (count >= 10 && ratio >= 0.5 && ratio > bestRatio) {
        best = c;
        bestRatio = ratio;
      }
    }
    if (best != null) matriculeCol = best;
  }

  // fall back: derive from Email column
  let emailCol = null;
  if (matriculeCol == null) {
    const emailSyn = ["email", "e mail", "adresse email", "mail"];
    for (let r = range.s.r; r <= range.s.r + maxScanHeaderRows - 1; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const n = normalizeLabel(cell?.v);
        if (!n) continue;
        if (emailSyn.some((k) => n.includes(k))) {
          emailCol = c;
          matriculeHeaderRow = r;
          break;
        }
      }
      if (emailCol != null) break;
    }
  }

  if (matriculeCol == null && emailCol == null) {
    throw new Error("Colonne 'Matricule' introuvable.");
  }

  // First data row
  let dataStartRow = headerRowStart + headerRowCount;
  if (matriculeHeaderRow != null) {
    dataStartRow = Math.max(dataStartRow, matriculeHeaderRow + 1);
  }

  return { planCols, matriculeCol, emailCol, dataStartRow };
}

/* =========================
   Import core
   ========================= */

async function importPlansFromSheet({ sheet, prisma, kind }) {
  const { planCols, matriculeCol, emailCol, dataStartRow } = parseHeader(sheet);
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Build set of matricules (or derive from email)
  const mats = new Set();
  const rowToMat = new Map();

  for (let r = dataStartRow; r <= range.e.r; r++) {
    let mat = null;
    if (matriculeCol != null) {
      const v = sheet[XLSX.utils.encode_cell({ r, c: matriculeCol })]?.v;
      if (v != null && String(v).trim() !== "") mat = String(v).trim();
    }
    if (!mat && emailCol != null) {
      const v = sheet[XLSX.utils.encode_cell({ r, c: emailCol })]?.v;
      mat = deriveMatriculeFromEmail(v);
    }
    if (mat) {
      mats.add(mat);
      rowToMat.set(r, mat);
    }
  }

  // Fetch people by matricule
  let people = [];
  if (kind === "staff") {
    // If you add a Staff model later, switch to prisma.staff here.
    people = await prisma.student.findMany({
      where: { matricule: { in: Array.from(mats) } },
      select: { id: true, establishmentId: true, matricule: true },
    });
  } else {
    people = await prisma.student.findMany({
      where: { matricule: { in: Array.from(mats) } },
      select: { id: true, establishmentId: true, matricule: true },
    });
  }
  const byMat = new Map(people.map((p) => [p.matricule, p]));

  let created = 0,
    updated = 0;
  const issues = [];

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const matricule = rowToMat.get(r);
    if (!matricule) continue;

    const person = byMat.get(matricule);
    if (!person) {
      issues.push({ row: r + 1, reason: `Matricule inconnu: ${matricule}` });
      continue;
    }

    for (const pc of planCols) {
      const raw = sheet[XLSX.utils.encode_cell({ r, c: pc.c })]?.v;
      if (!isChecked(raw)) continue;

      const date = new Date(pc.date + "T00:00:00.000Z");
      const meal = pc.meal; // 'BREAKFAST' | 'LUNCH' | 'DINNER'

      // Manual upsert to avoid depending on compound index name
      const existing = await prisma.mealPlan.findFirst({
        where: { personId: person.id, date, meal },
        select: { id: true },
      });

      if (existing) {
        await prisma.mealPlan.update({
          where: { id: existing.id },
          data: { planned: true },
        });
        updated++;
      } else {
        await prisma.mealPlan.create({
          data: {
            personId: person.id,
            establishmentId: person.establishmentId ?? null,
            date,
            meal,
            planned: true,
          },
        });
        created++;
      }
    }
  }

  return { created, updated, issues };
}

/* =========================
   Fastify route
   ========================= */

async function routes(fastify) {
  const { prisma } = fastify;

  fastify.post("/plans/import", {
    preHandler: [fastify.auth],
    handler: async (req, reply) => {
      if (!req.isMultipart()) {
        return reply
          .code(400)
          .send({ message: "Content-Type must be multipart/form-data" });
      }

      // Read multipart with modern API
      const files = [];
      const fields = {};
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const chunks = [];
          for await (const ch of part.file) chunks.push(ch);
          files.push({
            fieldname: part.fieldname,
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: Buffer.concat(chunks),
          });
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      const f = files.find((x) => x.fieldname === "file");
      if (!f) return reply.code(400).send({ message: "Aucun fichier fourni" });

      const kind = (fields.kind || "student").toLowerCase();

      try {
        const wb = XLSX.read(f.buffer, { type: "buffer" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return reply.code(400).send({ message: "Feuille Excel vide" });

        const result = await importPlansFromSheet({ sheet, prisma, kind });
        return reply.send(result);
      } catch (e) {
        fastify.log.error(e);
        return reply
          .code(400)
          .send({ message: e?.message || "Import échoué" });
      }
    },
  });
}

export default fp(routes);
