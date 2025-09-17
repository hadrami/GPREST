import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { FileDown, Filter, Search, X } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

const RATES = {
  student: { petitDej: 2,  dej: 5,  diner: 3  },   // MRU
  staff:   { petitDej: 15, dej: 50, diner: 25 },   // MRU
};

const PAGE_SIZE = 20;

function formatDateInput(d) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeMealName(m) {
  const v = (m || "").toLowerCase().trim();
  if (["petit","petitdej","ptitdej","petit_dej","petit-dej","breakfast"].includes(v)) return "petitDej";
  if (["dejeuner","dej","lunch"].includes(v)) return "dej";
  if (["diner","dîner","dinner","soir"].includes(v)) return "diner";
  return v;
}

function moneyForRow(type, counts) {
  const t = (type || "").toLowerCase() === "staff" ? "staff" : "student";
  const r = RATES[t];
  return counts.petitDej * r.petitDej + counts.dej * r.dej + counts.diner * r.diner;
}

export default function Prestations() {
  // Filters (auto-apply)
  const [search, setSearch] = useState("");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [etab, setEtab]     = useState(""); // name-based filter (client-side)
  const [type, setType]     = useState(""); // "" | "student" | "staff"

  // Data & UI
  const [estabs, setEstabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // aggregated rows
  const [page, setPage] = useState(1);

  // Mobile filters
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Debounce for auto-apply
  const debounceRef = useRef(null);

  // ---- Establishments list (auth-aware, via shared api) ----
  useEffect(() => {
    const run = async () => {
      try {
        const { data } = await api.get("/etablissements");
        const arr = Array.isArray(data) ? data : [];
        const norm = arr
          .map((x, i) => ({ id: x.id ?? `E${i}`, name: x.nom || x.name || "—" }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEstabs(norm);
      } catch {
        setEstabs([]);
      }
    };
    run();
  }, []);

  // ---- Fetch & aggregate meal plans -> per person counters ----
  const fetchMealPlans = async (params = {}, limit = PAGE_SIZE, offset = 0) => {
    const q = {
      search: params.search || "",
      from: params.from || "",
      to: params.to || "",
      // Server supports establishmentId; we keep name client-side and filter locally.
      type: params.type || "", // 'student'/'staff' → backend uppercases internally
      limit,
      offset,
    };

    const { data: resp } = await api.get("/mealplans", { params: q });

    // Accept both shapes: array OR { items, total, ... }
    if (Array.isArray(resp)) return { data: resp, total: resp.length };
    const { items = [], total = 0 } = resp || {};
    return { data: items, total };
  };

  const aggregate = (items) => {
    const map = new Map();
    for (const it of items) {
      if (it?.planned === false) continue; // planned only

      const person = it?.person || {};
      const key = person.matricule || `${person.nom ?? ""}-${person.prenom ?? ""}-${person.etablissement ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          matricule: person.matricule || "",
          nom: person.nom || person.name || "",
          prenom: person.prenom || "",
          etablissement: person.establissement || person.establishment?.name || "",
          type: (person.type || "").toLowerCase() === "staff" ? "staff" : "student",
          counts: { petitDej: 0, dej: 0, diner: 0 },
        });
      }
      const row = map.get(key);
      const mealKey = normalizeMealName(it?.meal);
      if (mealKey === "petitDej") row.counts.petitDej += 1;
      else if (mealKey === "dej") row.counts.dej += 1;
      else if (mealKey === "diner") row.counts.diner += 1;
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      total: moneyForRow(r.type, r.counts),
      fullName: `${r.nom} ${r.prenom}`.trim(),
    }));
  };

  const runQuery = async () => {
    setLoading(true);
    try {
      const { data = [] } = await fetchMealPlans(
        { search, from, to, etablissement: etab, type },
        10000,
        0
      );
      const aggregated = aggregate(data);

      // If establishments select is still empty, derive from results
      if (estabs.length === 0 && Array.isArray(data)) {
        const uniq = new Map();
        for (const it of data) {
          const nm = it?.person?.establishment?.name || it?.person?.etablissement || "";
          if (nm && !uniq.has(nm)) uniq.set(nm, { id: nm, name: nm });
        }
        if (uniq.size > 0) {
          setEstabs(Array.from(uniq.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        }
      }

      aggregated.sort(
        (a, b) =>
          (a.fullName || "").localeCompare(b.fullName || "") ||
          (a.matricule || "").localeCompare(b.matricule || "")
      );
      setRows(aggregated);
      setPage(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Auto-apply: debounce whenever a filter changes ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, from, to, etab, type]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let r = rows;
    if (term) {
      r = r.filter(
        (row) =>
          (row.matricule || "").toLowerCase().includes(term) ||
          (row.fullName || "").toLowerCase().includes(term)
      );
    }
    if (etab) r = r.filter((x) => (x.etablissement || "") === etab);
    if (type) r = r.filter((x) => (x.type || "") === type);
    return r;
  }, [rows, search, etab, type]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const grandTotals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => {
          acc.petitDej += r.counts.petitDej;
          acc.dej += r.counts.dej;
          acc.diner += r.counts.diner;
          acc.mru += r.total;
          return acc;
        },
        { petitDej: 0, dej: 0, diner: 0, mru: 0 }
      ),
    [filteredRows]
  );

  const exportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape" });

      const title = "Prestations — Récapitulatif des paiements";
      const filterLines = [
        from ? `De: ${from}` : null,
        to ? `À: ${to}` : null,
        etab ? `Établissement: ${etab}` : null,
        type ? `Type: ${type}` : null,
        search ? `Recherche: ${search}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      doc.setFontSize(16);
      doc.text(title, 14, 14);
      doc.setFontSize(10);
      if (filterLines) doc.text(filterLines, 14, 20);

      const head = [
        ["#", "Matricule", "Nom", "Établissement", "Type", "Petit dej", "Déj", "Dîner", "Total (MRU)"],
      ];
      const body = filteredRows.map((r, i) => [
        i + 1,
        r.matricule || "",
        r.fullName || "",
        r.etablissement || "",
        r.type === "staff" ? "Personnel" : "Étudiant",
        r.counts.petitDej,
        r.counts.dej,
        r.counts.diner,
        r.total,
      ]);

      body.push(["", "", "TOTAL", "", "", grandTotals.petitDej, grandTotals.dej, grandTotals.diner, grandTotals.mru]);

      doc.autoTable({
        head,
        body,
        startY: filterLines ? 26 : 20,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] }, // emerald
      });

      doc.save(`Prestations_${from || "start"}_${to || "end"}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Échec de l’export PDF.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header (no PDF here to avoid duplicates) */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prestations</h1>
      </div>

      {/* ===== Mobile: search + filters button + PDF ===== */}
      <div className="md:hidden space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-600">Recherche</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 text-slate-500" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Matricule ou nom"
                className="pl-8 pr-3 py-2 w-full border rounded-lg outline-none focus:ring"
              />
            </div>
          </div>
          <button
            onClick={() => setShowFiltersMobile(true)}
            className="px-3 py-2 rounded-lg border inline-flex items-center gap-2"
          >
            <Filter size={16} /> Filtres
          </button>
          <button onClick={exportPDF} className="p-2 rounded-lg border" title="Exporter en PDF" aria-label="Exporter PDF">
            <FileDown size={16} />
          </button>
        </div>

        {/* Date range cards */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-emerald-700">Du</span>
            <input
              type="date"
              className="mt-1 text-base sm:text-lg font-semibold text-emerald-900 bg-transparent outline-none"
              value={from}
              onChange={(e) => setFrom(formatDateInput(e.target.value))}
            />
          </label>
          <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-emerald-700">Au</span>
            <input
              type="date"
              className="mt-1 text-base sm:text-lg font-semibold text-emerald-900 bg-transparent outline-none"
              value={to}
              onChange={(e) => setTo(formatDateInput(e.target.value))}
            />
          </label>
        </div>

        {/* Mobile filters sheet (auto-applies on change) */}
        {showFiltersMobile && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowFiltersMobile(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Filtres avancés</h3>
                <button onClick={() => setShowFiltersMobile(false)} className="p-1 rounded hover:bg-gray-100" aria-label="Fermer">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600">Établissement</label>
                  <select
                    value={etab}
                    onChange={(e) => setEtab(e.target.value)}
                    className="block border rounded-lg px-3 py-2 w-full"
                  >
                    <option value="">Tous</option>
                    {estabs.map((o) => (
                      <option key={o.id || o.name} value={o.name || ""}>
                        {o.name || "—"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="block border rounded-lg px-3 py-2 w-full"
                  >
                    <option value="">Tous</option>
                    <option value="student">Étudiant</option>
                    <option value="staff">Personnel</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={() => setShowFiltersMobile(false)} className="px-3 py-2 rounded-lg border">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Desktop filters bar (auto-apply) ===== */}
      <div className="hidden md:grid gap-2 md:grid-cols-7 items-end">
        {/* Search */}
        <div className="flex items-center border rounded px-2">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule ou nom)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Dates */}
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={from}
          onChange={(e) => setFrom(formatDateInput(e.target.value))}
          title="Date de début"
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={to}
          onChange={(e) => setTo(formatDateInput(e.target.value))}
          title="Date de fin"
        />

        {/* Etablissement */}
        <select
          className="border rounded px-3 py-2"
          value={etab}
          onChange={(e) => setEtab(e.target.value)}
          title="Établissement"
        >
          <option value="">Tous</option>
          {estabs.map((o) => (
            <option key={o.id || o.name} value={o.name || ""}>
              {o.name || "—"}
            </option>
          ))}
        </select>

        {/* Type */}
        <select
          className="border rounded px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Tous</option>
          <option value="student">Étudiant</option>
          <option value="staff">Personnel</option>
        </select>

        {/* Export (desktop) */}
        <button
          onClick={exportPDF}
          title="Exporter (PDF)"
          className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded hover:bg-emerald-50"
          aria-label="Exporter PDF"
        >
          <FileDown size={18} className="text-emerald-600" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Petit dej (plans)" value={grandTotals.petitDej} />
        <StatCard label="Déj (plans)" value={grandTotals.dej} />
        <StatCard label="Dîner (plans)" value={grandTotals.diner} />
        <StatCard label="Total MRU" value={`${grandTotals.mru} MRU`} />
      </div>

      {/* Table */}
      <div className="overflow-auto border rounded-xl">
        <table className="min-w-[900px] w-full">
          <thead className="bg-slate-50 text-left">
            <tr>
              <Th>#</Th>
              <Th>Matricule</Th>
              <Th>Nom</Th>
              <Th>Établissement</Th>
              <Th>Type</Th>
              <Th className="text-center">Petit dej</Th>
              <Th className="text-center">Déj</Th>
              <Th className="text-center">Dîner</Th>
              <Th className="text-right">Total (MRU)</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-500">Chargement…</td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-500">Aucune donnée</td>
              </tr>
            )}
            {!loading &&
              pageRows.map((r, i) => (
                <tr key={`${r.matricule}-${i}`} className="border-t">
                  <Td>{(page - 1) * PAGE_SIZE + i + 1}</Td>
                  <Td>{r.matricule}</Td>
                  <Td>{r.fullName}</Td>
                  <Td>{r.etablissement}</Td>
                  <Td>{r.type === "staff" ? "Personnel" : "Étudiant"}</Td>
                  <Td className="text-center">{r.counts.petitDej}</Td>
                  <Td className="text-center">{r.counts.dej}</Td>
                  <Td className="text-center">{r.counts.diner}</Td>
                  <Td className="text-right font-semibold">{r.total}</Td>
                </tr>
              ))}
          </tbody>

          {!loading && filteredRows.length > 0 && (
            <tfoot className="bg-slate-50 border-t">
              <tr>
                <Td colSpan={5} className="font-semibold">TOTAL</Td>
                <Td className="text-center font-semibold">{grandTotals.petitDej}</Td>
                <Td className="text-center font-semibold">{grandTotals.dej}</Td>
                <Td className="text-center font-semibold">{grandTotals.diner}</Td>
                <Td className="text-right font-bold">{grandTotals.mru}</Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination + shown/total */}
      <div className="flex items-center justify-between text-sm">
        <div>
          Affichés: <span className="font-medium">{Math.min(page * PAGE_SIZE, filteredRows.length)}</span> /{" "}
          <span className="font-medium">{filteredRows.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            Précédent
          </button>
          <span>Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }) {
  return <th className={`px-3 py-2 text-xs font-semibold text-slate-700 ${className}`}>{children}</th>;
}
function Td({ children, className = "", colSpan }) {
  return <td colSpan={colSpan} className={`px-3 py-2 ${className}`}>{children}</td>;
}
function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border p-3 shadow-sm bg-emerald-50 border-emerald-200">
      <div className="text-xs text-emerald-700">{label}</div>
      <div className="text-lg font-semibold text-emerald-900">{value}</div>
    </div>
  );
}
