import axios from "axios";
// Dev: leave VITE_API_URL empty → use Vite proxy.
// Prod/phone: VITE_API_URL=http://<PC-LAN-IP>:3000 (NO trailing /api)
const origin = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const api = axios.create({ baseURL: origin });


api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Handle auth expiry
    if (err?.response?.status === 401) {
      localStorage.removeItem("token");
      // Page-level components can also listen for 401 and redirect
    }
    return Promise.reject(err);
  }
);

export default api;
