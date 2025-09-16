// src/lib/students.api.js
import api from "./api";

export function apiListStudents({
  search = "",
  page = 1,
  pageSize = 20,
  establishmentId = "",
  type = "", // "STUDENT" | "STAFF" | ""
} = {}) {
  return api.get("/students", {
    params: { search, page, pageSize, establishmentId, type },
  });
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

export function apiDownloadTpl() {
  return api.get("/students/template", { responseType: "blob" });
}
