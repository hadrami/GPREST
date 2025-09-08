import api from "./api";
export const byDay   = (params) => api.get("/api/reports/by-day",   { params });
export const byWeek  = (params) => api.get("/api/reports/by-week",  { params });
export const byMonth = (params) => api.get("/api/reports/by-month", { params });
