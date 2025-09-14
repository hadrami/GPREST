// src/lib/auth.api.js
import api from "./api";

export const apiLogin           = (username, password) => api.post("/auth/login", 
    { username, password });
export const apiMe              = () => api.get("/auth/me");
export const apiChangePassword  = (body) => api.post("/auth/change-password", body);
