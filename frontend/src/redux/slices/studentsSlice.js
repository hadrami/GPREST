import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/api";

// list with pagination / search
export const fetchStudents = createAsyncThunk("students/fetch", async (params, { rejectWithValue }) => {
  try {
    const { page=1, limit=20, search="", establishmentId } = params || {};
    const { data } = await api.get("/students", {
      params: { page, limit, search, establishmentId }
    });
    return data;
  } catch (e) {
    return rejectWithValue(e.response?.data?.message || "Failed to fetch students");
  }
});

// CRUD
export const createStudent = createAsyncThunk("students/create", async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post("/students", payload);
    return data;
  } catch (e) {
    return rejectWithValue(e.response?.data?.message || "Create failed");
  }
});

export const updateStudent = createAsyncThunk("students/update", async ({ id, data: body }, { rejectWithValue }) => {
  try {
    const { data } = await api.put(`/students/${id}`, body);
    return data;
  } catch (e) {
    return rejectWithValue(e.response?.data?.message || "Update failed");
  }
});

export const deleteStudent = createAsyncThunk("students/delete", async (id, { rejectWithValue }) => {
  try {
    await api.delete(`/students/${id}`);
    return id;
  } catch (e) {
    return rejectWithValue(e.response?.data?.message || "Delete failed");
  }
});

// import Excel
export const importStudents = createAsyncThunk("students/import", async (file, { rejectWithValue }) => {
  try {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/students/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (e) {
    return rejectWithValue(e.response?.data?.message || "Import failed");
  }
});

const slice = createSlice({
  name: "students",
  initialState: {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
    status: "idle",
    error: null,
    lastImport: null,
  },
  reducers: {
    setPage(state, action) { state.page = action.payload; },
    setLimit(state, action) { state.limit = action.payload; },
  },
  extraReducers: (b) => {
    b.addCase(fetchStudents.pending, (s)=>{ s.status="loading"; s.error=null; });
    b.addCase(fetchStudents.fulfilled, (s,a)=>{
      s.status="succeeded";
      s.items = a.payload.items;
      s.page = a.payload.page;
      s.limit = a.payload.limit;
      s.total = a.payload.total;
    });
    b.addCase(fetchStudents.rejected, (s,a)=>{ s.status="failed"; s.error = a.payload; });

    b.addCase(createStudent.fulfilled, (s,a)=>{ s.items.unshift(a.payload); s.total += 1; });
    b.addCase(updateStudent.fulfilled, (s,a)=> {
      const i = s.items.findIndex(x=>x.id===a.payload.id);
      if (i>=0) s.items[i] = a.payload;
    });
    b.addCase(deleteStudent.fulfilled, (s, a) => {
      s.items = s.items.filter(x => x.id !== a.payload);
      s.total = Math.max(0, s.total - 1);
    });

    b.addCase(importStudents.fulfilled, (s,a)=>{ s.lastImport = a.payload; });
  }
});

export const { setPage, setLimit } = slice.actions;
export default slice.reducer;
