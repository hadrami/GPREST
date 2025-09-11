
// src/lib/students.api.js
import api from "./api";

export function apiListStudents({ search = "", page = 1, pageSize = 20 } = {}) {
  // IMPORTANT: no leading slash -> "students" (resolves to /api/students)
  return api.get("/students", { params: { search, page, pageSize } });
}

export function apiDeleteStudent(id) {
  return api.delete(`/students/${id}`);
}

export function apiImportStudents(file) {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/students/import", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

// Optional template download route if you expose it:
export function apiDownloadTpl() {
  return api.get("/students/template", { responseType: "blob" });
}
