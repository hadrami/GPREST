// src/pages/mealplans/MealPlansList.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMealPlans, deleteMealPlan } from "../../lib/mealplans.api";
import {
  EyeIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

const MEALS = [
  { key: "",                 label: "Tous les repas" },
  { key: "PETIT_DEJEUNER",   label: "Petit déjeuner" },
  { key: "DEJEUNER",         label: "Déjeuner" },
  { key: "DINER",            label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map(m => [m.key, m.label]));

export default function MealPlansList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // filters (default loads ALL – mode=all)
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("all"); // all | day | week | month
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [meal, setMeal] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [selected, setSelected] = useState(null); // modal

  async function fetchData() {
    setLoading(true); setErr(null);
    try {
      const { data } = await listMealPlans({ search: q, meal, mode, date, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [page, pageSize]);


  function applyFilters(e) {
    e?.preventDefault?.();
    setPage(1);
    fetchData();
  }

  function resetFilters() {
    setQ(""); setMeal(""); setMode("all"); setDate(new Date().toISOString().slice(0,10));
    setPage(1); fetchData();
  }

  async function onDelete(id) {
    if (!window.confirm("Supprimer ce choix de repas ?")) return;
    try {
      await deleteMealPlan(id);
      fetchData();
    } catch (e) {
      alert(e?.response?.data?.message || e.message);
    }
  }

  function currentFilterLine() {
  const labelMeal = MEAL_LABELS[meal] || (meal || "Tous");
  const modeLabel = { all: "Tout", day: "Jour", week: "Semaine", month: "Mois" }[mode];
  return `Mode: ${modeLabel} • Date: ${date} • Repas: ${labelMeal} • Recherche: ${q || "—"}`;
}

function rowsForExport() {
  return items.map(it => {
    const p = it.person || {};
    return {
      Date: new Date(it.date).toISOString().slice(0,10),
      Repas: MEAL_LABELS[it.meal] || it.meal,
      Matricule: p.matricule || "",
      Nom: p.name || "",
      Établissement: p.establishment?.name || "—",
    };
  });
}

async function exportMealPlansPDF() {
  const rows = rowsForExport();
  try {
    const { jsPDF } = await import("jspdf");
    await import("jspdf-autotable");

    const doc = new jsPDF({ unit: "pt" });
    const headerBg = [240, 247, 255];
    const headerTxt = [30, 64, 175];

    doc.setFontSize(18);
    doc.setTextColor(...headerTxt);
    doc.text("Liste des choix de repas", 40, 48);

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(currentFilterLine(), 40, 68);

    if (rows.length) {
      const head = [Object.keys(rows[0])];
      const body = rows.map(r => Object.values(r));
      // @ts-ignore
      doc.autoTable({
        head, body,
        startY: 90,
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: {
          fillColor: headerBg, textColor: headerTxt,
          lineWidth: 0.2, lineColor: [210,210,210], fontStyle: "bold",
        },
        bodyStyles: {
          fillColor: [255,255,255], textColor: [55,65,81],
          lineColor: [228,228,231], lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: [249,250,251] },
        margin: { left: 40, right: 40 },
      });
    } else {
      doc.setFontSize(12);
      doc.text("Aucun résultat.", 40, 100);
    }

    doc.save(`mealplans_${date}.pdf`);
  } catch {
    window.print();
  }
}


  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Choix de repas</h1>

      {/* Filters bar */}
      <form onSubmit={applyFilters} className="grid gap-2 md:grid-cols-5">
        <div className="flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…) "
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
        </div>

        <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />

        <div className="flex items-center gap-1">
          {["all","day","week","month"].map(m => (
            <button
              key={m}
              type="button"
              onClick={()=>setMode(m)}
              className={`px-3 py-2 rounded border ${mode===m ? "bg-primary text-white border-primary" : ""}`}
            >
              {{all:"Tout",day:"Jour",week:"Semaine",month:"Mois"}[m]}
            </button>
          ))}
        </div>

        <select className="border rounded px-3 py-2" value={meal} onChange={(e)=>setMeal(e.target.value)}>
          {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>

        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-primary text-white" type="submit">Appliquer</button>
          <button className="px-3 py-2 rounded border" type="button" onClick={resetFilters}>Réinitialiser</button>
         <button type="button"
  onClick={exportMealPlansPDF}
  className="px-3 py-2 rounded border hover:bg-slate-50">
  Exporter PDF
</button>

          </div>
      </form>

      {/* Content */}
      {err && <div className="text-red-600">{err}</div>}
      {loading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500">Aucun résultat.</div>
      ) : (
        <>
          {/* Desktop table with icon actions */}
          <div className="hidden md:block overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Repas</th>
                  <th className="text-left p-2">Matricule</th>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Établissement</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const p = it.person || {};
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{new Date(it.date).toISOString().slice(0,10)}</td>
                      <td className="p-2">{MEAL_LABELS[it.meal] || it.meal}</td>
                      <td className="p-2">{p.matricule}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">{p.establishment?.name || "—"}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-3">
                          <button title="Voir" onClick={()=>setSelected({ plan: it, person: p })}>
                            <EyeIcon className="w-5 h-5 text-blue-600" />
                          </button>
                          <button title="Supprimer" onClick={()=>onDelete(it.id)}>
                            <TrashIcon className="w-5 h-5 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {items.map((it) => {
              const p = it.person || {};
              return (
                <div key={it.id} className="border rounded p-3">
                  <div className="font-medium">{p.name || "—"} <span className="text-slate-500">• {p.matricule}</span></div>
                  <div className="text-sm text-slate-600">
                    {new Date(it.date).toISOString().slice(0,10)} • {MEAL_LABELS[it.meal] || it.meal}
                  </div>
                  <div className="text-sm">{p.establishment?.name || "—"}</div>
                  <div className="flex gap-4 pt-2">
                    <button title="Voir" onClick={()=>setSelected({ plan: it, person: p })}>
                      <EyeIcon className="w-5 h-5 text-blue-600" />
                    </button>
                    <button title="Supprimer" onClick={()=>onDelete(it.id)}>
                      <TrashIcon className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center pt-2">
            <div className="text-sm text-slate-600">
              Page {page} / {Math.max(1, Math.ceil(total / pageSize))} — {total} éléments
            </div>
            <div className="space-x-2">
              <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-3 py-1 border rounded disabled:opacity-50">Préc</button>
              <button disabled={page>=Math.max(1, Math.ceil(total / pageSize))} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 border rounded disabled:opacity-50">Suiv</button>
            </div>
          </div>
        </>
      )}

      {/* VIEW MODAL */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title="Détails du choix de repas">
          <Section title="Personne">
            <Item label="Matricule" value={selected.person?.matricule} />
            <Item label="Nom" value={selected.person?.name} />
            <Item label="Établissement" value={selected.person?.establishment?.name || "—"} />
          </Section>
          <Section title="Choix">
            <Item label="Date" value={new Date(selected.plan.date).toISOString().slice(0,10)} />
            <Item label="Repas" value={MEAL_LABELS[selected.plan.meal] || selected.plan.meal} />
          </Section>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Item({ label, value }) {
  return (
    <div className="flex justify-between gap-6 py-1">
      <div className="text-slate-500">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
        <div className="p-3 border-t text-right">
          <button onClick={onClose} className="px-3 py-2 rounded bg-primary text-white">Fermer</button>
        </div>
      </div>
    </div>
  );
}
