// src/pages/SelfMealPlan.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  CheckCircle,
  AlertTriangle,
  MinusCircle,
  CalendarDays,
  Loader2,
  User2,
  Info,
  Coins,
} from "lucide-react";
import api from "../lib/api";

// Tarifs (student vs staff)
const RATES = {
  student: { petitDej: 2, dej: 5, diner: 3 },
  staff:   { petitDej: 15, dej: 50, diner: 25 },
};

const MEALS = [
  { key: "petitDej", label: "Petit déj" },
  { key: "dej",      label: "Déjeuner"  },
  { key: "diner",    label: "Dîner"     },
];

const fmtISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
const addDays = (d, n) => {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
};
const lastDayOfMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

/** Two windows per month:
 *  1..15  and  16..(end)
 *  Editable until (start - 5 days).
 *  We pick the next window whose (start - 5) is still in the future.
 */
function computeUpcomingWindow(now = new Date()) {
  const probe = new Date(now);
  probe.setHours(0, 0, 0, 0);

  for (let i = 0; i < 18; i++) {
    const y = probe.getFullYear();
    const m0 = probe.getMonth() + i;
    const monthStart = new Date(y, m0, 1);
    const firstStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const firstEnd   = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15); // 1..15
    const secondStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 16); // 16..
    const secondEnd   = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      lastDayOfMonth(firstStart.getFullYear(), firstStart.getMonth())
    );

    if (now < addDays(firstStart, -5)) return { start: firstStart, end: firstEnd };
    if (now < addDays(secondStart, -5)) return { start: secondStart, end: secondEnd };
  }
  // Fallback: next month first half
  const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: nx, end: new Date(nx.getFullYear(), nx.getMonth(), 15) };
}

