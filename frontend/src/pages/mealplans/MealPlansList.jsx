// src/pages/mealplans/MealPlansList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  listMealPlans,            // doit accepter: { search, meal, from, to, establishmentId, type, page, pageSize }
  deleteAllMealPlans,       // optionnel (toolbar)
} from "../../lib/mealplans.api";
import api from "../../lib/api";
import { apiListEstablishments } from "../../lib/establissments.api";

import {
  EyeIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,       // Réinitialiser
  ArrowUpTrayIcon,     // Importer
  ArrowDownTrayIcon,   // Export PDF
  TrashIcon,           // Effacer tout (conserve en toolbar, pas sur les lignes)
} from "@heroicons/react/24/outline";

const MEALS = [
  { key: "",                 label: "Tous les repas" },
  { key: "PETIT_DEJEUNER",   label: "Petit déjeuner" },
  { key: "DEJEUNER",         label: "Déjeuner" },
  { key: "DINER",            label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map((m) => [m.key, m.label]));

const PERSON_TYPES = [
  { value: "", label: "Tous les types" },
  { value: "student", label: "Étudiant" },
  { value: "staff", label: "Personnel" },
];

export default function MealPlansList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // --- Filtres (réactifs)
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [personType, setPersonType] = useState(""); // "student" | "staff" | ""
  const [from, setFrom] = useState("");             // YYYY-MM-DD
  const [to, setTo] = useState("");                 // YYYY-MM-DD

  // Établissements (chargés une fois depuis l’API pour avoir la liste complète)
  const [estabs, setEstabs] = useState([]);
  const [estabsLoading, setEstabsLoading] = useState(true);
  const [estabsError, setEstabsError] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [selected, setSelected] = useState(null); // modal
  const debounceRef = useRef(null);

  // --- Import (Excel)
  const [showImport, setShowImport] = useState(false);
  const [impFile, setImpFile] = useState(null);
  const [impKind, setImpKind] = useState("student"); // student | staff
  const [impBusy, setImpBusy] = useState(false);
  const [impError, setImpError] = useState(null);
  const [impSummary, setImpSummary] = useState(null);

  // ===== Helpers =====
  const typeParam =
    personType.toLowerCase() === "student"
      ? "STUDENT"
      : personType.toLowerCase() === "staff"
      ? "STAFF"
      : "";

  const fetchData = async ({ resetPage = false } = {}) => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await listMealPlans({
        search: q,
        meal,
        from: from || undefined,
        to: to || undefined,
        establishmentId: establishmentId || undefined,
        type: typeParam || undefined,
        page: resetPage ? 1 : page,
        pageSize,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (resetPage) setPage(1);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  // fetch ALL establishments once
  useEffect(() => {
    (async () => {
      setEstabsLoading(true);
      setEstabsError(null);
      try {
        const { data } = await apiListEstablishments({ page: 1, pageSize: 1000 });
        setEstabs(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        setEstabsError(e?.response?.data?.message || e.message);
      } finally {
        setEstabsLoading(false);
      }
    })();
  }, []);

  // initial fetch
  useEffect(() => {
    fetchData({ resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  // reactive search on any filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData({ resetPage: true });
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, meal, establishmentId, personType, from, to]);

  function resetFilters() {
    setQ("");
    setMeal("");
    setEstablishmentId("");
    setPersonType("");
    setFrom("");
    setTo("");
    fetchData({ resetPage: true });
  }

  async function submitImport(e) {
    e?.preventDefault?.();
    if (!impFile) return;
    const fd = new FormData();
    fd.append("file", impFile);
    fd.append("kind", impKind);
    try {
      setImpBusy(true);
      setImpError(null);
      setImpSummary(null);
      const { data } = await api.post("/plans/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImpSummary(data);
      await fetchData({ resetPage: true });
    } catch (e) {
      setImpError(e?.response?.data?.message || e.message);
    } finally {
      setImpBusy(false);
    }
  }

  async function eraseAll() {
    if (!window.confirm("⚠️ Cette action va SUPPRIMER TOUS les choix de repas. Continuer ?")) return;
    try {
      await deleteAllMealPlans();
      await fetchData({ resetPage: true });
      alert("Tous les choix de repas ont été supprimés.");
    } catch (e) {
      alert(e?.response?.data?.message || e.message);
    }
  }

  // ===== Export PDF =====
  function rowsForExport() {
    return items.map((it) => {
      const p = it.person || {};
      return {
        Date: new Date(it.date).toISOString().slice(0, 10),
        Repas: MEAL_LABELS[it.meal] || it.meal,
        Matricule: p.matricule || "",
        Nom: p.name || "",
        Établissement: p.establishment?.name || "—",
      };
    });
  }
  function criteriaLine() {
    const mealLabel = MEAL_LABELS[meal] || "Tous les repas";
    const range =
      from && to
        ? `du ${from} au ${to}`
        : from
        ? `à partir du ${from}`
        : to
        ? `jusqu'au ${to}`
        : "toute période";
    return `${meal ? mealLabel : "Tous les repas"} — ${range}${q ? ` — recherche: ${q}` : ""}`;
  }
  async function exportMealPlansPDF() {
    const rows = rowsForExport();
    try {
      const doc = new jsPDF({ unit: "pt" });
      const headerBg = [242, 248, 255];
      const headerTxt = [30, 64, 175];

      doc.setFontSize(18);
      doc.setTextColor(...headerTxt);
      doc.text("Liste des repas à consommer", 40, 48);

      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(criteriaLine(), 40, 68);

      if (rows.length) {
        const head = [Object.keys(rows[0])];
        const body = rows.map((r) => Object.values(r));
        autoTable(doc, {
          head,
          body,
          startY: 90,
          styles: { fontSize: 10, cellPadding: 6 },
          headStyles: {
            fillColor: headerBg,
            textColor: headerTxt,
            lineWidth: 0.2,
            lineColor: [210, 210, 210],
            fontStyle: "bold",
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: [55, 65, 81],
            lineColor: [228, 228, 231],
            lineWidth: 0.2,
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 40, right: 40 },
        });

        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        doc.text(`Total: ${rows.length}`, 40, doc.lastAutoTable.finalY + 22);
      } else {
        doc.setFontSize(12);
        doc.text("Aucun résultat.", 40, 100);
      }

      doc.save(`mealplans_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      alert("Export PDF: impossible de générer le fichier.\n" + (e?.message || e));
    }
  }

  // ===== UI =====
  const establishmentOptions = useMemo(() => {
    const opts = [{ id: "", name: "Tous les établissements" }];
    const sorted = [...estabs].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    sorted.forEach((e) => opts.push({ id: e.id, name: e.name || "—" }));
    return opts;
  }, [estabs]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Choix de repas</h1>

      {/* Barre de filtres (réactive) */}
      <div className="grid gap-2 md:grid-cols-6">
        {/* Texte */}
        <label className="md:col-span-2 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {/* Du / Au */}
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Du…"
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Au…"
        />

        {/* Repas */}
        <label className="flex items-center border rounded px-2">
          <select className="w-full py-2 bg-white outline-none" value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEALS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Établissement */}
        <label className="flex items-center border rounded px-2">
          <select
            className="w-full py-2 bg-white outline-none"
            value={establishmentId}
            onChange={(e) => setEstablishmentId(e.target.value)}
            disabled={estabsLoading}
          >
            {establishmentOptions.map((o) => (
              <option key={o.id || "all"} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        {/* Type de personne */}
        <label className="flex items-center border rounded px-2">
          <select
            className="w-full py-2 bg-white outline-none"
            value={personType}
            onChange={(e) => setPersonType(e.target.value)}
          >
            {PERSON_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Actions rapides */}
        <div className="md:col-span-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            title="Réinitialiser les filtres"
            className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
          >
            <ArrowPathIcon className="w-5 h-5 text-slate-700" />
          </button>

          {/* Import Excel */}
          <button
            type="button"
            title="Importer depuis Excel"
            onClick={() => {
              setShowImport(true);
              setImpFile(null);
              setImpSummary(null);
              setImpError(null);
            }}
            className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
          >
            <ArrowUpTrayIcon className="w-5 h-5 text-slate-700" />
          </button>

          {/* Export PDF */}
          <button
            type="button"
            onClick={exportMealPlansPDF}
            title="Exporter la liste en PDF"
            className="inline-flex items-center justify-center p-2 rounded-full border hover:bg-slate-50"
          >
            <ArrowDownTrayIcon className="w-5 h-5 text-slate-700" />
          </button>

          {/* Effacer tout — garde en toolbar, pas de suppression par ligne */}
          <button
            type="button"
            onClick={eraseAll}
            title="Effacer TOUTES les lignes"
            className="inline-flex items-center justify-center p-2 rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            <TrashIcon className="w-5 h-5" />
          </button>

          {estabsError && <span className="text-red-600 text-sm">{String(estabsError)}</span>}
        </div>
      </div>

      {/* Import dialog */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowImport(false)} />
          <div className="relative bg-white w-[min(560px,92vw)] rounded-2xl shadow-xl ring-1 ring-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Importer des choix de repas</h3>
              <button onClick={() => setShowImport(false)} className="text-slate-500 hover:text-slate-700">
                ✕
              </button>
            </div>

            <form onSubmit={submitImport} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <select className="px-3 py-2 rounded-md border" value={impKind} onChange={(e) => setImpKind(e.target.value)}>
                  <option value="student">Étudiants</option>
                  <option value="staff">Personnel</option>
                </select>

                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setImpFile(e.target.files?.[0] || null)}
                  className="px-3 py-2 rounded-md border w-full"
                />
              </div>

              {impError && <div className="text-red-700 bg-red-50 border rounded p-2">{impError}</div>}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!impFile || impBusy}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {impBusy ? "Importation…" : "Importer"}
                </button>
                <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 rounded-lg border hover:bg-slate-50">
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
                            <li key={idx}>{it.row ? `Ligne ${it.row}: ` : ""}{String(it.reason)}</li>
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

      {/* Contenu */}
      {err && <div className="text-red-600">{err}</div>}
      {loading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500">Aucun résultat.</div>
      ) : (
        <>
          {/* Table desktop (sans supprimer par ligne) */}
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
                      <td className="p-2">{new Date(it.date).toISOString().slice(0, 10)}</td>
                      <td className="p-2">{MEAL_LABELS[it.meal] || it.meal}</td>
                      <td className="p-2">{p.matricule}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">{p.establishment?.name || "—"}</td>
                      <td className="p-2">
                        <button title="Voir" onClick={() => setSelected({ plan: it, person: p })} className="hover:opacity-80">
                          <EyeIcon className="w-5 h-5 text-blue-600" />
                        </button>
                        {/* 🔕 suppression par ligne retirée */}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes mobile (sans supprimer par carte) */}
          <div className="md:hidden grid gap-3">
            {items.map((it) => {
              const p = it.person || {};
              const dateStr = new Date(it.date).toISOString().slice(0, 10);
              return (
                <article
                  key={it.id}
                  className="relative rounded-2xl bg-white shadow-lg shadow-slate-200/70 ring-1 ring-slate-200 p-4 transition-transform duration-150 active:scale-[0.99]"
                >
                  <div className="pointer-events-none absolute inset-x-0 -top-px h-1.5 rounded-t-2xl bg-gradient-to-r from-primary/80 via-accent/70 to-emerald-400" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold leading-5">{p.name || "—"}</div>
                      <div className="text-xs text-slate-500">Matricule • {p.matricule || "—"}</div>
                    </div>
                    <button
                      title="Voir"
                      onClick={() => setSelected({ plan: it, person: p })}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100"
                    >
                      <EyeIcon className="w-5 h-5" />
                    </button>
                    {/* 🔕 suppression par carte retirée */}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                      {dateStr}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      {MEAL_LABELS[it.meal] || it.meal}
                    </span>
                  </div>

                  <div className="mt-2 text-sm text-slate-700">{p.establishment?.name || "—"}</div>
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
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Préc
              </button>
              <button
                disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Suiv
              </button>
            </div>
          </div>
        </>
      )}

      {/* MODAL */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title="Détails du choix de repas">
          <Section title="Personne">
            <Item label="Matricule" value={selected.person?.matricule} />
            <Item label="Nom" value={selected.person?.name} />
            <Item label="Établissement" value={selected.person?.establishment?.name || "—"} />
          </Section>
          <Section title="Choix">
            <Item label="Date" value={new Date(selected.plan.date).toISOString().slice(0, 10)} />
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
