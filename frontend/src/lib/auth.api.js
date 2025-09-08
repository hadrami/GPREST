// src/lib/auth.api.js
import api from "./api";
export const apiLogin           = (email, password) => api.post("/api/auth/login", { email, password });
export const apiMe              = () => api.get("/api/auth/me");
export const apiChangePassword  = (body) => api.post("/api/auth/change-password", body);