export default function SelfMealPlan() {
  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const isStaff = roleUC === "STAFF";
  const kind = isStaff ? "staff" : "student";
  const rates = RATES[kind];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [choices, setChoices] = useState({}); // { 'YYYY-MM-DD': { petitDej, dej, diner } }
  const [status, setStatus] = useState(null); // 'PENDING_PAYMENT' | 'PAID' | null

  // initial load
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/mealplans/self");
        if (cancel) return;
        if (data?.start && data?.end) {
          setStartDate(new Date(`${data.start}T00:00:00`));
          setEndDate(new Date(`${data.end}T00:00:00`));
        } else {
          const w = computeUpcomingWindow(new Date());
          setStartDate(w.start);
          setEndDate(w.end);
        }
        setChoices(data?.choices || {});
        setStatus(data?.status ?? null);
      } catch (e) {
        const w = computeUpcomingWindow(new Date());
        setStartDate(w.start);
        setEndDate(w.end);
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          "Impossible de charger vos données.";
        setError(msg);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const days = useMemo(() => {
    if (!startDate || !endDate) return [];
    const arr = [];
    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
      arr.push(fmtISO(d));
    }
    return arr;
  }, [startDate, endDate]);

  // Lock (5 days before start)
  const locked = useMemo(() => {
    if (!startDate) return true;
    return new Date() >= addDays(startDate, -5);
  }, [startDate]);

  // Summary (counts + totals)
  const summary = useMemo(() => {
    const counts = { petitDej: 0, dej: 0, diner: 0 };
    for (const d of days) {
      const v = choices[d];
      if (!v) continue;
      if (v.petitDej) counts.petitDej++;
      if (v.dej) counts.dej++;
      if (v.diner) counts.diner++;
    }
    const line = {
      petitDej: counts.petitDej * rates.petitDej,
      dej: counts.dej * rates.dej,
      diner: counts.diner * rates.diner,
    };
    const total = line.petitDej + line.dej + line.diner;
    return { counts, line, total };
  }, [choices, days, rates]);

  const toggle = (day, mealKey) => {
    if (locked) return;
    setChoices((prev) => {
      const base = prev[day] || { petitDej: false, dej: false, diner: false };
      return { ...prev, [day]: { ...base, [mealKey]: !base[mealKey] } };
    });
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { start: fmtISO(startDate), end: fmtISO(endDate), choices };
      const { data } = await api.post("/mealplans/self", payload);
      if (data?.status) setStatus(data.status);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Échec de l’enregistrement. Réessayez.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top row: title + user chip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarDays className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Planifier mes repas</h1>
        </div>

        {/* User / Matricule chip */}
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200">
          <User2 className="h-4 w-4" />
          <span className="font-medium">{user?.name || "Utilisateur"}</span>
          {user?.matricule && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold">
              Matricule: {user.matricule}
            </span>
          )}
          <span className="ml-2 text-xs uppercase opacity-80">({roleUC})</span>
        </div>
      </div>

      {/* Instructions & tarifs */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow">
            <Info className="h-5 w-5" />
          </div>
          <div className="flex-1 text-[15px] leading-7 text-emerald-900">
            {startDate && endDate && (
              <p className="mb-1">
                <span className="font-semibold">Période affichée:</span>{" "}
                <span className="font-bold">
                  {fmtISO(startDate)} → {fmtISO(endDate)}
                </span>{" "}
                (moitié du mois: <b>1→15</b> ou <b>16→fin</b>).
              </p>
            )}
            <ul className="list-disc pl-5">
              <li>
                Les choix sont <b>verrouillés 5 jours avant</b> le début de la période.
              </li>
              <li>
                Chaque repas sélectionné est <b>payant</b>. Une absence sur un repas réservé reste due.
              </li>
            </ul>

            {/* Tarifs */}
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-300 shadow-sm">
              <Coins className="h-4 w-4" />
              <span className="font-semibold">Tarifs&nbsp;{isStaff ? "personnel" : "étudiant"}:</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200">
                Petit déj&nbsp;<b>{rates.petitDej}</b> MRU
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200">
                Déjeuner&nbsp;<b>{rates.dej}</b> MRU
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200">
                Dîner&nbsp;<b>{rates.diner}</b> MRU
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Staff payment notice */}
      {isStaff && status === "PENDING_PAYMENT" && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-semibold">En attente de paiement</div>
              <div>Réglez auprès de l’administration. Votre plan sera validé après confirmation.</div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 shadow-sm">
          <div className="flex items-center gap-2">
            <MinusCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Days grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center gap-2 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : (
          days.map((d) => {
            const v = choices[d] || { petitDej: false, dej: false, diner: false };
            const lockCls = locked ? "opacity-60" : "";
            return (
              <div
                key={d}
                className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold tracking-tight text-slate-800">{d}</div>
                  {locked && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                      Verrouillé
                    </span>
                  )}
                </div>

                <div className={`grid grid-cols-3 gap-2 ${lockCls}`}>
                  {MEALS.map((m) => {
                    const active = !!v[m.key];
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => toggle(d, m.key)}
                        disabled={locked}
                        aria-pressed={active}
                        className={[
                          "px-3 py-2 rounded-xl text-sm font-medium transition shadow-sm ring-1",
                          active
                            ? "bg-primary text-white ring-primary/60 shadow-inner"
                            : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                          locked && "cursor-not-allowed",
                        ].join(" ")}
                        title={
                          active
                            ? `${m.label} sélectionné`
                            : `Ajouter ${m.label}`
                        }
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary & actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">Récapitulatif</div>
          </div>

          {/* Line items */}
          <div className="space-y-2 text-sm text-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200">
                Petit déj: <b>{summary.counts.petitDej}</b> × {rates.petitDej} MRU
              </span>
              <span className="ml-auto font-semibold">
                = {summary.line.petitDej} MRU
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200">
                Déjeuner: <b>{summary.counts.dej}</b> × {rates.dej} MRU
              </span>
              <span className="ml-auto font-semibold">
                = {summary.line.dej} MRU
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200">
                Dîner: <b>{summary.counts.diner}</b> × {rates.diner} MRU
              </span>
              <span className="ml-auto font-semibold">
                = {summary.line.diner} MRU
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="mt-3 flex items-center justify-end">
            <div className="rounded-xl bg-primary/10 px-4 py-2 text-primary ring-1 ring-primary/20">
              Total à payer:{" "}
              <b className="tabular-nums">{summary.total}</b> MRU{" "}
              <span className="opacity-70">
                ({isStaff ? "tarifs personnel" : "tarifs étudiant"})
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => !locked && setChoices({})}
              disabled={locked || saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={locked || saving}
              title={locked ? "Verrouillé (moins de 5 jours avant le début)" : "Enregistrer mes choix"}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-primary/40 hover:brightness-105 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle className="h-4 w-4" />
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
