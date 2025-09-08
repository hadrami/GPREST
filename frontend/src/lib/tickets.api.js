// src/lib/tickets.api.js
import api from "./api";
export const apiGenerateTickets = (payload) => api.post("/api/tickets/generate", payload);
export const apiListBatches     = () => api.get("/api/tickets/batches");
export const apiBatchPdf        = (id) => api.get(`/api/tickets/batches/${id}/pdf`, { responseType: "blob" });
export const apiDeleteBatch     = (id) => api.delete(`/api/tickets/batches/${id}`);
export const apiValidateTicket  = (code) => api.get(`/api/tickets/validate/${code}`);