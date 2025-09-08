// src/lib/students.api.js
import api from "./api";
export const apiListStudents   = (params) => api.get("/api/students", { params });
export const apiDeleteStudent  = (id) => api.delete(`/api/students/${id}`);
export const apiDownloadTpl    = () => api.get("/api/students/template", { responseType: "blob" });
export const apiImportStudents = (file) => {
  const fd = new FormData(); fd.append("file", file);
  // don’t set Content-Type manually; browser will set boundary
  return api.post("/api/students/import", fd);
};
