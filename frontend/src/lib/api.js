// src/lib/api.js
import axios from "axios";

/**
 * Use VITE_API_BASE if you deploy FE/BE separately.
 * In dev (Vite proxy), keep "/api".
 */
const origin = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const api = axios.create({
  baseURL : origin,
  withCredentials: false,
  timeout: 20000,
});

/** We inject the Redux store so interceptors can dispatch logout */
let _store;
export const attachStore = (store) => { _store = store; };

/** Request: attach Bearer token from localStorage */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Response: on 401/403 -> force logout and redirect to /login */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem("token"); 
      _store?.dispatch({ type: "auth/logout" });
      if (location.pathname !== "/login") {
        const reason = status === 401 ? "session_expired" : "forbidden";
        location.replace(`/login?reason=${reason}`);
      }
    }
    return Promise.reject(err);
  }
);

export default api;