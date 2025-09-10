// backend/src/utils/meals.js
export const MEAL_MAP = new Map([
  ["petit", "PETIT_DEJEUNER"],
  ["déj", "DEJEUNER"], ["deje", "DEJEUNER"], ["dej", "DEJEUNER"],
  ["dîn", "DINER"], ["din", "DINER"],
]);

export function normalizeMeal(headerText = "") {
  const t = headerText.toLowerCase();
  for (const [k, v] of MEAL_MAP) {
    if (t.includes(k)) return v;
  }
  return null;
}

export function extractDate(headerText = "", fallbackYear = new Date().getFullYear()) {
  const t = headerText.replace(/\s+/g, " ").trim();
  const ymd = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00Z`);
  const dm = t.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
  if (dm) {
    const dd = String(dm[1]).padStart(2, "0");
    const mm = String(dm[2]).padStart(2, "0");
    return new Date(`${fallbackYear}-${mm}-${dd}T00:00:00Z`);
  }
  return null;
}

export function inferMealFromClock(now = new Date()) {
  const h = now.getHours();
  if (h < 10) return "PETIT_DEJEUNER";
  if (h < 15) return "DEJEUNER";
  return "DINER";
}
