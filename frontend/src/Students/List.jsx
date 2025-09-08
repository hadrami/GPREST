// src/Students/List.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { deleteStudent, fetchStudents } from "../redux/slices/studentsSlice";
import {byDay, byWeek, byMonth} from "../lib/reports.api";
import { Link } from "react-router-dom";

const MEALS = [
  { key: "PETIT_DEJEUNER", label: "Petit déjeuner" },
  { key: "DEJEUNER", label: "Déjeuner" },
  { key: "DINER", label: "Dîner" },
];

export default function StudentsList() {
  const d = useDispatch();
  const { items, total, page, pageSize, status } = useSelector((s) => s.students);

  // Search / pagination (mode "Tous")
  const [q, setQ] = useState("");

  // View mode tabs
  const [mode, setMode] = useState("all"); // all | day | week | month

  // Day filter
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState("DEJEUNER");
  const [statusFilter, setStatusFilter] = useState("used"); // used | unused

  // Week filter
  const [weekStart, setWeekStart] = useState(today); // Monday of week ideally

  // Month filter
  const [month, setMonth] = useState(() => {
    const dt = new Date(); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
  });

  // Data from reports
  const [reportItems, setReportItems] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  // initial load for "all"
  useEffect(() => { d(fetchStudents({ page: 1, pageSize })); }, [d, pageSize]);

  const search = (e) => {
    e.preventDefault();
    d(fetchStudents({ search: q, page: 1, pageSize }));
  };
  const next = () => d(fetchStudents({ search: q, page: page + 1, pageSize }));
  const prev = () => d(fetchStudents({ search: q, page: Math.max(1, page - 1), pageSize }));

  // fetch reports when mode/filters change
  useEffect(() => {
    if (mode === "day") {
      (async () => {
        try {
          setReportLoading(true); setReportError(null);
          const { data } = await byDay({ date, meal, status: statusFilter });
          setReportItems(data.items || []); setReportMeta(data.totals || null);
        } catch (e) { setReportError(e.response?.data?.message || e.message); }
        finally { setReportLoading(false); }
      })();
    } else if (mode === "week") {
      (async () => {
        try {
          setReportLoading(true); setReportError(null);
          const { data } = await byWeek({ weekStart, meal });
          setReportItems(data.items || []); setReportMeta(data.totals || null);
        } catch (e) { setReportError(e.response?.data?.message || e.message); }
        finally { setReportLoading(false); }
      })();
    } else if (mode === "month") {
      (async () => {
        try {
          setReportLoading(true); setReportError(null);
          const [y,m] = month.split("-");
          const { data } = await byMonth({ year: y, month: m, meal });
          setReportItems(data.items || []); setReportMeta(data.totals || null);
        } catch (e) { setReportError(e.response?.data?.message || e.message); }
        finally { setReportLoading(false); }
      })();
    }
  }, [mode, date, meal, statusFilter, weekStart, month]);

  const currentRows = useMemo(() => {
    if (mode === "all") return items;
    return reportItems;
  }, [mode, items, reportItems]);

  return (
    <div className="space-y-4">
      {/* Header: search + actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={search} className="flex flex-1 gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom / matricule / email"
            className="flex-1 px-3 py-2 rounded-md border"
          />
          <button className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark">Rechercher</button>
        </form>
        <div className="flex gap-2">
          <Link to="/students/import" className="px-3 py-2 rounded-lg border hover:bg-secondary">Importer (XLSX)</Link>
          <Link to="/tickets/generate" className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark">
            Générer tickets
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          ["all","Tous"],
          ["day","Jour"],
          ["week","Semaine"],
          ["month","Mois"],
        ].map(([k,label])=>(
          <button key={k}
            onClick={()=>setMode(k)}
            className={`px-3 py-1.5 rounded-full border ${mode===k ? "bg-primary text-white border-primary" : "hover:bg-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters under tabs */}
      {mode === "day" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="px-3 py-2 rounded-md border" />
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="px-3 py-2 rounded-md border">
            {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="used">Ont mangé</option>
            <option value="unused">Pas encore mangé</option>
          </select>
        </div>
      )}
      {mode === "week" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="date" value={weekStart} onChange={(e)=>setWeekStart(e.target.value)} className="px-3 py-2 rounded-md border" />
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous repas</option>
            {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      )}
      {mode === "month" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} className="px-3 py-2 rounded-md border" />
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous repas</option>
            {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      )}

      {/* Meta line for reports */}
      {mode !== "all" && (
        <div className="text-sm text-slate-700">
          {reportLoading && <div>Calcul…</div>}
          {reportError && <div className="text-red-700 bg-red-50 border rounded p-2">{reportError}</div>}
          {reportMeta && mode === "day" && (
            <div className="bg-secondary/40 border rounded p-2">
              {statusFilter==="used" ? <>Ont mangé: <b>{reportMeta.used || 0}</b></> : <>Pas encore mangé: <b>{reportMeta.unused || 0}</b></>}
            </div>
          )}
          {reportMeta && mode === "week" && (
            <div className="bg-secondary/40 border rounded p-2">
              Étudiants uniques sur la semaine: <b>{reportMeta.unique || 0}</b>
            </div>
          )}
          {reportMeta && mode === "month" && (
            <div className="bg-secondary/40 border rounded p-2">
              Étudiants uniques sur le mois: <b>{reportMeta.unique || 0}</b>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary">
            <tr className="text-left">
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Établissement</th>
              {mode === "all" && <th className="px-3 py-2 w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(mode === "all" ? (status === "loading") : reportLoading) && (
              <tr><td className="px-3 py-3" colSpan={5}>Chargement…</td></tr>
            )}
            {currentRows.length === 0 && !(mode === "all" ? (status === "loading") : reportLoading) && (
              <tr><td className="px-3 py-3" colSpan={5}>Aucun résultat</td></tr>
            )}
            {currentRows.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">{s.matricule}</td>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2">{s.email ?? "—"}</td>
                <td className="px-3 py-2">{s.etablissement?.name ?? "—"}</td>
                {mode === "all" && (
                  <td className="px-3 py-2">
                    <button onClick={() => d(deleteStudent(s.id))} className="text-red-600 hover:text-red-800">Supprimer</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination only for "Tous" */}
      {mode === "all" && (
        <div className="flex items-center justify-between text-sm">
          <span>Total: {total}</span>
          <div className="flex gap-2">
            <button onClick={prev} disabled={page <= 1} className="px-3 py-1 rounded-md border disabled:opacity-50">Préc.</button>
            <span>Page {page}</span>
            <button onClick={next} disabled={page * pageSize >= total} className="px-3 py-1 rounded-md border disabled:opacity-50">Suiv.</button>
          </div>
        </div>
      )}
    </div>
  );
}
