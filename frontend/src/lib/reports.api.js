// src/lib/reports.api.js
import api from "./api";

export function byDay(params) {
  // params: { date, meal?, establishmentId?, type?, status?('used'|'unused') }
  return api.get("/reports/by-day", { params });
}
export function byWeek(params) {
  // params: { weekStart, meal?, establishmentId?, type? }
  return api.get("/reports/by-week", { params });
}
export function byMonth(params) {
  // params: { year, month, meal?, establishmentId?, type? }
  return api.get("/reports/by-month", { params });
}
