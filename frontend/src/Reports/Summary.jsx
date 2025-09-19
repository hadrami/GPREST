import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { byDay } from "../lib/reports.api";
import { apiListEstablishments, apiGetEstablishment } from "../lib/establishments.api";
import { PrinterIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useSelector } from "react-redux";

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

const FunnelIcon = (props) => (
  <svg viewBox="0 0 24 24" width={20} height={20} {...props}>
    <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6l-6.8 9.06V20a1 1 0 0 1-1.45.9l-3-1.5A1 1 0 0 1 9 18v-3.34L2.2 6.6A1 1 0 0 1 3 5z" />
  </svg>
);

// Mobile filters sheet (your existing styling kept)
function MobileFiltersSheet({
  open,
  onClose,
  estId, setEstId,
  meal, setMeal,
  personType, setPersonType,
  status, setStatus,
  establishmentOptions,
  disableStatus,
  onApply,
  isManager
}) {
  return (
    <div aria-hidden={!open} className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}/>
      <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4 transition-transform ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="h-1 w-12 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filtres</h3>

        <div className="space-y-3">
          {!isManager && (
            <div>
              <label className="text-xs text-gray-600">Établissement</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={estId}
                onChange={(e)=>setEstId(e.target.value)}
                title="Établissement"
              >
                {establishmentOptions.map((o) => (
                  <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-600">Repas</label>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Tous</option>
              <option value="PETIT_DEJEUNER">Petit-déjeuner</option>
              <option value="DEJEUNER">Déjeuner</option>
              <option value="DINER">Dîner</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">Type</label>
            <select
              value={personType}
              onChange={(e)=>setPersonType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Tous</option>
              <option value="STUDENT">Étudiant</option>
              <option value="STAFF">Personnel</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">Statut</label>
            <select
              value={status}
              onChange={(e)=>setStatus(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              disabled={disableStatus}
              title={disableStatus ? "Disponible uniquement pour une seule date (Du = Au)" : undefined}
            >
              <option value="">Tous</option>
              <option value="used">Ont mangé</option>
              <option value="unused">Pas encore mangé</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { onApply(); onClose(); }} className="flex-1 rounded-xl px-4 py-2 bg-emerald-600 text-white font-medium">
              Appliquer
            </button>
            <button onClick={onClose} className="rounded-xl px-4 py-2 border">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Summary() {
  const today = dayjs().format("YYYY-MM-DD");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Totals used by stat cards
  const [data, setData] = useState({ planned: 0, eaten: 0, noShow: 0 });

  const { user } = useSelector((s) => s.auth);
  const isManager = String(user?.role || "").toUpperCase() === "MANAGER";
  const managerEstId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";
  const [managerEstName, setManagerEstName] = useState(null);

  const [establishments, setEstablishments] = useState([]);
  const [estId, setEstId] = useState("");
  const [meal, setMeal] = useState("");
  const [personType, setPersonType] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [searchQ, setSearchQ] = useState("");
  const [ setPeople] = useState([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false); 
  const [ setEstabsLoading] = useState(true);



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

  // ---- Establishments list
 useEffect(() => {
   const run = async () => {
     try { setEstablishments(await fetchAllEstablishments()); }
     catch { setEstablishments([]); }
     finally { setEstabsLoading(false); }
   };
   run();
 }, []);

 
 
 
 
  // Lock establishment for managers + fetch label
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!(isManager && managerEstId)) return;
      setEstId(String(managerEstId));
      try {
        const { data } = await apiGetEstablishment(String(managerEstId));
        if (!cancel) setManagerEstName(data?.name || null);
      } catch {
        if (!cancel) setManagerEstName(null);
      }
    })();
    return () => { cancel = true; };
  }, [isManager, managerEstId]);

  const establishmentOptions = useMemo(
    () => [{ id: "", name: "Tous les établissements" }, ...establishments],
    [establishments]
  );

  const singleDay = useMemo(() => fromDate && toDate && fromDate === toDate, [fromDate, toDate]);

  function filterLine() {
    const mealLabel = meal ? MEAL_LABEL[meal] : "Tous repas";
    if (singleDay) return `Jour ${fromDate} • ${mealLabel} • ${status ? (status==="used"?"Ont mangé":"Pas encore mangé"):"Tous"}`;
    return `Du ${fromDate} au ${toDate} • ${mealLabel}`;
  }

  // Fetch totals + (optionally) list
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setErr(null); setLoading(true);
      try {
        const baseParams = {
          meal: meal || undefined,
          establishmentId: (isManager ? managerEstId : estId) || undefined,
          type: personType || undefined,
        };

        if (singleDay) {
          const totalsRes = await byDay({ ...baseParams, date: fromDate });
          if (cancelled) return;
          const planned = totalsRes.data?.planned ?? 0;
          const eaten   = totalsRes.data?.eaten ?? 0;
          setData({ planned, eaten, noShow: Math.max(0, planned - eaten) });

          if (status) {
            const listRes = await byDay({ ...baseParams, date: fromDate, status });
            if (cancelled) return;
            const ppl = status === "used" ? (listRes.data?.used || []) :
                        status === "unused" ? (listRes.data?.unused || []) : [];
            setPeople(Array.isArray(ppl) ? ppl : []);
          } else {
            setPeople([]);
          }
        } else {
          let planned = 0, eaten = 0;
          let d = dayjs(fromDate);
          const end = dayjs(toDate);
          while (d.isSame(end) || d.isBefore(end)) {
            const dateStr = d.format("YYYY-MM-DD");
            const res = await byDay({ ...baseParams, date: dateStr });
            planned += Number(res.data?.planned ?? 0);
            eaten   += Number(res.data?.eaten ?? 0);
            d = d.add(1, "day");
          }
          if (cancelled) return;
          setData({ planned, eaten, noShow: Math.max(0, planned - eaten) });
          setPeople([]);
        }
      } catch (e) {
        if (cancelled) return;
        setErr(e?.response?.data?.message || "Erreur de chargement");
        setData({ planned: 0, eaten: 0, noShow: 0 });
        setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (fromDate && toDate) run();
    return () => { cancelled = true; };
  }, [singleDay, fromDate, toDate, meal, estId, personType, status, isManager, managerEstId]);

  const planned = data?.planned ?? 0;
  const eaten   = data?.eaten ?? 0;
  const noShow  = data?.noShow ?? 0;
  const rate    = planned > 0 ? Math.round((eaten / planned) * 100) : 0;

  // PDF export (unchanged)
  async function exportPDF() {
    const rows = [{
      Période: filterLine(),
      Établissement: (isManager
        ? (managerEstName || "…")
        : (establishmentOptions.find(e => e.id === estId)?.name || "Tous")),
      Repas: meal ? (MEAL_LABEL[meal] || meal) : "Tous",
      Type: personType || "Tous",
      Planifiés: planned, "Ont mangé": eaten, Absents: noShow, "Taux de présence": `${rate}%`,
    }];

    try {
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");

      const doc = new jsPDF({ unit: "pt" });
      const headerBg = [242, 248, 255];
      const headerTxt = [30, 64, 175];

      doc.setFontSize(18);
      doc.setTextColor(...headerTxt);
      doc.text("Rapport de restauration", 40, 48);

      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(filterLine(), 40, 68);

      const totalsLine = `Planifiés: ${planned}   •   Ont mangé: ${eaten}   •   Absents: ${noShow}   •   Taux: ${rate}%`;
      doc.text(totalsLine, 40, 88);

      const head = [Object.keys(rows[0])];
      const body = rows.map(r => Object.values(r));
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

      doc.save(singleDay ? `rapport_${fromDate}.pdf` : `rapport_${fromDate}_au_${toDate}.pdf`);
    } catch {
      window.print();
    }
  }

  const establishmentLine = isManager
    ? (managerEstName ?? "Chargement…")
    : (establishmentOptions.find(e => String(e.id||"") === String(estId||""))?.name) || "Tous les établissements";

  return (
    <div className="p-4 space-y-5">
      {/* Scope line */}
      {isManager ? (
        <div className="text-sm text-slate-600">
          Statistiques pour l’établissement :{" "}
          <span className="font-medium text-primary">{establishmentLine}</span>
        </div>
      ) : (
        <div className="text-sm text-slate-500">{establishmentLine}</div>
      )}

      {/* Search + export (mobile) */}
      <div className="md:hidden flex items-center gap-2">
        <div className="flex-1 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom)…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        <button
          className="inline-flex items-center justify-center rounded-lg border px-3 py-2"
          aria-label="Exporter PDF"
          onClick={exportPDF}
          title="Exporter PDF"
        >
          <PrinterIcon className="w-5 h-5" />
        </button>
        <button
          className="inline-flex items-center justify-center rounded-lg border px-3 py-2"
          aria-label="Filtres"
          onClick={() => setMobileFiltersOpen(true)}
          title="Filtres"
        >
          <FunnelIcon />
        </button>
      </div>

      {/* Dates (mobile) */}
      <div className="md:hidden grid grid-cols-2 gap-2">
        <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Du</span>
          <input type="date" className="mt-1 text-base font-semibold bg-transparent outline-none"
            value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-[10px] uppercase tracking-wide text-emerald-700">Au</span>
          <input type="date" className="mt-1 text-base font-semibold bg-transparent outline-none"
            value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
      </div>

      {/* Search + export (desktop) */}
      <div className="hidden md:flex items-center gap-2">
        <div className="flex-1 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom)…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={exportPDF}
          className="inline-flex items-center px-2 py-2 rounded-md border hover:bg-slate-50"
          title="Exporter PDF"
        >
          <PrinterIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Desktop: filters row (unchanged layout) */}
      <div className="hidden md:grid grid-cols-6 gap-3 items-end bg-accent/20 rounded-2xl p-4 ring-1 ring-accent/30">
        {!isManager && (
          <div>
            <label className="text-xs text-gray-600">Établissement</label>
            <select value={estId} onChange={(e) => setEstId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
              {establishmentOptions.map((o) => (
                <option key={o.id || "all"} value={o.id || ""}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col">
          <label className="text-xs">Repas</label>
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous</option>
            <option value="PETIT_DEJEUNER">Petit-déjeuner</option>
            <option value="DEJEUNER">Déjeuner</option>
            <option value="DINER">Dîner</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs">Type</label>
          <select value={personType} onChange={(e)=>setPersonType(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous</option>
            <option value="STUDENT">Étudiant</option>
            <option value="STAFF">Personnel</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs">Du</label>
          <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="px-3 py-2 rounded-md border" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs">Au</label>
          <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="px-3 py-2 rounded-md border" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs">Statut</label>
          <select
            value={status}
            onChange={(e)=>setStatus(e.target.value)}
            className="px-3 py-2 rounded-md border"
            disabled={!singleDay}
            title={!singleDay ? "Disponible uniquement pour une seule date (Du = Au)" : undefined}
          >
            <option value="">Tous</option>
            <option value="used">Ont mangé</option>
            <option value="unused">Pas encore mangé</option>
          </select>
        </div>
      </div>

      {/* >>> NEW/RESTORED: Stat Cards section (keeps your card style) <<< */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Planifiés" value={planned} />
        <KPICard title="Ont mangé" value={eaten} bg="bg-white" text="text-sky-600" border="ring-sky-100" />
        <KPICard title="Absents" value={noShow} bg="bg-white" text="text-rose-600" border="ring-rose-100" />
        <KPICard title="Taux de présence" value={`${rate}%`} bg="bg-white" text="text-amber-600" border="ring-amber-100" />
      </div>

      {/* Your existing tables / people section remains unchanged */}
      {err && <div className="text-red-600">{String(err)}</div>}
      {loading && <div className="text-slate-500">Chargement…</div>}

      <MobileFiltersSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        estId={estId} setEstId={setEstId}
        meal={meal} setMeal={setMeal}
        personType={personType} setPersonType={setPersonType}
        status={status} setStatus={setStatus}
        establishmentOptions={establishmentOptions}
        disableStatus={!singleDay}
        onApply={() => {}}
        isManager={isManager}
      />
    </div>
  );
}
