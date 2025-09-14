// src/Reports/Summary.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { byDay, byWeek, byMonth } from "../lib/reports.api";
import { apiListEstablishments } from "../lib/establissments.api";
import {
  ArrowDownTrayIcon, // Excel/CSV
  PrinterIcon,       // PDF
} from "@heroicons/react/24/outline";

// Tabs
const tabs = [
  { key: "day",   label: "Jour" },
  { key: "week",  label: "Semaine" },
  { key: "month", label: "Mois" },
];

const MEAL_LABEL = {
  PETIT_DEJEUNER: "Petit-déjeuner",
  DEJEUNER: "Déjeuner",
  DINER: "Dîner",
};

function KPICard({ title, value, bg, text, border, tint }) {
  return (
    <div
      className={[
        "rounded-2xl p-4 shadow-lg ring-1",
        border || "ring-transparent",
        bg || "bg-white",
        tint ? "backdrop-blur" : "",
      ].join(" ")}
    >
      <div className="text-xs uppercase tracking-wide text-slate-600 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${text || "text-primary"}`}>{value}</div>
    </div>
  );
}

export default function Summary() {
  const [active, setActive] = useState("day");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  // filters
  const [establishments, setEstablishments] = useState([]);
  const [estId, setEstId] = useState("");
  const [meal, setMeal] = useState("");
  const [status, setStatus] = useState(""); // used | unused (only day)

  // inputs by granularity
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [weekStart, setWeekStart] = useState(dayjs().startOf("week").format("YYYY-MM-DD"));
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);

  // load establishments
  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiListEstablishments({ page: 1, pageSize: 200 });
        setEstablishments(data.items || data);
      } catch {
        /* non-critical */
      }
    })();
  }, []); // same flow as current file :contentReference[oaicite:4]{index=4}

  // build params
  const params = useMemo(() => {
    const base = {};
    if (estId) base.establishmentId = estId;
    if (meal)  base.meal = meal;

    if (active === "day")   return { ...base, date, ...(status ? { status } : {}) };
    if (active === "week")  return { ...base, weekStart };
    return { ...base, year, month: Number(month) };
  }, [active, date, weekStart, year, month, meal, status, estId]); // mirrors your existing logic :contentReference[oaicite:5]{index=5}

  // fetch report
  useEffect(() => {
    (async () => {
      setErr(null); setLoading(true);
      try {
        let res;
        if (active === "day")       res = await byDay(params);
        else if (active === "week") res = await byWeek(params);
        else                        res = await byMonth(params);
        setData(res.data);
      } catch (e) {
        setErr(e?.response?.data?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [active, params]); // current file does the same sequence :contentReference[oaicite:6]{index=6}

  // KPIs
  const planned = data?.planned ?? 0;
  const eaten   = data?.eaten ?? 0;
  const noShow  = data?.noShow ?? 0;
  const rate    = planned > 0 ? Math.round((eaten / planned) * 100) : 0;

  // list for day + status
  const people = (active === "day" && status === "used"   && Array.isArray(data?.used))   ? data.used
               : (active === "day" && status === "unused" && Array.isArray(data?.unused)) ? data.unused
               : []; // as in your current file :contentReference[oaicite:7]{index=7}

  // ---------- helpers: labels & export rows ----------
  function filterLine() {
    const tabLabel = { day: "Jour", week: "Semaine", month: "Mois" }[active];
    const mealLabel = meal ? MEAL_LABEL[meal] : "Tous repas";
    if (active === "day")  return `${tabLabel} ${date} • ${mealLabel} • ${status ? (status==="used"?"Ont mangé":"Pas encore mangé"):"Tous"}`;
    if (active === "week") return `${tabLabel} du ${weekStart} • ${mealLabel}`;
    return `${tabLabel} ${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")} • ${mealLabel}`;
  }

  function buildRowsForExport() {
    // If daily + status chosen → export the list of persons (with optional meal column)
    if (active === "day" && status && people.length) {
      return people.map(p => ({
        Matricule: p.matricule || "",
        Nom: p.name || "",
        Établissement: p.establishment?.name || p.etablissement?.name || "—",
        Repas: meal ? (MEAL_LABEL[meal] || meal) : "—",
        Date: date,
      }));
    }
    // Otherwise export one row of totals
    return [{
      Période: filterLine(),
      Planifiés: planned,
      "Ont mangé": eaten,
      Absents: noShow,
      "Taux de présence": `${rate}%`,
    }];
  }

  function toCSV(rows) {
    if (!rows.length) return "Aucune donnée";
    const head = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [head.join(","), ...rows.map(r => head.map(k => esc(r[k])).join(","))].join("\n");
  }

  function fileName(ext) {
    const base =
      active === "day"  ? `rapport_${date}` :
      active === "week" ? `rapport_semaine_${weekStart}` :
                          `rapport_${year}-${String(month).padStart(2,"0")}`;
    return `${base}.${ext}`;
  }

  function triggerDownload(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel() {
    const rows = buildRowsForExport();
    try {
      const XLSX = (await import("xlsx")).default || (await import("xlsx"));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "Aucune donnée" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Rapport");
      const file = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      triggerDownload(new Blob([file], { type: "application/octet-stream" }), fileName("xlsx"));
    } catch {
      const csv = toCSV(rows);
      triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), fileName("csv"));
    }
  }

  async function exportPDF() {
    const rows = buildRowsForExport();
    try {
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");

      const doc = new jsPDF({ unit: "pt" });

      // light print palette (same spirit as MealPlans PDF)
      const headerBg = [242, 248, 255];
      const headerTxt = [30, 64, 175];

      // Title + criteria
      doc.setFontSize(18);
      doc.setTextColor(...headerTxt);
      doc.text("Rapport de restauration", 40, 48);

      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(filterLine(), 40, 68);

      // Optional KPI line
      const totalsLine = `Planifiés: ${planned}   •   Ont mangé: ${eaten}   •   Absents: ${noShow}   •   Taux: ${rate}%`;
      doc.text(totalsLine, 40, 88);

      // Table
      if (rows.length) {
        const head = [Object.keys(rows[0])];
        const body = rows.map(r => Object.values(r));
        // same table styling approach you used for meal plans PDF :contentReference[oaicite:8]{index=8}
        // @ts-ignore
        doc.autoTable({
          head, body,
          startY: 110,
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
        doc.text("Aucun résultat.", 40, 110);
      }

      doc.save(fileName("pdf"));
    } catch {
      window.print();
    }
  }

  // ---------- UI ----------
  return (
    <div className="p-4 space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={[
              "px-3 py-2 rounded-lg border text-sm",
              active === t.key ? "bg-primary text-white border-primary" : "hover:bg-slate-50"
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-accent/20 rounded-2xl p-4 ring-1 ring-accent/30">
        <div className="flex flex-col">
          <label className="text-xs">Établissement</label>
          <select value={estId} onChange={(e)=>setEstId(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous</option>
            {establishments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs">Repas</label>
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous</option>
            <option value="PETIT_DEJEUNER">Petit-déjeuner</option>
            <option value="DEJEUNER">Déjeuner</option>
            <option value="DINER">Dîner</option>
          </select>
        </div>

        {active === "day" && (
          <>
            <div className="flex flex-col">
              <label className="text-xs">Date</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                     className="px-3 py-2 rounded-md border" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs">Statut</label>
              <select value={status} onChange={(e)=>setStatus(e.target.value)} className="px-3 py-2 rounded-md border">
                <option value="">Tous</option>
                <option value="used">Ont mangé</option>
                <option value="unused">Pas encore mangé</option>
              </select>
            </div>
          </>
        )}

        {active === "week" && (
          <div className="flex flex-col">
            <label className="text-xs">Début de semaine</label>
            <input type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)}
                   className="px-3 py-2 rounded-md border" />
          </div>
        )}

        {active === "month" && (
          <>
            <div className="flex flex-col">
              <label className="text-xs">Année</label>
              <input type="number" value={year} min={2020} max={2100}
                     onChange={e=>setYear(Number(e.target.value))}
                     className="px-3 py-2 rounded-md border w-28" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs">Mois</label>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                      className="px-3 py-2 rounded-md border">
                {Array.from({length:12}, (_,i)=>i+1).map(m=>
                  <option key={m} value={m}>{m.toString().padStart(2,"0")}</option>
                )}
              </select>
            </div>
          </>
        )}

        {/* Export buttons */}
        <div className="flex gap-2 md:justify-end">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-slate-50"
            title="Exporter Excel/CSV"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Excel/CSV</span>
          </button>
          <button
            type="button"
            onClick={exportPDF}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
            title="Exporter PDF"
          >
            <PrinterIcon className="w-5 h-5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KPICard title="Planifiés" value={planned} bg="bg-primary" text="text-white" />
        <KPICard title="Ont mangé" value={eaten} bg="bg-accent" text="text-primary" tint />
        <KPICard title="Absents" value={noShow} bg="bg-rose-50" text="text-rose-700" border="ring-rose-200" />
        <KPICard title="Taux de présence" value={`${rate}%`} bg="bg-accent/40" text="text-primary" border="ring-accent/30" />
      </div>

      {/* Detail list (day + status) */}
      {active === "day" && status && (
        <div className="mt-2">
          <div className="text-sm text-slate-600 mb-2">{filterLine()}</div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Matricule</th>
                  <th className="text-left px-3 py-2">Nom</th>
                  <th className="text-left px-3 py-2">Établissement</th>
                  <th className="text-left px-3 py-2">Repas</th>
                  <th className="text-left px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{p.matricule || "—"}</td>
                    <td className="px-3 py-2">{p.name || "—"}</td>
                    <td className="px-3 py-2">{p.establishment?.name || p.etablissement?.name || "—"}</td>
                    <td className="px-3 py-2">{meal ? (MEAL_LABEL[meal] || meal) : "—"}</td>
                    <td className="px-3 py-2">{date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid gap-3">
            {people.map((p, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 p-3"
              >
                <div className="font-medium">{p.name || "—"}</div>
                <div className="text-xs text-slate-600">Matricule: {p.matricule || "—"}</div>
                <div className="text-xs text-slate-600">
                  Établissement: {p.establishment?.name || p.etablissement?.name || "—"}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Repas: {meal ? (MEAL_LABEL[meal] || meal) : "—"} • Date: {date}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {!loading && people.length === 0 && (
            <div className="text-slate-500">Aucun résultat.</div>
          )}
        </div>
      )}

      {err && <div className="text-red-600">{String(err)}</div>}
      {loading && <div className="text-slate-500">Chargement…</div>}
    </div>
  );
}
