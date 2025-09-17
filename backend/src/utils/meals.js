// backend/src/utils/meals.js
export const MEAL_MAP = new Map([
  ["petit", "PETIT_DEJEUNER"],
  ["déj", "DEJEUNER"], ["deje", "DEJEUNER"], ["dej", "DEJEUNER"],
  ["dîn", "DINER"], ["din", "DINER"],
]);

export function normalizeMeal(headerText = "") {
  const t = String(headerText).toLowerCase();
  for (const [k, v] of MEAL_MAP) if (t.includes(k)) return v;
  return null;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// Excel 1900 system serial → Date
function excelSerialToDate(n) {
  if (!Number.isFinite(n)) return null;
  const base = Date.UTC(1899, 11, 30); // 1899-12-30
  const ms = base + Math.round(n) * 86400000;
  return new Date(ms);
}

export function extractDate(headerText = "", fallbackYear = new Date().getFullYear()) {
  if (headerText == null) return null;

  // Numeric cell (Excel serial)
  if (typeof headerText === "number") {
    const d = excelSerialToDate(headerText);
    return d && isFinite(d.valueOf()) ? d : null;
  }

  const t = String(headerText).replace(/\s+/g, " ").trim();

  // Pure numeric string that might be an Excel serial
  if (/^\d+(\.\d+)?$/.test(t) && !t.includes("/")) {
    const d = excelSerialToDate(Number(t));
    if (d && isFinite(d.valueOf())) return d;
  }

  // 1) YYYY-MM-DD
  let m = t.match(/(^|\s)(\d{4})-(\d{2})-(\d{2})(\s|$)/);
  if (m) return new Date(`${m[2]}-${m[3]}-${m[4]}T00:00:00Z`);

  // 2) MM/DD/YYYY or DD/MM/YYYY
  m = t.match(/(^|\s)(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(\s|$)/);
  if (m) {
    let a = Number(m[2]), b = Number(m[3]), y = Number(m[4]);
    let mm, dd;
    if (a > 12) { dd = a; mm = b; }         // 31/01/2025 => DD/MM/YYYY
    else if (b > 12) { mm = a; dd = b; }    // 11/25/2025 => MM/DD/YYYY
    else { mm = b; dd = a; }                // both ≤12 → treat as DD/MM/YYYY (03/11/2025 => 03-Nov)
    return new Date(`${y}-${pad2(mm)}-${pad2(dd)}T00:00:00Z`);
  }

  // 3) dd/mm (or dd-mm) WITHOUT year → use fallbackYear
  m = t.match(/(^|\s)(\d{1,2})[\/\-\.](\d{1,2})(\s|$)/);
  if (m) {
    const dd = Number(m[2]), mm = Number(m[3]);
    return new Date(`${fallbackYear}-${pad2(mm)}-${pad2(dd)}T00:00:00Z`);
  }

  // 4) dd <month name> (FR/EN)
  const MONTHS = {
    jan: 1, janv: 1, janvier: 1,
    fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
    mar: 3, mars: 3,
    avr: 4, avril: 4, apr: 4, april: 4,
    mai: 5, may: 5,
    jun: 6, juin: 6,
    jul: 7, juil: 7, juillet: 7,
    aug: 8, aout: 8, out: 8,
    sep: 9, sept: 9, septembre: 9,
    oct: 10, octobre: 10,
    nov: 11, novembre: 11, november: 11,
    dec: 12, decembre: 12, december: 12,
  };
  m = t.toLowerCase().match(/(^|\s)(\d{1,2})\s+([a-z\u00C0-\u017F]+)/i);
  if (m) {
    const dd = Number(m[2]);
    const key = m[3].normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const mm = MONTHS[key];
    if (mm) return new Date(`${fallbackYear}-${pad2(mm)}-${pad2(dd)}T00:00:00Z`);
  }

  // 5) Last resort
  const d = new Date(t);
  return isFinite(d.valueOf()) ? d : null;
}

export function inferMealFromClock(now = new Date()) {
  const h = now.getHours();
  if (h < 10) return "PETIT_DEJEUNER";
  if (h < 15) return "DEJEUNER";
  return "DINER";
}
