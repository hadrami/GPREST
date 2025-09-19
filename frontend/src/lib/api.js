// src/lib/api.js
import axios from "axios";

/**
 * Dev: if VITE_API_BASE is empty and you're on Vite (e.g. :5173),
 * this auto-uses http://<current-host>:<VITE_API_PORT || 3000>/api
 * Prod: if VITE_API_BASE is set (e.g. https://api.example.com), we use it.
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
const PREFIX   = (import.meta.env.VITE_API_PREFIX || "/api").replace(/\/+$/, "");
const isDev    = import.meta.env.DEV;

let baseURL;
if (RAW_BASE) {
  // explicit full origin given
  baseURL = `${RAW_BASE}${PREFIX}`;
} else if (isDev) {
  // no proxy? talk to backend port directly (same host)
  const host = window.location.hostname;     // e.g. 192.168.100.8
  const port = import.meta.env.VITE_API_PORT || "3000";
  baseURL = `http://${host}:${port}${PREFIX}`;
} else {
  // prod same-origin (behind reverse proxy)
  baseURL = `${PREFIX}`;
}

const api = axios.create({
  baseURL,
  withCredentials: false,
});

// Optional: small console hint during dev
if (isDev) console.info("[api] baseURL =", baseURL);

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
