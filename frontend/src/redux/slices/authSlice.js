import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/api";

// Async thunks
export const login = createAsyncThunk("auth/login", async ({ email, password }, { rejectWithValue }) => {
  try {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  } catch (e) {
    return rejectWithValue(e?.response?.data?.message || "Login failed");
  }
});

export const me = createAsyncThunk("auth/me", async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch (e) {
    return rejectWithValue(e?.response?.data?.message || "Fetch user failed");
  }
});

export const changePassword = createAsyncThunk("auth/changePassword", async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post("/auth/change-password", payload);
  return data;
  } catch (e) {
    return rejectWithValue(e?.response?.data?.message || "Change password failed");
  }
});

const tokenInit = localStorage.getItem("token");

const slice = createSlice({
  name: "auth",
  initialState: {
    token: tokenInit || null,
    user: null,
    requiresPasswordChange: false,
    status: "idle",   // "idle" | "loading" | "succeeded" | "failed"
    error: null,
  },
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      state.requiresPasswordChange = false;
      localStorage.removeItem("token");
    },
    setToken(state, action) {
      state.token = action.payload;
      localStorage.setItem("token", action.payload);
    },
    clearError(state) {
      state.error = null;
      if (state.status === "failed") state.status = "idle";
    },
  },
  extraReducers: (b) => {
    b.addCase(login.pending, (s) => { s.status = "loading"; s.error = null; });
    b.addCase(login.fulfilled, (s, a) => {
      s.status = "succeeded";
      s.token = a.payload.token;
      s.user = a.payload.user;
      s.requiresPasswordChange = !!a.payload.requiresPasswordChange;
      localStorage.setItem("token", s.token);
    });
    b.addCase(login.rejected, (s, a) => { s.status = "failed"; s.error = a.payload; });

    b.addCase(me.fulfilled, (s, a) => {
      s.user = a.payload;
      s.requiresPasswordChange = !!a.payload.mustChangePassword;
    });

    b.addCase(changePassword.pending, (s) => { s.status = "loading"; s.error = null; });
    b.addCase(changePassword.fulfilled, (s, a) => {
      s.status = "succeeded";
      s.token = a.payload.token;
      s.requiresPasswordChange = false;
      localStorage.setItem("token", s.token);
    });
    b.addCase(changePassword.rejected, (s, a) => { s.status = "failed"; s.error = a.payload; });
  },
});

export const { logout, setToken, clearError } = slice.actions;
export default slice.reducer;
