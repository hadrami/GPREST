import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { byDay } from "../../lib/reports.api";

function StatCard({ title, value, to, accent = "from-emerald-500 to-teal-500" }) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl overflow-hidden shadow-lg ring-1 ring-slate-200 bg-white transition hover:-translate-y-0.5"
    >
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
      <div className="p-5 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-600">{title}</div>
          <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="rounded-full bg-slate-50 ring-1 ring-slate-200 p-3">
          {/* simple user/meal glyph */}
          <svg className="w-9 h-9 text-emerald-600 group-hover:text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 14c-4 0-7 3-7 7h14c0-4-3-7-7-7zm0-2a5 5 0 100-10 5 5 0 000 10z" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const today = dayjs().format("YYYY-MM-DD");

  // live stats for today
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [planned, setPlanned] = useState(0);
  const [eaten, setEaten] = useState(0);
  const [noShow, setNoShow] = useState(0);
  const rate = planned > 0 ? Math.round((eaten / planned) * 100) : 0;

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        const { data } = await byDay({ date: today });
        setPlanned(data?.planned ?? 0);
        setEaten(data?.eaten ?? 0);
        setNoShow(data?.noShow ?? 0);
      } catch (e) {
        setErr(e?.response?.data?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [today]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Welcome / context */}
      <div className="bg-secondary/20 rounded-xl shadow p-5 mb-6">
        <h2 className="text-2xl font-bold text-primary">Tableau de bord</h2>
        <p className="text-slate-600">Statistiques du jour ({today}) sur les repas planifiés et consommés.</p>
      </div>

      {err && <div className="text-red-600 mb-4">{String(err)}</div>}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Planifiés (aujourd’hui)"
          value={loading ? "…" : planned}
          to={`/reports?tab=day&date=${today}`}
          accent="from-sky-500 to-blue-500"
        />
        <StatCard
          title="Ont mangé"
          value={loading ? "…" : eaten}
          to={`/reports?tab=day&date=${today}&status=used`}
          accent="from-emerald-500 to-green-600"
        />
        <StatCard
          title="Absents"
          value={loading ? "…" : noShow}
          to={`/reports?tab=day&date=${today}&status=unused`}
          accent="from-rose-500 to-pink-500"
        />
        <StatCard
          title="Taux de présence"
          value={loading ? "…" : `${rate}%`}
          to={`/reports?tab=day&date=${today}`}
          accent="from-amber-500 to-orange-500"
        />
      </div>

      {/* Quick links */}
      <div className="mt-6">
        <button
          onClick={() => navigate(`/reports?tab=week&weekStart=${dayjs().startOf("week").format("YYYY-MM-DD")}`)}
          className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
        >
          Ouvrir le rapport de la semaine
        </button>
      </div>
    </div>
  );
}
