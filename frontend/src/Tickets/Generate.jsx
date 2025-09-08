// src/Tickets/Generate.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { generateTickets, fetchBatches } from "../redux/slices/ticketSlice.js";
import { apiBatchPdf } from "../lib/tickets.api.js";
// If your file is spelled 'establissments.api.js', adjust the import below.
import { apiListEstablishments } from "../lib/establissments.api.js";

export default function TicketsGenerate() {
  const d = useDispatch();
  const { genStatus, genResult, batches, batchesStatus, error } = useSelector((s) => s.tickets);
  const { user } = useSelector((s) => s.auth);

  // Form state
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [meals, setMeals] = useState(["PETIT_DEJEUNER", "DEJEUNER", "DINER"]);

  // Establishments
  const [establishments, setEstablishments] = useState([]);
  const [estId, setEstId] = useState(""); // send when ADMIN selects; empty = all (or backend default)

  // Load batches list and establishments
  useEffect(() => { d(fetchBatches()); }, [d]);

  useEffect(() => {
    (async () => {
      try {
        // You only have ~4-5 — still, ask for a comfortable pageSize
        const { data } = await apiListEstablishments({ page: 1, pageSize: 200 });
        setEstablishments(data.items || data);
      } catch (e) {
        // Non-blocking: keep UI usable even if this fails
        console.warn("Failed to load establishments", e?.response?.data || e.message);
      }
    })();
  }, []);

  const toggleMeal = (m) => {
    setMeals((arr) => (arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m]));
  };

  const invalid = useMemo(() => {
    if (!startDate || !endDate) return true;
    if (endDate < startDate) return true;
    if (meals.length === 0) return true;
    return false;
  }, [startDate, endDate, meals]);

  const submit = (e) => {
    e.preventDefault();
    if (invalid) return;

    const payload = { startDate, endDate, meals };
    // ADMIN can target a specific établissement; if blank, generate for all (backend behavior)
    if (user?.role === "ADMIN" && estId) payload.etablissementId = estId;

    d(generateTickets(payload))
      .unwrap()
      .then(() => d(fetchBatches()))
      .catch(() => void 0);
  };

  const downloadPdf = async (id) => {
    const { data } = await apiBatchPdf(id);
    const blob = new Blob([data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="bg-white border rounded-xl p-4 space-y-4">
        <h2 className="text-lg font-semibold text-primary">Générer des tickets</h2>
        {error && (
          <div className="text-red-700 bg-red-50 border border-red-300 rounded p-2">{error}</div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Date début</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-md border"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Date fin</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-md border"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["PETIT_DEJEUNER", "Petit-déjeuner"],
            ["DEJEUNER", "Déjeuner"],
            ["DINER", "Dîner"],
          ].map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border">
              <input type="checkbox" checked={meals.includes(k)} onChange={() => toggleMeal(k)} />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {user?.role === "ADMIN" && (
          <div className="flex flex-col gap-1">
            <span className="text-sm">Établissement (optionnel)</span>
            {/* Native select is scrollable when long; perfect for mobile too */}
            <select
              value={estId}
              onChange={(e) => setEstId(e.target.value)}
              className="px-3 py-2 rounded-md border max-w-md"
            >
              <option value="">Tous</option>
              {establishments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              Laissez vide pour tous les établissements.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={genStatus === "loading" || invalid}
          className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {genStatus === "loading" ? "Génération…" : "Générer"}
        </button>

        {genResult && (
          <div className="text-sm bg-secondary/40 border border-accent/50 rounded p-2">
            Lot <b>{genResult.batchId}</b> — tickets créés : <b>{genResult.created}</b>
          </div>
        )}
      </form>

      <div className="bg-white border rounded-xl p-4">
        <h3 className="text-base font-semibold mb-2">Lots récents</h3>
        {batchesStatus === "loading" && <div>Chargement…</div>}
        {batchesStatus === "succeeded" && batches.length === 0 && <div>Aucun lot.</div>}
        {batchesStatus === "succeeded" && batches.length > 0 && (
          <ul className="divide-y">
            {batches.map((b) => (
              <li key={b.id} className="py-3 flex items-center justify-between">
                <div className="text-sm">
                  <div>
                    Lot <b>{b.id}</b>
                  </div>
                  <div>
                    {new Date(b.weekStart).toLocaleDateString()} →{" "}
                    {new Date(b.weekEnd).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => downloadPdf(b.id)}
                  className="px-3 py-1.5 rounded-md border hover:bg-secondary"
                >
                  PDF
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
