import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { byDay } from "../../lib/reports.api";
import { useSelector } from "react-redux";

// Small non-clickable stat card (keeps your current look)
function StatCard({ title, value, accent = "from-emerald-500 to-teal-500" }) {
  return (
    <div className="group block rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-200 bg-white">
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
      <div className="p-5">
        <div className="text-sm text-slate-600">{title}</div>
        <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const isManager = roleUC === "MANAGER";
  const managerEstablishmentId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";

  const today = dayjs().format("YYYY-MM-DD");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Today
  const [planned, setPlanned] = useState(0);
  const [eaten, setEaten] = useState(0);
  const [noShow, setNoShow] = useState(0);

  // Last 15 days (rolling)
  const [planned15, setPlanned15] = useState(0);
  const [eaten15, setEaten15] = useState(0);
  const [noShow15, setNoShow15] = useState(0);
  const start15 = dayjs(today).subtract(14, "day");
  const end15 = dayjs(today);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const baseParams = {
          establishmentId: isManager ? managerEstablishmentId : undefined,
        };

        // --- Today
        const t = await byDay({ ...baseParams, date: today });
        const p = Number(t?.data?.planned ?? 0);
        const e = Number(t?.data?.eaten ?? 0);
        setPlanned(p);
        setEaten(e);
        setNoShow(Math.max(0, p - e));

        // --- 15-day rolling window
        let p15 = 0, e15 = 0;
        let d = start15;
        while (d.isSame(end15, "day") || d.isBefore(end15)) {
          const dateStr = d.format("YYYY-MM-DD");
          // Accumulate per-day totals to avoid changing your API
          const r = await byDay({ ...baseParams, date: dateStr });
          p15 += Number(r?.data?.planned ?? 0);
          e15 += Number(r?.data?.eaten ?? 0);
          d = d.add(1, "day");
        }
        setPlanned15(p15);
        setEaten15(e15);
        setNoShow15(Math.max(0, p15 - e15));
      } catch (e) {
        setErr(e?.response?.data?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [today, isManager, managerEstablishmentId]);

  const rate = planned > 0 ? Math.round((eaten / planned) * 100) : 0;
  const rate15 = planned15 > 0 ? Math.round((eaten15 / planned15) * 100) : 0;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Tableau de bord</h1>
        {isManager && (
          <div className="text-sm text-slate-600">
            Résultats de votre établissement (filtrés automatiquement)
          </div>
        )}
      </div>

      {err && <div className="text-red-600">{String(err)}</div>}
      {loading && <div className="text-slate-500">Chargement…</div>}

      {/* Today’s KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Planifiés (aujourd’hui)" value={planned} />
        <StatCard title="Ont mangé (aujourd’hui)" value={eaten} accent="from-sky-500 to-indigo-500" />
        <StatCard title="Absents (aujourd’hui)" value={noShow} accent="from-rose-500 to-pink-500" />
        <StatCard title="Taux de présence (aujourd’hui)" value={`${rate}%`} accent="from-amber-500 to-orange-500" />
      </div>

      {/* Rolling 15-day KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Planifiés (15 jours)" value={planned15} />
        <StatCard title="Ont mangé (15 jours)" value={eaten15} accent="from-sky-500 to-indigo-500" />
        <StatCard title="Absents (15 jours)" value={noShow15} accent="from-rose-500 to-pink-500" />
        <StatCard title="Taux de présence (15 jours)" value={`${rate15}%`} accent="from-amber-500 to-orange-500" />
      </div>
    </div>
  );
}
