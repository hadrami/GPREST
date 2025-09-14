// src/redux/slices/authSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiLogin, apiMe, apiChangePassword } from "../../lib/auth.api";
import api  from "../../lib/api";

export const bootstrapAuth = createAsyncThunk(
  "auth/bootstrap",
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem("token");
    if (!token) return { token: null, user: null, requiresPasswordChange: false };
    try {
      const { data } = await api.get("/auth/me");
      return {
        token,
        user: data,
        requiresPasswordChange: !!data?.mustChangePassword,
      };
    } catch  {
      return rejectWithValue("invalid_or_stale_token");
    }
  }
);

export const login = createAsyncThunk("auth/login",
  async ({ username, password }, { rejectWithValue }) => {
    try { const { data } = await apiLogin(username, password); return data; }
    catch (e) { return rejectWithValue(e?.response?.data?.message || "Login failed"); }
  });

export const me = createAsyncThunk("auth/me",
  async (_, { rejectWithValue }) => {
    try { const { data } = await apiMe(); return data; }
    catch (e) { return rejectWithValue(e?.response?.data?.message || "Fetch user failed"); }
  });

export const changePassword = createAsyncThunk("auth/changePassword",
  async (payload, { rejectWithValue }) => {
    try { const { data } = await apiChangePassword(payload); return data; }
    catch (e) { return rejectWithValue(e?.response?.data?.message || "Change password failed"); }
  });

const tokenInit = localStorage.getItem("token");

const slice = createSlice({
  name: "auth",
  initialState: {
    token: tokenInit || null,
    user: null,
    requiresPasswordChange: false,
    status: "idle",
    error: null,
  },
  reducers: {
    logout(state) {
      state.token = null; state.user = null; state.requiresPasswordChange = false;
      localStorage.removeItem("token");
    },
    setToken(state, action) {
      state.token = action.payload; localStorage.setItem("token", action.payload);
    },
    clearError(state) { state.error = null; if (state.status === "failed") state.status = "idle"; },
  },
  extraReducers: (b) => {
    b.addCase(login.pending,   (s)=>{ s.status="loading"; s.error=null; })
     .addCase(login.fulfilled, (s,a)=> {
        s.status="succeeded";
        s.token = a.payload.token;
        s.user = a.payload.user;
        s.requiresPasswordChange = !!a.payload.requiresPasswordChange;
        localStorage.setItem("token", s.token);
     })
     .addCase(login.rejected,  (s,a)=>{ s.status="failed"; s.error=a.payload; })

     .addCase(me.fulfilled, (s,a)=> {
        s.user = a.payload;
        s.requiresPasswordChange = !!a.payload.mustChangePassword;
     })
b.addCase(bootstrapAuth.pending, (s) => {
      s.status = "loading"; s.error = null;
    });
    b.addCase(bootstrapAuth.fulfilled, (s, a) => {
      s.status = "succeeded";
      s.token = a.payload.token;
      s.user = a.payload.user;
      s.requiresPasswordChange = !!a.payload.requiresPasswordChange;
    });
    b.addCase(bootstrapAuth.rejected, (s) => {
      s.status = "failed";
      s.token = null;
      s.user = null;
      s.requiresPasswordChange = false;
      localStorage.removeItem("token"); 
    })
     .addCase(changePassword.pending,   (s)=>{ s.status="loading"; s.error=null; })
     .addCase(changePassword.fulfilled, (s,a)=> {
        s.status="succeeded";
        s.token = a.payload.token;
        s.requiresPasswordChange = false;
        localStorage.setItem("token", s.token);
     })
     .addCase(changePassword.rejected,  (s,a)=>{ s.status="failed"; s.error=a.payload; });
     
  },
});

export const { logout, setToken, clearError } = slice.actions;
export default slice.reducer;

// Selectors

export const selectUser   = (s) => s.auth.user;
export const selectToken  = (s) => s.auth.token;
export const selectIsAuthed = (s) => Boolean(s.auth.token);

// Normalize to UPPERCASE so comparisons are consistent
export const selectRole   = (s) => {
  const r = s.auth.user?.role;
  return r ? String(r).toUpperCase() : null;
};
export const selectIsAdmin = (s) => selectRole(s) === 'ADMIN';
