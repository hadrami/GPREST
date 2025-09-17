// src/lib/mealplans.api.js
import api from "./api";

export function listMealPlans({
  search = "",
  meal = "",
  from,
  to,
  establishmentId,
  type,
  page = 1,
  pageSize = 20,
  order = "desc",
} = {}) {
  return api.get("/mealplans", {
    params: { search, meal, from, to, establishmentId, type, page, pageSize, order },
  });
}


export function deleteMealPlan(id) {
  return api.delete(`/mealplans/${id}`);
}

// NEW: delete all meal plans
export function deleteAllMealPlans() {
  return api.delete("/mealplans/delete");
}