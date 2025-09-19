import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import api from "../lib/api";
import { FileDown, Filter, Search, X } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  apiListEstablishments,
  apiGetEstablishment,
} from "../lib/establishments.api";

const RATES = {
  student: { petitDej: 2,  dej: 5,  diner: 3  },
  staff:   { petitDej: 15, dej: 50, diner: 25 },
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
  const { user } = useSelector((s) => s.auth);
  const isManager = String(user?.role || "").toUpperCase() === "MANAGER";
  const managerEstId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";

  // Filters (auto-apply)
  const [search, setSearch] = useState("");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [estId, setEstId]   = useState(""); // establishment id (server-side)
  const [type, setType]     = useState(""); // "" | "student" | "staff"

  // Data & UI
  const [estabs, setEstabs] = useState([]);
  const [managerEstName, setManagerEstName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);    // aggregated rows
  const [page, setPage] = useState(1);
  const [ , setEstabsLoading] = useState(true);

  // Mobile filters
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Debounce for auto-apply
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

  // ---- Manager: lock establishment id + fetch display name
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!(isManager && managerEstId)) return;
      setEstId(String(managerEstId)); // lock select & queries
      try {
        const { data } = await apiGetEstablishment(String(managerEstId));
        if (!cancel) setManagerEstName(data?.name || null);
      } catch {
        if (!cancel) setManagerEstName(null);
      }
    })();
    return () => { cancel = true; };
  }, [isManager, managerEstId]); // :contentReference[oaicite:7]{index=7}

  // ---- Fetch & aggregate meal plans -> per person counters
  const fetchMealPlans = async (params = {}, limit = PAGE_SIZE, offset = 0) => {
    const q = {
      search: params.search || "",
      from: params.from || "",
      to: params.to || "",
      establishmentId: isManager ? managerEstId : (params.establishmentId || ""),
      type: params.type || "",
      limit,
      offset,
    };
    const { data: resp } = await api.get("/mealplans", { params: q });

    if (Array.isArray(resp)) return { data: resp, total: resp.length };
    const { items = [], total = 0 } = resp || {};
    return { data: items, total };
  };

  const aggregate = (items) => {
    const map = new Map();
    for (const it of items) {
      if (it?.planned === false) continue;

      const person = it?.person || {};
      const key = person.matricule || `${person.nom ?? ""}-${person.prenom ?? ""}-${person.etablissement ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          matricule: person.matricule || "",
          nom: person.nom || person.name || "",
          prenom: person.prenom || "",
          etablissement: person.establishment?.name || person.etablissement || "",
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
        { search, from, to, establishmentId: estId, type },
        10000,
        0
      );
      const aggregated = aggregate(data);

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
  useEffect(() => { runQuery(); /* eslint-disable-next-line */ }, []);

  // auto-apply on filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, from, to, estId, type]);

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
    if (type) r = r.filter((x) => (x.type || "") === type);
    return r;
  }, [rows, search, type]);

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

  const establishmentOptions = useMemo(
    () => [{ id: "", name: "Tous les établissements" }, ...estabs],
    [estabs]
  );
  const currentEstName = useMemo(() => {
    if (isManager) return managerEstName || "…";
    const match = establishmentOptions.find((o) => String(o.id || "") === String(estId || ""));
    return match?.name || "Tous les établissements";
  }, [isManager, managerEstName, establishmentOptions, estId]);

  const exportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape" });

      const title = "Prestations — Récapitulatif des paiements";
      const filterLines = [
        from ? `De: ${from}` : null,
        to ? `À: ${to}` : null,
        `Établissement: ${currentEstName || (isManager ? "…" : "Tous")}`,
        type ? `Type: ${type === "staff" ? "Personnel" : "Étudiant"}` : null,
        search ? `Recherche: ${search}` : null,
      ].filter(Boolean).join(" | ");

      doc.setFontSize(16);
      doc.text(title, 14, 14);
      doc.setFontSize(10);
      if (filterLines) doc.text(filterLines, 14, 20);

      const head = [["#", "Matricule", "Nom", "Établissement", "Type", "Petit dej", "Déj", "Dîner", "Total (MRU)"]];
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

      // @ts-ignore
      doc.autoTable({
        head,
        body,
        startY: filterLines ? 26 : 20,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] },
      });

      doc.save(`Prestations_${from || "start"}_${to || "end"}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Échec de l’export PDF.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prestations</h1>
        <button
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          onClick={exportPDF}
          title="Exporter en PDF"
        >
          <FileDown size={18} />
          Exporter
        </button>
      </div>

      {/* Subtitle: establishment scope */}
      {isManager ? (
        <div className="text-sm text-slate-600">
          Résultats pour l’établissement :{" "}
          <span className="font-medium text-primary">
            {currentEstName}
          </span>
        </div>
      ) : (
        <div className="text-sm text-slate-500">
          {currentEstName}
        </div>
      )}

      {/* --- MOBILE: search + dates always visible (NOT inside filter sheet) --- */}
      <div className="md:hidden space-y-3">
        <label className="flex items-center gap-2 border rounded px-2">
          <Search size={16} className="text-slate-500" />
          <input
            className="px-1 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600">Du</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={formatDateInput(from)}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Au</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={formatDateInput(to)}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
            onClick={() => setShowFiltersMobile(true)}
          >
            <Filter size={16} />
            Filtres
          </button>
        </div>
      </div>

      {/* --- DESKTOP toolbar --- */}
      <div className="hidden md:flex items-end gap-3 flex-wrap">
        <label className="flex items-center gap-2 border rounded px-2">
          <Search size={16} className="text-slate-500" />
          <input
            className="px-1 py-2 outline-none"
            placeholder="Rechercher (matricule, nom…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div>
          <label className="text-xs text-gray-600">Du</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={formatDateInput(from)}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Au</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={formatDateInput(to)}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        {/* Establishment — hidden for MANAGER */}
        {!isManager && (
          <div>
            <label className="text-xs text-gray-600">Établissement</label>
            <select
              value={estId}
              onChange={(e) => setEstId(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white"
            >
              {establishmentOptions.map((o) => (
                <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs text-gray-600">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-white"
          >
            <option value="">Tous</option>
            <option value="student">Étudiant</option>
            <option value="staff">Personnel</option>
          </select>
        </div>
      </div>

      {/* --- MOBILE sheet (NO search/dates here, per your request) --- */}
      {showFiltersMobile && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFiltersMobile(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4">
            <div className="h-1 w-12 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Filtres</h3>
              <button onClick={() => setShowFiltersMobile(false)} className="p-2">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Établissement — HIDDEN for MANAGER on mobile */}
              {!isManager && (
                <div>
                  <label className="text-xs text-gray-600">Établissement</label>
                  <select
                    value={estId}
                    onChange={(e) => setEstId(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    {establishmentOptions.map((o) => (
                      <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-600">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Tous</option>
                  <option value="student">Étudiant</option>
                  <option value="staff">Personnel</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowFiltersMobile(false); }}
                  className="flex-1 rounded-xl px-4 py-2 bg-emerald-600 text-white font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DATA TABLE (unchanged styling) --- */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Matricule</th>
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Établissement</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Pt-déj</th>
              <th className="px-4 py-2">Déj</th>
              <th className="px-4 py-2">Dîner</th>
              <th className="px-4 py-2">Total (MRU)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>Chargement…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>Aucun résultat</td></tr>
            ) : (
              pageRows.map((r, i) => (
                <tr key={`${r.matricule}-${i}`} className="border-t">
                  <td className="px-4 py-2">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-2">{r.matricule}</td>
                  <td className="px-4 py-2">{r.fullName}</td>
                  <td className="px-4 py-2">{r.etablissement}</td>
                  <td className="px-4 py-2">{r.type === "staff" ? "Personnel" : "Étudiant"}</td>
                  <td className="px-4 py-2">{r.counts.petitDej}</td>
                  <td className="px-4 py-2">{r.counts.dej}</td>
                  <td className="px-4 py-2">{r.counts.diner}</td>
                  <td className="px-4 py-2">{r.total}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-2 font-medium" colSpan={5}>Totaux</td>
              <td className="px-4 py-2 font-medium">{grandTotals.petitDej}</td>
              <td className="px-4 py-2 font-medium">{grandTotals.dej}</td>
              <td className="px-4 py-2 font-medium">{grandTotals.diner}</td>
              <td className="px-4 py-2 font-medium">{grandTotals.mru}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">Page {page} / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </button>
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
