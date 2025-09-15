// src/pages/mealplans/MealPlansList.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { listMealPlans, deleteMealPlan, deleteAllMealPlans} from "../../lib/mealplans.api";
import  api  from "../../lib/api";
 import {
   EyeIcon,
   TrashIcon,
   MagnifyingGlassIcon,
   CheckCircleIcon,       // Appliquer
   ArrowPathIcon,         // Réinitialiser
   ArrowUpTrayIcon,
   ArrowDownTrayIcon,     // Exporter PDF
 } from "@heroicons/react/24/outline";

const MEALS = [
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
   // Import dialog state 
const [showImport, setShowImport] = useState(false);
const [impFile, setImpFile] = useState(null);
const [impKind, setImpKind] = useState("student"); // same as Import.jsx: student | staff
const [impBusy, setImpBusy] = useState(false);
const [impError, setImpError] = useState(null);
const [impSummary, setImpSummary] = useState(null);

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
 async function submitImport(e) {
  e?.preventDefault?.();
  if (!impFile) return;
  const fd = new FormData();
  fd.append("file", impFile);
  fd.append("kind", impKind);
  try {
    setImpBusy(true); setImpError(null); setImpSummary(null);
    const { data } = await api.post("/plans/import", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setImpSummary(data);
    // refresh list so new meal plans appear
    setPage(1);
    await fetchData();
  } catch (e) {
    setImpError(e?.response?.data?.message || e.message);
  } finally {
    setImpBusy(false);
  }
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


function criteriaLine() {
  const modeLabel = { all: "toute période", day: `le ${date}`, week: `semaine du ${date}`, month: `mois de ${date.slice(0,7)}` }[mode];
  const mealLabel = MEAL_LABELS[meal] || "Déjeuner";
  return `${meal ? mealLabel : "Déjeuner"} — ${modeLabel}${q ? ` — recherche: ${q}` : ""}`;
}

async function eraseAll() {
  if (!window.confirm("⚠️ Cette action va SUPPRIMER TOUS les choix de repas. Continuer ?")) return;
  try {
    await deleteAllMealPlans();
    setPage(1);
    fetchData();
    alert("Tous les choix de repas ont été supprimés.");
  } catch (e) {
    alert(e?.response?.data?.message || e.message);
  }
}


async function exportMealPlansPDF() {
  const rows = rowsForExport();
  try {
    const doc = new jsPDF({ unit: "pt" });
    const headerBg = [242, 248, 255];
    const headerTxt = [30, 64, 175];

    // Title + criteria
    doc.setFontSize(18);
    doc.setTextColor(...headerTxt);
    doc.text("Liste des repas à consommer", 40, 48);

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(criteriaLine(), 40, 68);

    // Data table (NO actions column)
    if (rows.length) {
      const head = [Object.keys(rows[0])];      // ["Date","Repas","Matricule","Nom","Établissement"]
      const body = rows.map(r => Object.values(r));
      autoTable(doc, {
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

      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(`Total: ${rows.length}`, 40, doc.lastAutoTable.finalY + 22);
    } else {
      doc.setFontSize(12);
      doc.text("Aucun résultat.", 40, 100);
    }

    doc.save(`mealplans_${date}.pdf`);
  } catch (e) {
    alert("Export PDF: impossible de générer le fichier.\n" + (e?.message || e));
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

       <div className="flex items-center gap-2">
   {/* Appliquer */}
   <button
     type="submit"
     title="Appliquer les filtres"
     className="inline-flex items-center justify-center p-2 rounded-full bg-primary text-white hover:opacity-90"
   >
     <CheckCircleIcon className="w-5 h-5" />
   </button>

   {/* Réinitialiser */}
   <button
     type="button"
     onClick={resetFilters}
     title="Réinitialiser les filtres"
     className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
   >
     <ArrowPathIcon className="w-5 h-5 text-slate-700" />
   </button>

     {/* Importer (Excel) */}
  <button
    type="button"
    title="Importer depuis Excel"
    onClick={() => { setShowImport(true); setImpFile(null); setImpSummary(null); setImpError(null); }}
    className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
  >
    <ArrowUpTrayIcon className="w-5 h-5 text-slate-700" />
  </button>



   {/* Exporter PDF */}
   <button
     type="button"
     onClick={exportMealPlansPDF}
     title="Exporter la liste en PDF"
     className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
   >
     <ArrowDownTrayIcon className="w-5 h-5 text-slate-700" />
   </button>

   {/* Effacer tout (danger) */}
   <button
     type="button"
     onClick={eraseAll}
     title="Effacer TOUTES les lignes"
     className="inline-flex items-center justify-center p-2 rounded-full bg-red-600 text-white hover:bg-red-700"
   >
     <TrashIcon className="w-5 h-5" />
   </button>
 </div>
      </form>
{/* Import dialog */}
{showImport && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40" onClick={()=>setShowImport(false)} />
    <div className="relative bg-white w-[min(560px,92vw)] rounded-2xl shadow-xl ring-1 ring-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Importer des choix de repas</h3>
        <button onClick={()=>setShowImport(false)} className="text-slate-500 hover:text-slate-700">✕</button>
      </div>
      <p className="text-sm text-slate-600 mb-3">
        Fichier Excel <b>.xlsx</b> avec une colonne <b>Matricule</b> et des colonnes de repas
        (format identique à l’import existant).
      </p>

      <form onSubmit={submitImport} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="px-3 py-2 rounded-md border"
            value={impKind}
            onChange={(e)=>setImpKind(e.target.value)}
          >
            <option value="student">Étudiants</option>
            <option value="staff">Personnel</option>
          </select>

          <input
            type="file"
            accept=".xlsx"
            onChange={(e)=>setImpFile(e.target.files?.[0] || null)}
            className="px-3 py-2 rounded-md border w-full"
          />
        </div>

        {impError && (
          <div className="text-red-700 bg-red-50 border rounded p-2">{impError}</div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!impFile || impBusy}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {impBusy ? "Importation…" : "Importer"}
          </button>
          <button
            type="button"
            onClick={()=>setShowImport(false)}
            className="px-4 py-2 rounded-lg border hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>

        {impSummary && (
          <div className="mt-2 rounded-md border bg-white">
            <div className="p-3 border-b font-medium">Résumé</div>
            <div className="p-3 text-sm">
              <div>Créés: <b>{impSummary.created || 0}</b></div>
              <div>Mis à jour: <b>{impSummary.updated || 0}</b></div>
              {Array.isArray(impSummary.issues) && impSummary.issues.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer">Problèmes ({impSummary.issues.length})</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {impSummary.issues.slice(0, 50).map((it, idx) => (
                      <li key={idx}>
                        {it.row ? `Ligne ${it.row}: ` : ""}{String(it.reason)}
                      </li>
                    ))}
                    {impSummary.issues.length > 50 && <li>… et {impSummary.issues.length - 50} autres</li>}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  </div>
)}

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
<div className="md:hidden grid gap-3">
  {items.map((it) => {
    const p = it.person || {};
    const dateStr = new Date(it.date).toISOString().slice(0,10);
    return (
      <article
        key={it.id}
        className="
          relative rounded-2xl bg-white
          shadow-lg shadow-slate-200/70
          ring-1 ring-slate-200
          p-4
          transition-transform duration-150
          active:scale-[0.99]
        "
      >
        {/* tiny gradient accent to give depth */}
        <div className="pointer-events-none absolute inset-x-0 -top-px h-1.5 rounded-t-2xl bg-gradient-to-r from-primary/80 via-accent/70 to-emerald-400" />

        {/* header row: name + matricule */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold leading-5">{p.name || "—"}</div>
            <div className="text-xs text-slate-500">Matricule&nbsp;•&nbsp;{p.matricule || "—"}</div>
          </div>

          {/* actions as compact icon buttons */}
          <div className="flex items-center gap-2">
            <button
              title="Voir"
              onClick={()=>setSelected({ plan: it, person: p })}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100"
            >
              <EyeIcon className="w-5 h-5" />
            </button>
            <button
              title="Supprimer"
              onClick={()=>onDelete(it.id)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* info row: date + meal as pills */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
            {dateStr}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            {MEAL_LABELS[it.meal] || it.meal}
          </span>
        </div>

        {/* establishment */}
        <div className="mt-2 text-sm text-slate-700">
          {p.establishment?.name || "—"}
        </div>
      </article>
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
