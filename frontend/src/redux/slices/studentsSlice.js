// frontend/src/redux/slices/studentsSlice.js
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/api";

export const fetchStudents = createAsyncThunk(
  "students/fetch",
  async ({ search = "", page = 1, pageSize = 20, establishmentId } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/students", {
        params: { search, page, pageSize, establishmentId },
      });
      return data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const importStudents = createAsyncThunk(
  "students/import",
  async (file, { rejectWithValue }) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/students/import", fd, {
        headers: { "content-type": "multipart/form-data" },
      });
      return data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

export const deleteStudent = createAsyncThunk(
  "students/delete",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.delete(`/students/${id}`);
      return { id, ...data };
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || e.message);
    }
  }
);

const slice = createSlice({
  name: "students",
  initialState: {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    status: "idle",
    error: null,
    importStatus: "idle",
    importResult: null,
  },
  reducers: {
    clearStudentsError(state) { state.error = null; },
  },
  extraReducers: (b) => {
    b
      .addCase(fetchStudents.pending, (s) => { s.status = "loading"; s.error = null; })
      .addCase(fetchStudents.fulfilled, (s, a) => {
        s.status = "succeeded";
        s.items = a.payload.items;
        s.total = a.payload.total;
        s.page = a.payload.page;
        s.pageSize = a.payload.pageSize;
      })
      .addCase(fetchStudents.rejected, (s, a) => { s.status = "failed"; s.error = a.payload || "Erreur"; })

      .addCase(importStudents.pending, (s) => { s.importStatus = "loading"; s.importResult = null; s.error = null; })
      .addCase(importStudents.fulfilled, (s, a) => { s.importStatus = "succeeded"; s.importResult = a.payload; })
      .addCase(importStudents.rejected, (s, a) => { s.importStatus = "failed"; s.error = a.payload || "Erreur"; })

      .addCase(deleteStudent.fulfilled, (s, a) => {
        s.items = s.items.filter((x) => x.id !== a.payload.id);
        s.total = Math.max(0, s.total - 1);
      });
  },
});

export const { clearStudentsError } = slice.actions;
export default slice.reducer;
