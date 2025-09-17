// backend/src/routes/plans.js  (ESM)
import * as XLSX from "xlsx";
import crypto from "crypto";
import { normalizeMeal, extractDate } from "../utils/meals.js"; // shared helpers
// ^ utils/meals.js is where we added MM/DD/YYYY & DD/MM/YYYY support earlier

export default async function plansRoutes(fastify) {
  const { prisma } = fastify;

  // ---------- helpers ----------
  const YEAR_DEFAULT = 2025;

  const strip = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();

  // very strict now: only 1 / TRUE is considered checked
  const isMarked = (v) => {
    if (v === true) return true;
    if (typeof v === "number") return v === 1;
    const t = strip(v).toLowerCase();
    return t === "1" || t === "true";
  };

  // Matricule: drop trailing .0 and non-alphanum
  const cleanMatricule = (v) => {
    let s = String(v ?? "").trim();
    if (/^\d+\.0+$/.test(s)) s = s.split(".", 1)[0];
    return s.replace(/[^A-Za-z0-9]+/g, "");
  };

  // Build a deterministic signature for “same file / same data” detection
  function buildSelectionSignature(selections) {
    const keys = selections
      .map((s) => `${s.matricule}|${s.date}|${s.meal}`)
      .sort();
    const h = crypto.createHash("sha256");
    h.update(JSON.stringify(keys));
    return h.digest("hex");
  }

  // Header parser: Row1 = dates, Row2 = meal labels (triad to the right)
  function parseHeader(ws, forcedYear) {
    const ref = XLSX.utils.decode_range(ws["!ref"]);
    const rowDate = ref.s.r;     // first row
    const rowMeal = ref.s.r + 1; // second row

    const planCols = []; // { c, dateISO, meal }
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const top = ws[XLSX.utils.encode_cell({ r: rowDate, c })];
      if (!top || top.v == null || String(top.v).trim() === "") continue;

      // Accept: 11/03/2025, 03/11/2025, monday 03/11, 03 novembre, etc.
      const d = extractDate(top.v, forcedYear); // utils covers MM/DD/YYYY & DD/MM/YYYY
      if (!d || !isFinite(d.valueOf())) continue;
      const dateISO = d.toISOString().slice(0, 10);

      // Try to find labeled subcolumns on row 2 (Petit déj / Déjeuner / Dîner)
      let found = 0;
      for (let cc = c; cc <= Math.min(c + 6, ref.e.c); cc++) {
        const mealCell = ws[XLSX.utils.encode_cell({ r: rowMeal, c: cc })];
        const mealEnum = normalizeMeal(String(mealCell?.v || ""));
        if (mealEnum) {
          planCols.push({ c: cc, dateISO, meal: mealEnum });
          found++;
        }
      }

      // Fallback: assume triad c..c+2 if labels are merged/empty
      if (found === 0) {
        planCols.push({ c,     dateISO, meal: "PETIT_DEJEUNER" });
        planCols.push({ c: c + 1, dateISO, meal: "DEJEUNER" });
        planCols.push({ c: c + 2, dateISO, meal: "DINER" });
      }
    }

    if (!planCols.length) {
      throw new Error(
        "Aucune colonne Date/Repas détectée. Ligne 1: ‘MM/DD/YYYY’, ‘DD/MM/YYYY’, ‘lundi 03/11’ ou ‘03 novembre’. Ligne 2: ‘Petit déj’, ‘Déjeuner’, ‘Dîner’."
      );
    }

    // Try to detect a “Matricule” column in first two rows; else first data column
    let matriculeCol = ref.s.c;
    for (let r of [rowDate, rowMeal]) {
      for (let c = ref.s.c; c <= ref.e.c; c++) {
        const v = strip(ws[XLSX.utils.encode_cell({ r, c })]?.v).toLowerCase();
        if (
          ["matricule", "n matricule", "numero matricule", "no matricule", "num etudiant", "n etudiant", "id etudiant", "mat"].includes(
            v
          )
        ) {
          matriculeCol = c;
          break;
        }
      }
    }

    return { planCols, matriculeCol, dataStartRow: rowMeal + 1, ref };
  }

  function isRowEmpty(ws, r, planCols, matriculeCol) {
    const m = cleanMatricule(ws[XLSX.utils.encode_cell({ r, c: matriculeCol })]?.v);
    if (m) return false;
    for (const pc of planCols) {
      const v = ws[XLSX.utils.encode_cell({ r, c: pc.c })]?.v;
      if (v != null && String(v).trim() !== "") return false;
    }
    return true;
  }

  // ---------- POST /api/plans/import ----------
  fastify.post("/import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ message: "Fichier 'file' requis (.xlsx)." });

    const kindParam = String(req.body?.kind || "student").toLowerCase();
    const type = kindParam === "staff" ? "STAFF" : "STUDENT";

    const forcedYear = Number(req.body?.year || req.query?.year || YEAR_DEFAULT) || YEAR_DEFAULT;

    const buf = await file.toBuffer();
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return reply.code(400).send({ message: "Feuille Excel introuvable." });

    // 1) headers
    const { planCols, matriculeCol, dataStartRow, ref } = parseHeader(ws, forcedYear);

    // 2) find last non-empty row (tolerate gaps)
    let last = dataStartRow, emptyStreak = 0;
    for (let r = dataStartRow; r <= ref.e.r; r++) {
      if (isRowEmpty(ws, r, planCols, matriculeCol)) {
        emptyStreak++;
        if (emptyStreak >= 5) break;
      } else {
        emptyStreak = 0;
        last = r;
      }
    }

    // 3) collect unique selections & raw mark count
    const uniq = new Map();
    const allMatricules = new Set();
    let rawMarksFound = 0;

    for (let r = dataStartRow; r <= last; r++) {
      const mCell = ws[XLSX.utils.encode_cell({ r, c: matriculeCol })];
      const matricule = cleanMatricule(mCell?.v);
      if (!matricule) continue;
      allMatricules.add(matricule);

      for (const pc of planCols) {
        const v = ws[XLSX.utils.encode_cell({ r, c: pc.c })]?.v;
        if (!isMarked(v)) continue;
        rawMarksFound++;
        const key = `${matricule}|${pc.dateISO}|${pc.meal}`;
        if (!uniq.has(key)) uniq.set(key, { matricule, date: pc.dateISO, meal: pc.meal });
      }
    }
    const selections = Array.from(uniq.values());
    const totalRows = selections.length;

    // Selection signature for “same file/data” hint
    const selectionSignature = buildSelectionSignature(selections);

    // 4) resolve persons once
    const persons = await prisma.person.findMany({
      where: { matricule: { in: Array.from(allMatricules) }, type },
      select: { id: true, matricule: true },
    });
    const byMat = new Map(persons.map((p) => [p.matricule, p]));

    // 5) upsert (deduped)
    let created = 0,
      updated = 0;

    // Collect problems as { matricule, reason }, then group below
    const issues = [];

    for (const s of selections) {
      const person = byMat.get(s.matricule);
      if (!person) {
        issues.push({ matricule: s.matricule, reason: "Matricule introuvable" });
        continue;
      }
      const dateObj = new Date(`${s.date}T00:00:00Z`);

      const exists = await prisma.mealPlan.findFirst({
        where: { personId: person.id, date: dateObj, meal: s.meal },
        select: { id: true, planned: true },
      });

      if (!exists) {
        await prisma.mealPlan.create({
          data: { personId: person.id, date: dateObj, meal: s.meal, planned: true },
        });
        created++;
      } else if (!exists.planned) {
        await prisma.mealPlan.update({ where: { id: exists.id }, data: { planned: true } });
        updated++;
      }
    }

    // 6) group problems by matricule with counts
    const problemByMat = {};
    for (const it of issues) {
      if (!it.matricule) continue;
      problemByMat[it.matricule] = (problemByMat[it.matricule] || 0) + 1;
    }
    const problems = Object.entries(problemByMat).map(([matricule, count]) => ({
      reason: "Matricule introuvable",
      matricule,
      count,
    }));

    const noChanges = created === 0 && updated === 0;

    return {
      ok: true,
      created,
      updated,
      totalRows,
      rawMarksFound,
      problems, // [{reason, matricule, count}]
      noChanges, // UI shows “same data” in red if true
      selectionSignature, // UI can compare with last signature to say “même fichier”
      meta: {
        year: forcedYear,
        headerRows: [1, 2],
        dataRows: [dataStartRow + 1, last + 1],
        datesDetected: Array.from(new Set(planCols.map((p) => p.dateISO))).sort(),
        mealColumns: planCols.length,
        uniqueMatricules: allMatricules.size,
      },
    };
  });
}
