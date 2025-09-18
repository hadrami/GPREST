// src/pages/mealplans/MealPlansList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listMealPlans } from "../../lib/mealplans.api";
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { useSelector } from "react-redux";
// Use the same helper path you use in Persons list
import { apiListEstablishments, apiGetEstablishment } from "../../lib/establishments.api";

const MEALS = [
  { key: "",               label: "Tous les repas" },
  { key: "PETIT_DEJEUNER", label: "Petit déjeuner" },
  { key: "DEJEUNER",       label: "Déjeuner" },
  { key: "DINER",          label: "Dîner" },
];
const TYPES = [
  { key: "",        label: "Tous types" },
  { key: "STUDENT", label: "Étudiant" },
  { key: "STAFF",   label: "Personnel" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map((m) => [m.key, m.label]));
const APP_GREEN = "bg-emerald-500"; // app green accent (adjust if you have a custom class)

function iso(d) {
  try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d || ""); }
}

// Simple inline funnel icon (swap if you prefer your icon set)
const FunnelIcon = (props) => (
  <svg viewBox="0 0 24 24" width={20} height={20} {...props}>
    <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6l-6.8 9.06V20a1 1 0 0 1-1.45.9l-3-1.5A1 1 0 0 1 9 18v-3.34L2.2 6.6A1 1 0 0 1 3 5z" />
  </svg>
);

function acronymFromStrictName(name) {
  const key = String(name || "").replace(/\s+/g, "");
  if (key === "InstitutPréparatoireauxGrandesEcolesd'Ingénieurs(IPGEI)") return "IPGEI";
  if (key === "InstitutSupérieurdesMétiersdelaStatistique(ISMS)")        return "ISMS";
  if (key === "InstitutSupérieurdesMétiersdel'Energie(ISME)")            return "ISME";
  if (key === "EcoleSupérieurePolytechnique(ESP)")                        return "ESP";

}

