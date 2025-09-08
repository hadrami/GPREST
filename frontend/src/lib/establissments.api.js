// src/lib/establishments.api.js
import api from "./api";

// GET /api/establishments?search=&page=&pageSize=
export const apiListEstablishments = (params) => api.get("/api/establishments", { params });

// GET /api/establishments/:id
export const apiGetEstablishment = (id) => api.get(`/api/establishments/${id}`);

// GET /api/establishments/by-name?name=Institut%20A
export const apiGetEstablishmentByName = (name) =>
  api.get(`/api/establishments/by-name`, { params: { name } });

export default {
  apiListEstablishments,
  apiGetEstablishment,
  apiGetEstablishmentByName,
};
