// src/redux/slices/ticketsSlice.js
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiGenerateTickets, apiListBatches } from "../../lib/tickets.api";

export const generateTickets = createAsyncThunk(
  "tickets/generate",
  async (payload, { rejectWithValue }) => {
    try { const { data } = await apiGenerateTickets(payload); return data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || e.response?.data?.reason || e.message); }
  }
);

export const fetchBatches = createAsyncThunk(
  "tickets/batches",
  async (_, { rejectWithValue }) => {
    try { const { data } = await apiListBatches(); return data.items || []; }
    catch (e) { return rejectWithValue(e.response?.data?.message || e.message); }
  }
);

const slice = createSlice({
  name: "tickets",
  initialState: { genStatus: "idle", genResult: null, batches: [], batchesStatus: "idle", error: null },
  reducers: { clearTicketsError(s){ s.error = null; } },
  extraReducers: (b) => {
    b.addCase(generateTickets.pending,   (s)=>{ s.genStatus="loading"; s.error=null; s.genResult=null; })
     .addCase(generateTickets.fulfilled, (s,a)=>{ s.genStatus="succeeded"; s.genResult=a.payload; })
     .addCase(generateTickets.rejected,  (s,a)=>{ s.genStatus="failed"; s.error=a.payload; })
     .addCase(fetchBatches.pending,      (s)=>{ s.batchesStatus="loading"; s.error=null; })
     .addCase(fetchBatches.fulfilled,    (s,a)=>{ s.batchesStatus="succeeded"; s.batches=a.payload; })
     .addCase(fetchBatches.rejected,     (s,a)=>{ s.batchesStatus="failed"; s.error=a.payload; });
  }
});

export const { clearTicketsError } = slice.actions;
export default slice.reducer;
