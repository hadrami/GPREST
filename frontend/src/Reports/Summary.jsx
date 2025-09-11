// src/Reports/Summary.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { byDay, byWeek, byMonth } from "../lib/reports.api";
import { apiListEstablishments } from "../lib/establissments.api";
import {
  ArrowDownTrayIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";

const tabs = [
  { key: "day",   label: "Jour" },
  { key: "week",  label: "Semaine" },
  { key: "month", label: "Mois" },
];

const MEAL_LABEL = {
  "PETIT_DEJEUNER": "Petit-déjeuner",
  "DEJEUNER": "Déjeuner",
  "DINER": "Dîner",
};

export default function Summary() {
  const [active, setActive] = useState("day");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  const [establishments, setEstablishments] = useState([]);
  const [estId, setEstId] = useState("");
  const [meal, setMeal] = useState("");
  const [status, setStatus] = useState(""); // used | unused (only day)

  // day / week / month inputs
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [weekStart, setWeekStart] = useState(dayjs().startOf("week").format("YYYY-MM-DD"));
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);

  // Load establishments for filter
  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiListEstablishments({ page: 1, pageSize: 200 });
        setEstablishments(data.items || data);
      } catch { /* non-critical */ }
    })();
  }, []);

  // Build params for API call
  const params = useMemo(() => {
    const base = {};
    if (estId) base.establishmentId = estId;
    if (meal)  base.meal = meal;

    if (active === "day")   return { ...base, date, ...(status ? { status } : {}) };
    if (active === "week")  return { ...base, weekStart };
    return { ...base, year, month: Number(month) };
  }, [active, date, weekStart, year, month, meal, status, estId]);

  // Fetch current report
  useEffect(() => {
    (async () => {
      setErr(null); setLoading(true);
      try {
        let res;
        if (active === "day")      res = await byDay(params);
        else if (active === "week") res = await byWeek(params);
        else                       res = await byMonth(params);
        setData(res.data);
      } catch (e) {
        setErr(e?.response?.data?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [active, params]);

  const planned = data?.planned ?? 0;
  const eaten   = data?.eaten ?? 0;
  const noShow  = data?.noShow ?? 0;
  const rate    = planned > 0 ? Math.round((eaten / planned) * 100) : 0;
  const people  = (active === "day" && status === "used"  && Array.isArray(data?.used))   ? data.used
                : (active === "day" && status === "unused"&& Array.isArray(data?.unused)) ? data.unused
                : [];

  // ---------- Export helpers ----------
  async function exportExcel() {
    const rows = buildRowsForExport();
    // Try XLSX, otherwise CSV
    try {
      const XLSX = (await import("xlsx")).default || (await import("xlsx"));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "Aucune donnée" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Rapport");
      const file = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      triggerDownload(new Blob([file], { type: "application/octet-stream" }), fileName("xlsx"));
    } catch {
      // CSV fallback (no dependency)
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
    // Colors (soft for printing)
    const primary = [34, 197, 94];      // soft green-ish accent if you want: change as needed
    const headerBg = [240, 247, 255];   // very light blue
    const headerTxt = [30, 64, 175];    // deep blue for titles

    // Title block
    doc.setFontSize(18);
    doc.setTextColor(...headerTxt);
    doc.text("Rapport de Restauration", 40, 48);

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(filterLine(), 40, 68);

    // KPI ribbon
    doc.setDrawColor(...primary);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(40, 82, 515, 54, 8, 8, "F");
    doc.setTextColor(33, 33, 33);
    doc.setFontSize(11);
    doc.text(`Planifiés: ${planned}`, 54, 104);
    doc.text(`Ont mangé: ${eaten}`, 200, 104);
    doc.text(`Absents: ${noShow}`, 340, 104);
    doc.text(`Taux: ${rate}%`, 460, 104);

    // Table (if we have rows)
    if (rows.length) {
      const head = [Object.keys(rows[0])];
      const body = rows.map(r => Object.values(r));
      // @ts-ignore
      doc.autoTable({
        head, body,
        startY: 150,
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: {
          fillColor: headerBg,
          textColor: headerTxt,
          lineWidth: 0.2,
          lineColor: [210, 210, 210],
          fontStyle: "bold",
        },
        bodyStyles: {
          fillColor: [255,255,255],
          textColor: [55,65,81],
          lineColor: [228,228,231],
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: [249,250,251] },
        margin: { left: 40, right: 40 },
      });
    }

    doc.save(fileName("pdf"));
  } catch {
    window.print(); // fallback
  }
}

  function buildRowsForExport() {
    // If we have a people list (day + status), export it; else export the totals row.
    if (people.length) {
      return people.map(p => ({
        Matricule: p.matricule || "",
        Nom: p.name || "",
        Établissement: p.establishment?.name || p.etablissement?.name || "",
      }));
    }
    return [{
      Période: active === "day" ? date
              : active === "week" ? `Semaine commençant ${weekStart}`
              : `${String(month).padStart(2,"0")}/${year}`,
      Repas: meal ? (MEAL_LABEL[meal] || meal) : "Tous",
      Établissement: establishments.find(e => e.id === estId)?.name || "Tous",
      Planifiés: planned, "Ont mangé": eaten, "Absents": noShow, "Taux (%)": rate,
    }];
  }

  function toCSV(rows) {
    if (!rows.length) return "Info\nAucune donnée";
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));
    return lines.join("\n");
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function fileName(ext) {
    const base =
      active === "day"  ? `rapport_${date}`
    : active === "week" ? `rapport_semaine_${weekStart}`
    :                     `rapport_${year}-${String(month).padStart(2,"0")}`;
    return `${base}.${ext}`;
  }

  function filterLine() {
    const etab = establishments.find(e => e.id === estId)?.name || "Tous";
    const mealLabel = meal ? (MEAL_LABEL[meal] || meal) : "Tous";
    if (active === "day")   return `Date: ${date} • Repas: ${mealLabel} • Établissement: ${etab} • Statut: ${status||"Tous"}`;
    if (active === "week")  return `Début semaine: ${weekStart} • Repas: ${mealLabel} • Établissement: ${etab}`;
    return `Mois: ${String(month).padStart(2,"0")}/${year} • Repas: ${mealLabel} • Établissement: ${etab}`;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Rapports</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-slate-50">
            <ArrowDownTrayIcon className="w-5 h-5" />
            Exporter (Excel/CSV)
          </button>
          <button onClick={exportPDF}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-slate-50">
            <PrinterIcon className="w-5 h-5" />
            Exporter (PDF)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-3 py-2 rounded-md border ${active===t.key ? "bg-black text-white" : "hover:bg-slate-50"}`}
            onClick={() => setActive(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-5 items-end bg-white p-3 rounded-xl border">
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
      </div>

{/*Summary cards KPI */}
<div className="grid gap-3 md:grid-cols-4">
  <KPICard title="Planifiés" value={planned}
           bg="bg-primary" text="text-white" />
  <KPICard title="Ont mangé" value={eaten}
           bg="bg-accent" text="text-primary" tint />
  <KPICard title="Absents" value={noShow}
           bg="bg-rose-50" text="text-rose-700" border="border-rose-200" />
  <KPICard title="Taux de présence" value={`${rate}%`}
           bg="bg-accent/40" text="text-primary" border="border-accent/30" />
</div>

      {/* Results / Table */}
      <div className="min-h-24">
        {loading && <div className="text-slate-500">Chargement…</div>}
        {err && <div className="text-red-600">{err}</div>}

        {!loading && !err && active === "day" && status && (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2">Matricule</th>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Établissement</th>
                </tr>
              </thead>
              <tbody>
                {people.length === 0 ? (
                  <tr><td className="p-3" colSpan={3}>Aucun résultat</td></tr>
                ) : people.map((p,i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{p.matricule || "—"}</td>
                    <td className="p-2">{p.name || "—"}</td>
                    <td className="p-2">{p.establishment?.name || p.etablissement?.name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !err && !(active === "day" && status) && (
          <div className="text-sm text-slate-700 bg-secondary/40 border rounded p-3">
            {filterLine()}
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ title, value, bg="bg-white", text="text-slate-900", border="" , tint=false }) {
  // tint=true puts a soft inner background like your dashboard cards
  return (
    <div className={`${bg} ${border?`border ${border}`:""} rounded-2xl shadow-sm`}>
      <div className={`p-4 ${tint ? "bg-white/55" : ""} rounded-2xl`}>
        <div className={`text-xs ${text} opacity-80`}>{title}</div>
        <div className={`text-3xl font-extrabold ${text}`}>{value}</div>
      </div>
    </div>
  );
}