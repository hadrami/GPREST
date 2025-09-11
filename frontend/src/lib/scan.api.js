// src/lib/scan.api.js
import api from "./api";
export function scanVerify({ matricule, meal, date, consume = false }) {
  return api.post("/scan", { matricule, meal, date, consume });
}
