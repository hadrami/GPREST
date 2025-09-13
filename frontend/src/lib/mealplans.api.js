// src/lib/mealplans.api.js
import api from "./api";

export function listMealPlans({ search = "", meal = "", mode = "all", date = "", page = 1, pageSize = 20 } = {}) {
  return api.get("/mealplans", { params: { search, meal, mode, date, page, pageSize } });
}

export function deleteMealPlan(id) {
  return api.delete(`/mealplans/${id}`);
}

// NEW: delete all meal plans
export function deleteAllMealPlans() {
  return api.delete("/mealplans/delete");
}