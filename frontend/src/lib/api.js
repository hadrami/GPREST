import axios from "axios";

// During dev, vite proxy forwards /auth, /students, etc. to backend:3000
const api = axios.create({ baseURL: "/" });

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
