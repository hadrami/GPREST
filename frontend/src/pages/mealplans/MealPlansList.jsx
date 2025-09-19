// src/pages/mealplans/MealPlansList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listMealPlans } from "../../lib/mealplans.api";
import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { useSelector } from "react-redux";
import {
  apiListEstablishments,
  apiGetEstablishment,
} from "../../lib/establishments.api"; // unified (list + byId)

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

// Mobile bottom sheet — mirrors desktop filters (Établissement hidden for MANAGER)
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
  isManager,
}) {
  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4 transition-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="h-1 w-12 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filtres</h3>

        <div className="space-y-3">
          {/* Repas */}
          <div>
            <label className="text-xs text-gray-600">Repas</label>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {MEALS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Établissement — hidden for MANAGER on mobile */}
          {!isManager && (
            <div>
              <label className="text-xs text-gray-600">Établissement</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
                disabled={estabsLoading}
                title="Établissement"
              >
                {establishmentOptions.map((o) => (
                  <option key={o.id || "all"} value={o.id || ""}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type */}
          <div>
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={personType}
              onChange={(e) => setPersonType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ordre */}
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
              onClick={() => {
                onApply();
                onClose();
              }}
              className="flex-1 rounded-xl px-4 py-2 bg-emerald-600 text-white font-medium"
            >
              Appliquer
            </button>
            <button onClick={onClose} className="rounded-xl px-4 py-2 border">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MealPlansList() {
  // Auth / role
  const { user } = useSelector((s) => s.auth);
  const isManager = String(user?.role || "").toUpperCase() === "MANAGER";
  const managerEstId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";

  // server data
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // filters
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [establishmentId, setEstablishmentId] = useState("");
  const [personType, setPersonType] = useState("");
  const [order, setOrder] = useState("desc");

  // establishments
  const [estabs, setEstabs] = useState([]);
  const [estabsLoading, setEstabsLoading] = useState(true);
  const [managerEstName, setManagerEstName] = useState(null);


  // mobile filters
  const [mobileOpen, setMobileOpen] = useState(false);

  // debounce
  const debounceRef = useRef(null);

async function fetchAllEstablishments() {
  const pageSize = 500;
  let page = 1, all = [];
  while (true) {
    const { data } = await apiListEstablishments({ page, pageSize });
    const items = Array.isArray(data?.items) ? data.items : [];
    all.push(...items);
    const total = Number(data?.total ?? all.length);
    if (all.length >= total || items.length < pageSize) break;
    page++;
  }
  // sort by name for stable UI
  const arr = Array.isArray(all) ? all : [];
return arr
  .map(x => ({ id: x?.id, name: typeof x?.name === "string" ? x.name : String(x?.name ?? "—") }))
  .sort((a, b) => a.name.localeCompare(b.name));

}
  // ---- Establishments list
 useEffect(() => {
   const run = async () => {
     try { setEstabs(await fetchAllEstablishments()); }
     catch { setEstabs([]); }
     finally { setEstabsLoading(false); }
   };
   run();
 }, []);




  // manager: lock id + fetch name (works for mobile too)
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!(isManager && managerEstId && user)) return;
      setEstablishmentId(String(managerEstId)); // lock queries
      try {
        const { data } = await apiGetEstablishment(String(managerEstId));
        if (!cancel) setManagerEstName(data?.name || null);
      } catch {
        if (!cancel) setManagerEstName(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isManager, managerEstId, user]); // ensure it re-runs when auth finishes  :contentReference[oaicite:1]{index=1}

  // load data
  const fetchPage = async (p = 1) => {
    const params = {
      search: q,
      meal,
      type: personType,
      order,
      from: fromDate || "",
      to: toDate || "",
      establishmentId: isManager ? managerEstId : (establishmentId || ""),
      page: p,
      pageSize,
    };
    const { data } = await listMealPlans(params);
    const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    setItems(arr);
    setTotal(Number(data?.total ?? arr.length ?? 0));
    setPage(p);
  };

  // initial
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reactive reload
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(1), 250);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, meal, personType, order, establishmentId, fromDate, toDate, isManager, managerEstId]);

  // options + current name for title
  const establishmentOptions = useMemo(
    () => [{ id: "", name: "Tous les établissements" }, ...estabs],
    [estabs]
  );

  const currentEstName = useMemo(() => {
    if (isManager) return managerEstName ?? "Chargement…";
    const match = establishmentOptions.find(
      (o) => String(o.id || "") === String(establishmentId || "")
    );
    return match?.name || "Tous les établissements";
  }, [isManager, managerEstName, establishmentOptions, establishmentId]);

  // simple export (kept)
  const exportCsv = () => {
    const rows = [
      ["Date", "Type", "Repas", "Matricule", "Nom", "Etablissement"],
      ...items.map((it) => [
        it.date || "",
        it.personType || "",
        MEAL_LABELS[it.meal] || it.meal || "",
        it.person?.matricule || "",
        it.person?.name || "",
        it.person?.establishment?.name || "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mealplans.csv";
    a.click();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Repas planifiés</h1>
        <button
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          onClick={exportCsv}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Exporter
        </button>
      </div>

      {/* Subtitle: scope line */}
      {isManager ? (
        <div className="text-sm text-slate-600">
          Résultats pour l’établissement :{" "}
          <span className="font-medium text-primary">{currentEstName}</span>
        </div>
      ) : (
        <div className="text-sm text-slate-500">{currentEstName}</div>
      )}

      {/* ===== Mobile: search + dates always visible ===== */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
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
            className="inline-flex items-center justify-center rounded-lg border px-3 py-2"
            aria-label="Filtres"
            onClick={() => setMobileOpen(true)}
          >
            {/* small funnel icon */}
            <svg viewBox="0 0 24 24" width={20} height={20}>
              <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6l-6.8 9.06V20a1 1 0 0 1-1.45.9l-3-1.5A1 1 0 0 1 9 18v-3.34L2.2 6.6A1 1 0 0 1 3 5z" />
            </svg>
          </button>
        </div>

        {/* mobile date range */}
        <div className="grid grid-cols-2 gap-2">
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
      </div>

      {/* ===== Desktop toolbar ===== */}
      <div className="hidden md:flex items-end gap-3 flex-wrap">
        {/* Search */}
        <label className="flex items-center gap-2 border rounded px-2">
          <MagnifyingGlassIcon className="h-4 w-4 text-slate-500" />
          <input
            className="px-1 py-2 outline-none"
            placeholder="Rechercher (matricule, nom…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {/* Dates */}
        <div>
          <label className="text-xs text-gray-600">Du</label>
          <input
            type="date"
            className="block border rounded px-3 py-2"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="Date de début"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Au</label>
          <input
            type="date"
            className="block border rounded px-3 py-2"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="Date de fin"
          />
        </div>

        {/* Repas */}
        <div>
          <label className="text-xs text-gray-600">Repas</label>
          <select
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-white"
          >
            {MEALS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Établissement — hidden for MANAGER on desktop */}
        {!isManager && (
          <div>
            <label className="text-xs text-gray-600">Établissement</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={establishmentId}
              onChange={(e) => setEstablishmentId(e.target.value)}
            >
              {establishmentOptions.map((o) => (
                <option key={o.id || "all"} value={o.id || ""}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Type */}
        <div>
          <label className="text-xs text-gray-600">Type</label>
          <select
            value={personType}
            onChange={(e) => setPersonType(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-white"
          >
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ordre */}
        <div>
          <label className="text-xs text-gray-600">Ordre</label>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-white"
          >
            <option value="desc">Plus récents</option>
            <option value="asc">Plus anciens</option>
          </select>
        </div>
      </div>

      {/* Mobile filters sheet */}
      <MobileFiltersSheet
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        meal={meal}
        setMeal={setMeal}
        establishmentId={establishmentId}
        setEstablishmentId={setEstablishmentId}
        personType={personType}
        setPersonType={setPersonType}
        order={order}
        setOrder={setOrder}
        establishmentOptions={establishmentOptions}
        estabsLoading={estabsLoading}
        onApply={() => fetchPage(1)}
        isManager={isManager} // hides the select on mobile for managers
      />

      {/* Table */}
      <div className="overflow-x-auto border rounded">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Repas</th>
              <th className="text-left p-2">Matricule</th>
              <th className="text-left p-2">Nom</th>
              <th className="text-left p-2">Établissement</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={6}>
                  Aucun résultat
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{it.date || ""}</td>
                  <td className="p-2">
                    {(it.personType || "").toLowerCase() === "staff" ? "Personnel" : "Étudiant"}
                  </td>
                  <td className="p-2">{MEAL_LABELS[it.meal] || it.meal || ""}</td>
                  <td className="p-2">{it.person?.matricule || "—"}</td>
                  <td className="p-2">{it.person?.name || "—"}</td>
                  <td className="p-2">{it.person?.establishment?.name || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Page {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => fetchPage(Math.max(1, page - 1))}
          >
            Précédent
          </button>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
            onClick={() => fetchPage(page + 1)}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
