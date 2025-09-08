// src/Reports/Summary.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { byDay, byWeek, byMonth } from "../lib/reports.api"; // <- new
import { apiListEstablishments } from "../lib/establishments.api"; // <- new (next section) optional

const tabs = [
  { key: "day",   label: "Jour" },
  { key: "week",  label: "Semaine" },
  { key: "month", label: "Mois" },
];

export default function Summary() {
  const [active, setActive] = useState("week"); // you said byWeek already works
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  // optional: filter by établissement
  const [establishments, setEstablishments] = useState([]);
  const [estId, setEstId] = useState("");

  // controls
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));              // day
  const [weekStart, setWeekStart] = useState(dayjs().startOf("week").format("YYYY-MM-DD")); // week
  const [year, setYear] = useState(dayjs().year());                            // month
  const [month, setMonth] = useState(dayjs().month() + 1);                     // 1..12
  const [meal, setMeal] = useState("");                                        // '', 'PETIT_DEJEUNER', 'DEJEUNER', 'DINER'
  const [status, setStatus] = useState("");                                    // for day: '', 'used', 'unused'

  // Load établissements (optional)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiListEstablishments();
        setEstablishments(data.items || data);
      } catch { /* ignore */ }
    })();
  }, []);

  const params = useMemo(() => {
    const base = {};
    if (estId) base.establishmentId = estId;
    if (meal)  base.meal = meal;

    if (active === "day") {
      return { ...base, date, ...(status ? { status } : {}) };
    }
    if (active === "week") {
      return { ...base, weekStart };
    }
    // month
    return { ...base, year, month: Number(month) };
  }, [active, date, weekStart, year, month, meal, status, estId]);

  useEffect(() => {
    (async () => {
      setErr(null); setLoading(true);
      try {
        let res;
        if (active === "day")   res = await byDay(params);
        else if (active === "week")  res = await byWeek(params);
        else                    res = await byMonth(params);
        setData(res.data);
      } catch (e) {
        setErr(e?.response?.data?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [active, params]);

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-3 py-2 rounded-md border ${active===t.key ? "bg-black text-white" : ""}`}
            onClick={() => setActive(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* établissement */}
        <div className="flex flex-col">
          <label className="text-xs">Établissement</label>
          <select value={estId} onChange={(e)=>setEstId(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="">Tous</option>
            {establishments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {/* meal */}
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
                <option value="used">Utilisés</option>
                <option value="unused">Non utilisés</option>
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

      {/* Results */}
      <div className="min-h-24 border rounded-md p-4 bg-white">
        {loading && <div>Chargement…</div>}
        {err && <div className="text-red-600">{err}</div>}
        {!loading && !err && (
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
