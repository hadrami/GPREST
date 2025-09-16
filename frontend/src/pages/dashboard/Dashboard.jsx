// src/pages/dashboard/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { byDay } from "../../lib/reports.api";

// Petite carte stat non cliquable (on supprime les liens individuels)
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
  const today = dayjs().format("YYYY-MM-DD");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Stats aujourd’hui
  const [planned, setPlanned]   = useState(0);
  const [eaten, setEaten]       = useState(0);
  const [noShow, setNoShow]     = useState(0);

  // Stats 15 jours
  const [planned15, setPlanned15] = useState(0);
  const [eaten15, setEaten15]     = useState(0);
  const [noShow15, setNoShow15]   = useState(0);
  const start15 = dayjs(today).subtract(14, "day"); // 15 jours glissants (inclus)
  const end15   = dayjs(today);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // --- Aujourd’hui
        const { data: d0 } = await byDay({ date: today });
        setPlanned(d0?.planned ?? 0);
        setEaten(d0?.eaten ?? 0);
        setNoShow(d0?.noShow ?? 0);

        // --- 15 derniers jours (simple agrégat en 15 appels; à remplacer par un endpoint dédié si dispo)
        const dates = Array.from({ length: 15 }, (_, i) =>
          dayjs(today).subtract(i, "day").format("YYYY-MM-DD")
        );

        const results = await Promise.allSettled(
          dates.map((dt) => byDay({ date: dt }))
        );

        let p = 0, e = 0, n = 0;
        for (const r of results) {
          if (r.status === "fulfilled") {
            const v = r.value?.data || {};
            p += Number(v.planned || 0);
            e += Number(v.eaten || 0);
            n += Number(v.noShow || 0);
          }
        }
        setPlanned15(p); setEaten15(e); setNoShow15(n);
      } catch (e) {
        setErr(e?.response?.data?.message || e.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [today]);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>

      {err && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {String(err)}
        </div>
      )}

      {/* === Stats du jour === */}
      <section>
        <div className="mb-2 text-sm text-slate-600">
          Statistiques du jour&nbsp;: <b>{dayjs(today).format("DD/MM/YYYY")}</b>
        </div>
        {loading ? (
          <div className="text-slate-500">Chargement…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title="Planifiés aujourd’hui" value={planned}   accent="from-blue-500 to-indigo-500" />
            <StatCard title="Servis aujourd’hui"     value={eaten}     accent="from-emerald-500 to-teal-500" />
            <StatCard title="Absents aujourd’hui"    value={noShow}    accent="from-rose-500 to-pink-500" />
          </div>
        )}
      </section>

      {/* === Stats 15 jours === */}
      <section>
        <div className="mb-2 text-sm text-slate-600">
          Sur <b>15 jours</b> — du <b>{start15.format("DD/MM/YYYY")}</b> au <b>{end15.format("DD/MM/YYYY")}</b>
        </div>
        {loading ? (
          <div className="text-slate-500">Calcul…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title="Planifiés (15 j)" value={planned15} accent="from-blue-500 to-indigo-500" />
            <StatCard title="Servis (15 j)"     value={eaten15}   accent="from-emerald-500 to-teal-500" />
            <StatCard title="Absents (15 j)"    value={noShow15}  accent="from-rose-500 to-pink-500" />
          </div>
        )}
      </section>

      {/* === Lien unique vers la page Rapports === */}
      <div className="pt-2">
        <Link
          to={`/reports/summary?tab=15d&from=${start15.format("YYYY-MM-DD")}&to=${end15.format("YYYY-MM-DD")}`}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
        >
          Pour plus de statistiques et de détails, consultez la page Rapports →
        </Link>
      </div>
    </div>
  );
}