// Mobile bottom sheet that exposes the SAME filters as desktop
function MobileFiltersSheet({
  open,
  onClose,
  meal, setMeal,
  establishmentId, setEstablishmentId,
  personType, setPersonType,
  order, setOrder,
  establishmentOptions,
  estabsLoading,
  onApply,
  isManager
}) {
  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4 transition-transform
        ${open ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="h-1 w-12 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filtres</h3>

        <div className="space-y-3">
          {/* Meal */}
          <div>
            <label className="text-xs text-gray-600">Repas</label>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {MEALS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Establishment */}
          <div>
            <label className="text-xs text-gray-600">Établissement</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={establishmentId}
              onChange={(e)=>setEstablishmentId(e.target.value)}
              disabled={isManager || estabsLoading}
              title={isManager ? "Verrouillé sur votre établissement" : "Établissement"}
            >
              {establishmentOptions.map((o) => (
                <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={personType}
              onChange={(e) => setPersonType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Order (if needed) */}
          <div>
            <label className="text-xs text-gray-600">Ordre</label>
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="desc">Plus récents</option>
              <option value="asc">Plus anciens</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { onApply(); onClose(); }}
              className="flex-1 rounded-xl px-4 py-2 bg-emerald-600 text-white font-medium"
            >
              Appliquer
            </button>
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 border"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MealPlansList() {
  // server data (raw rows page by page)
  const [items, setItems]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pageSize]          = useState(20);

  // filters (auto-apply; no buttons)
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ]                   = useState("");
  const [meal, setMeal]             = useState("");
  const [fromDate, setFromDate]     = useState(today);
  const [toDate, setToDate]         = useState(today);
  const [establishmentId, setEstablishmentId] = useState(""); // dropdown value ("" = all)
  const [personType, setPersonType] = useState("");            // STUDENT | STAFF | ""
  const [order, setOrder]           = useState("desc");

  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);

  // UI: expand per person
   const [open, setOpen] = useState(() => new Set()); // keep structure

  // Establishments list (for select) — same approach as Persons list (+ fallback)
  const [estabs, setEstabs]               = useState([]);
  const [estabsLoading, setEstabsLoading] = useState(true);
  const [estabsError, setEstabsError]     = useState(null);

  // Mobile filters visibility
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // debounce to avoid hammering the API
  const debounceRef = useRef(null);

  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const isManager = roleUC === "MANAGER";
  const managerEstId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";
console.log("managerEstId =", managerEstId);
  const [managerEstName, setManagerEstName] = useState("");    // exact name from API
  const [managerEstAcr, setManagerEstAcr]   = useState("—");   // acronym from that name

  // ----- Fetch establishments once -----
  useEffect(() => {
    const run = async () => {
      setEstabsLoading(true);
      setEstabsError(null);
      try {
        const { data } = await apiListEstablishments({ page: 1, pageSize: 1000 });
        const items = Array.isArray(data?.items) ? data.items : [];
        const sorted = items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEstabs(sorted);
      } catch (e) {
        setEstabsError(e?.response?.data?.message || e.message || "Erreur établissements");
      } finally {
        setEstabsLoading(false);
      }
    };
    run();
  }, []);

  // ----- Fetch page of mealplans from server (server-side filters) -----
  async function fetchData({ resetPage = false } = {}) {
    setLoading(true); setErr(null);
    try {
      const { data } = await listMealPlans({
        search: q,
        meal,
        from: fromDate || "",
        to: toDate || "",
        establishmentId: establishmentId || "",
        type: personType || "",
        page: resetPage ? 1 : page,
        pageSize,
        order: order || "desc",
      });
      setItems(data.items || []);
      setTotal(Number(data.total || 0));
      if (resetPage) setPage(1);

      // Fallback: if establishments API returned nothing, derive unique from results
      if ((!estabs || estabs.length === 0) && Array.isArray(data.items)) {
        const uniq = new Map();
        for (const it of data.items) {
          const e = it?.person?.establishment;
          if (e?.id && !uniq.has(e.id)) uniq.set(e.id, { id: e.id, name: e.name || "—" });
        }
        if (uniq.size > 0) setEstabs(Array.from(uniq.values()).sort((a,b)=> (a.name||"").localeCompare(b.name||"")));
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  // initial + on page change
  useEffect(() => { fetchData();  }, [page, pageSize]);

  // auto-apply: debounce when key filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData({ resetPage: true }), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line
  }, [q, meal, fromDate, toDate, establishmentId, personType, order]);

  // ----- Group by person (matricule) -----
  const grouped = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const p = it.person || {};
      const pid = p.id || p.matricule || `P-${Math.random()}`;
      if (!m.has(pid)) {
        m.set(pid, {
          personId: pid,
          person: {
            id: p.id,
            matricule: p.matricule,
            name: p.name,
            type: p.type || "—",
            establishment: p.establishment?.name || "—",
          },
          rows: [],
        });
      }
      m.get(pid).rows.push({
        id: it.id,
        date: it.date,
        meal: it.meal,
      });
    }
    const arr = Array.from(m.values());
    arr.forEach((g) => {
      g.rows.sort((a, b) => {
        const da = iso(a.date), db = iso(b.date);
        if (da === db) return (a.meal || "").localeCompare(b.meal || "");
        return da.localeCompare(db);
      });
    });
    arr.sort((a, b) => {
      const an = a.person.name || "", bn = b.person.name || "";
      if (an && bn && an !== bn) return an.localeCompare(bn);
      return (a.person.matricule || "").localeCompare(b.person.matricule || "");
    });
    return arr;
  }, [items]);

  function previewBadges(rows) {
    const first = rows.slice(0, 3).map((r) => `${iso(r.date)} – ${MEAL_LABELS[r.meal] || r.meal}`);
    const extra = rows.length > 3 ? ` +${rows.length - 3}` : "";
    return first.join(" • ") + extra;
  }

  // Build select options ('' = all) and ensure manager’s establishment is present
  const establishmentOptions = useMemo(() => {
    const base = [{ id: "", name: "Tous les établissements" }, ...estabs];
    if (isManager && managerEstId) {
      const hasIt = base.some(o => String(o.id) === String(managerEstId));
      if (!hasIt && managerEstName) {
        base.push({ id: String(managerEstId), name: managerEstName });
      }
    }
    return base;
  }, [estabs, isManager, managerEstId, managerEstName]);

  // LOCK the select for MANAGER & prefill it
  useEffect(() => {
    let cancel = false;
    async function run() {
      if (isManager && managerEstId) {
        setEstablishmentId(String(managerEstId));
        try {
          const { data } = await apiGetEstablishment(managerEstId); // /establishments/:id
          if (cancel) return;
          const name = data?.name || "";
          setManagerEstName(name);
          setManagerEstAcr(acronymFromStrictName(name));
        } catch {
          if (!cancel) {
            setManagerEstName("");
            setManagerEstAcr("—");
          }
        }
      }
    }
    run();
    return () => { cancel = true; };
  }, [isManager, managerEstId]);

  // Current selection object (for name subtitle & acronym when not manager)
  const currentEstObj =
    establishmentOptions?.find(o => String(o.id || "") === String(establishmentId || "")) || null;

  const currentAcronym = isManager
    ? managerEstAcr
    : acronymFromStrictName(currentEstObj?.name);

  const currentEstName = isManager
    ? (managerEstName || currentEstObj?.name || "")
    : (currentEstObj?.name || "Tous les établissements");

  // ----- Export ALL results (fetch all pages; apply same filters; CSV) -----
  async function exportAll() {
    try {
      const all = [];
      const PAGE = 1000;
      let p = 1, fetched = 0, grandTotal = null;

      for (;;) {
        const { data } = await listMealPlans({
          search: q,
          meal,
          from: fromDate || "",
          to: toDate || "",
          establishmentId: establishmentId || "",
          type: personType || "",
          page: p,
          pageSize: PAGE,
          order: order || "desc",
        });
        const chunk = data.items || [];
        all.push(...chunk);
        fetched += chunk.length;
        grandTotal = grandTotal ?? (data.total || 0);
        if (chunk.length === 0 || fetched >= grandTotal) break;
        p++;
      }

      const title = `Plans de repas — ${currentAcronym || "Tous établissements"} — ${iso(fromDate)} → ${iso(toDate)}`;

      const headers = ["Date","Repas","Matricule","Nom","Type","Établissement"];
      const lines = [];
      lines.push(`"${title.replaceAll(`"`, `""`)}"`);
      lines.push("");
      lines.push(headers.join(","));

      for (const it of all) {
        const pp = it.person || {};
        const row = [
          iso(it.date),
          (MEAL_LABELS[it.meal] || it.meal || "").replaceAll(",", " "),
          (pp.matricule || "").replaceAll(",", " "),
          (pp.name || "").replaceAll(",", " "),
          (pp.type || "—").replaceAll(",", " "),
          (pp.establishment?.name || "—").replaceAll(",", " "),
        ];
        lines.push(row.map((s) => `"${String(s ?? "").replaceAll(`"`, `""`)}"`).join(","));
      }

      // Filename: remove the eslint "useless escape" warning by keeping regex simple
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const safeTitle = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]+/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");

      const csvText = "\uFEFF" + lines.join("\n");
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle || "mealplans-export"}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Export échoué");
    }
  }

  const applyFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    fetchData({ resetPage: true });
  };

  return (
    <div className="p-4 space-y-4">
      {isManager && (
        <div className="mb-3 text-xs text-slate-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          Ces listes et statistiques sont limitées à votre établissement ({acronymFromStrictName(managerEstName)}).
        </div>
      )}

      {/* ===== Mobile: top bar with search + filter button ===== */}
      <div className="md:hidden flex items-center gap-2">
        <div className="flex-1 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          className="md:hidden inline-flex items-center justify-center rounded-lg border px-3 py-2"
          aria-label="Filtres"
          onClick={() => setMobileFiltersOpen(true)}
        >
          <FunnelIcon />
        </button>
      </div>

      {/* ===== Mobile: prominent date range ===== */}
      <div className="md:hidden grid grid-cols-2 gap-2">
        <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Du</span>
          <input
            type="date"
            className="mt-1 text-base sm:text-lg font-semibold text-emerald-900 bg-transparent outline-none"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Au</span>
          <input
            type="date"
            className="mt-1 text-base sm:text-lg font-semibold text-emerald-900 bg-transparent outline-none"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
      </div>

      {/* ===== Title with acronym + subtitle with establishment name ===== */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Choix de repas
            {currentAcronym && currentAcronym !== "—" && (
              <span className="ml-2 align-middle inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-[2px] text-xs border border-emerald-200">
                {currentAcronym}
              </span>
            )}
          </h1>
          <div className="text-sm text-slate-500">
            {currentEstName || "Tous les établissements"}
          </div>
        </div>
        {/* one-click export (desktop shows this in the filter bar too) */}
      </div>

      {/* ===== Desktop filters bar ===== */}
      <div className="hidden md:grid gap-2 md:grid-cols-7">
        {/* Search */}
        <div className="flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Date range (desktop) */}
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          title="Date de début"
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          title="Date de fin"
        />

        {/* Meal */}
        <select className="border rounded px-3 py-2" value={meal} onChange={(e) => setMeal(e.target.value)}>
          {MEALS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>

        {/* Establishment (populated, locked for manager) */}
        <select
          className="border rounded px-3 py-2"
          value={establishmentId}
          onChange={(e)=>setEstablishmentId(e.target.value)}
          disabled={estabsLoading || isManager}
          title={isManager ? "Verrouillé sur votre établissement" : "Établissement"}
        >
          {establishmentOptions.map((o) => (
            <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
          ))}
        </select>

        {/* Type */}
        <select className="border rounded px-3 py-2" value={personType} onChange={(e) => setPersonType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        {/* Export (desktop) */}
        <button
          onClick={exportAll}
          title="Exporter tous les résultats (CSV)"
          className="inline-flex items-center gap-1 px-2 py-2 rounded hover:bg-emerald-50"
        >
          <ArrowDownTrayIcon className="w-5 h-5 text-emerald-600" />
        </button>
      </div>

      {/* Status / errors */}
      {estabsError && <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Impossible de charger les établissements depuis l’API. La liste se remplit automatiquement à partir des résultats ci-dessous.
      </div>}
      {err && <div className="text-red-600">{err}</div>}
      {loading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : grouped.length === 0 ? (
        <div className="text-slate-500">Aucun résultat.</div>
      ) : (
        <>
          {/* Desktop table (grouped by person) */}
          <div className="hidden md:block overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2 w-10"></th>
                  <th className="text-left p-2">Matricule</th>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Établissement</th>
                  <th className="text-left p-2">Aperçu (date • repas)</th>
                  <th className="text-left p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((grp) => {
                  const pid = grp.personId;
                  const isOpen = open.has(pid);
                  return (
                    <React.Fragment key={pid}>
                      <tr className="border-t">
                        <td className="p-2 align-top">
                          <button
                            onClick={() => {
                              const n = new Set(open);
                              if (n.has(pid)) n.delete(pid); else n.add(pid);
                              setOpen(n);
                            }}
                            className="hover:opacity-80"
                            title={isOpen ? "Réduire" : "Développer"}
                          >
                            {isOpen ? (
                              <ChevronDownIcon className="w-5 h-5 text-slate-600" />
                            ) : (
                              <ChevronRightIcon className="w-5 h-5 text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="p-2 align-top">{grp.person.matricule}</td>
                        <td className="p-2 align-top">{grp.person.name}</td>
                        <td className="p-2 align-top">{grp.person.type}</td>
                        <td className="p-2 align-top">{grp.person.establishment}</td>
                        <td className="p-2 align-top text-slate-600">{previewBadges(grp.rows)}</td>
                        <td className="p-2 align-top">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-[2px] text-xs border border-emerald-200">
                            {grp.rows.length}
                          </span>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={7} className="px-2 py-2">
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="text-left">
                                    <th className="px-2 py-1">Date</th>
                                    <th className="px-2 py-1">Repas</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {grp.rows.map((r) => (
                                    <tr key={r.id} className="border-t">
                                      <td className="px-2 py-1">{iso(r.date)}</td>
                                      <td className="px-2 py-1">{MEAL_LABELS[r.meal] || r.meal}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid gap-3">
            {grouped.map((grp) => {
              const pid = grp.personId;
              const isOpen = open.has(pid);
              return (
                <article
                  key={pid}
                  className="relative rounded-2xl bg-white shadow-lg shadow-slate-200/70 ring-1 ring-slate-200 p-4 transition-transform duration-150 active:scale-[0.99]"
                >
                  {/* Green accent bar */}
                  <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-2xl ${APP_GREEN}`} />
                  <div className="flex items-start justify-between">
                    <div className="pr-2">
                      <div className="font-medium text-slate-900">
                        {grp.person.name || "—"}{" "}
                        <span className="text-slate-500">• {grp.person.matricule}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {grp.person.type} • {grp.person.establishment}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {previewBadges(grp.rows)}
                      </div>
                    </div>

                    {/* total badge */}
                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-xs border border-emerald-200">
                      {grp.rows.length}
                    </span>

                    <button
                      onClick={() => {
                        const n = new Set(open);
                        if (n.has(pid)) n.delete(pid); else n.add(pid);
                        setOpen(n);
                      }}
                      title={isOpen ? "Réduire" : "Développer"}
                      className="ml-3 -mr-1 p-1 rounded-md hover:bg-slate-50 active:bg-slate-100"
                    >
                      {isOpen ? (
                        <ChevronDownIcon className="w-6 h-6 text-slate-600" />
                      ) : (
                        <ChevronRightIcon className="w-6 h-6 text-slate-600" />
                      )}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-1">
                      {grp.rows.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="text-sm">
                            <div className="font-medium text-slate-800">{iso(r.date)}</div>
                            <div className="text-slate-600">{MEAL_LABELS[r.meal] || r.meal}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* ===== Mobile filters sheet ===== */}
      <MobileFiltersSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        meal={meal} setMeal={setMeal}
        establishmentId={establishmentId} setEstablishmentId={setEstablishmentId}
        personType={personType} setPersonType={setPersonType}
        order={order} setOrder={setOrder}
        establishmentOptions={establishmentOptions}
        estabsLoading={estabsLoading}
        onApply={applyFilters}
        isManager={isManager}
      />
    </div>
  );
}
