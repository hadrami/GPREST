// src/pages/SelfMealPlan.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { CheckCircle, AlertTriangle, MinusCircle, CalendarDays, Loader2 } from "lucide-react";
import api from "../lib/api"; // your shared Axios instance

// Keep prices aligned with Prestations.jsx
const RATES = {
  student: { petitDej: 2, dej: 5, diner: 3 },
  staff: { petitDej: 15, dej: 50, diner: 25 },
};

const MEALS = [
  { key: "petitDej", label: "Petit déj" },
  { key: "dej", label: "Déjeuner" },
  { key: "diner", label: "Dîner" },
];

const fmtISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
};
const lastDayOfMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

/** Two booking windows per month:
 *  - 1..14
 *  - 15..(end of month)
 *  Editable until (start - 5 days). We pick the earliest *upcoming* window whose (start - 5) is still in the future.
 */
function computeUpcomingWindow(now = new Date()) {
  const probe = new Date(now);
  probe.setHours(0, 0, 0, 0);

  for (let i = 0; i < 18; i++) {
    const y = probe.getFullYear();
    const m0 = probe.getMonth() + i; // may overflow; Date will normalize
    const monthStart = new Date(y, m0, 1);
    const firstStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const firstEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 14);
    const secondStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15);
    const secondEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), lastDayOfMonth(firstStart.getFullYear(), firstStart.getMonth()));

    const firstLock = addDays(firstStart, -5);
    if (now < firstLock) return { start: firstStart, end: firstEnd };

    const secondLock = addDays(secondStart, -5);
    if (now < secondLock) return { start: secondStart, end: secondEnd };
  }
  // Fallback: next month first half
  const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: nx, end: new Date(nx.getFullYear(), nx.getMonth(), 14) };
}

export default function SelfMealPlan() {
  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const isStaff = roleUC === "STAFF";
  const kind = isStaff ? "staff" : "student";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // server state
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  // choices: { 'YYYY-MM-DD': { petitDej, dej, diner } }
  const [choices, setChoices] = useState({});
  // server can send: 'PENDING_PAYMENT' | 'PAID' | null
  const [status, setStatus] = useState(null);

  // Fetch initial (window + any saved selections).
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Expected payload:
        // { start:'YYYY-MM-DD', end:'YYYY-MM-DD', choices:{'YYYY-MM-DD':{...}}, status:'PENDING_PAYMENT'|'PAID'|null }
        // If backend hasn’t implemented yet, we fallback to computed 1..14 / 15..end window.
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
      } catch {
        // Fallback window if GET isn't available yet
        const w = computeUpcomingWindow(new Date());
        setStartDate(w.start);
        setEndDate(w.end);
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

  // Lock when we’re within 5 days before the start.
  const locked = useMemo(() => {
    if (!startDate) return true;
    const lastEditable = addDays(startDate, -5);
    return new Date() >= lastEditable;
  }, [startDate]);

  const summary = useMemo(() => {
    const r = RATES[kind];
    const counts = { petitDej: 0, dej: 0, diner: 0 };
    for (const d of days) {
      const v = choices[d];
      if (!v) continue;
      if (v.petitDej) counts.petitDej++;
      if (v.dej) counts.dej++;
      if (v.diner) counts.diner++;
    }
    const total = counts.petitDej * r.petitDej + counts.dej * r.dej + counts.diner * r.diner;
    return { counts, total };
  }, [choices, days, kind]);

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
      const payload = {
        start: fmtISO(startDate),
        end: fmtISO(endDate),
        choices,
      };
      // Backend should persist + (for STAFF) mark status=PENDING_PAYMENT until admin confirms
      const { data } = await api.post("/mealplans/self", payload);
      if (data?.status) setStatus(data.status);
    } catch {
      setError("Échec de l’enregistrement. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">Planifier mes repas</h1>
      </div>

      {/* Window + rules */}
      <div className="rounded border p-3 bg-white">
        {startDate && endDate && (
          <p className="text-sm">
            Période affichée :{" "}
            <b>
              {fmtISO(startDate)} → {fmtISO(endDate)}
            </b>
            . Vous pouvez choisir vos repas pour cette période. Les choix sont
            <b> verrouillés 5 jours avant le début</b> de la période.
          </p>
        )}
        <ul className="mt-2 text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>Vous devrez payer pour chaque repas choisi.</li>
          <li>Un repas réservé mais non consommé reste dû.</li>
        </ul>
      </div>

      {/* Status / payment (for STAFF) */}
      {isStaff && status === "PENDING_PAYMENT" && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">En attente de paiement</div>
            <div>Veuillez régler auprès de l’administration. Votre plan sera validé après confirmation.</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded border p-3 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Grid of days */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center gap-2 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : (
          days.map((d) => {
            const v = choices[d] || { petitDej: false, dej: false, diner: false };
            const disabledCls = locked ? "opacity-50 pointer-events-none" : "";
            return (
              <div key={d} className="border rounded-md p-3 bg-white">
                <div className="font-medium">{d}</div>
                <div className={`mt-2 grid grid-cols-3 gap-2 ${disabledCls}`}>
                  {MEALS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggle(d, m.key)}
                      className={[
                        "px-2 py-2 rounded-md border text-sm",
                        v[m.key] ? "bg-primary text-white border-primary" : "bg-white",
                      ].join(" ")}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {locked && (
                  <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                    <MinusCircle className="h-4 w-4" />
                    Verrouillé (période imminente)
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Summary + actions */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border p-3 bg-white md:col-span-2">
          <div className="font-medium mb-2">Récapitulatif</div>
          <div className="text-sm text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-y-1">
            <div>Petit déj : <b>{summary.counts.petitDej}</b></div>
            <div>Déjeuner : <b>{summary.counts.dej}</b></div>
            <div>Dîner : <b>{summary.counts.diner}</b></div>
            <div className="sm:col-span-1 col-span-2">Total : <b>{summary.total}</b> MRU</div>
          </div>
        </div>
        <div className="rounded border p-3 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (locked) return;
              setChoices({});
            }}
            className="px-3 py-2 rounded-md border"
            disabled={locked || saving}
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-md bg-primary text-white disabled:opacity-50 flex items-center gap-2"
            disabled={locked || saving}
            title={locked ? "Verrouillé (moins de 5 jours avant le début)" : "Enregistrer mes choix"}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <CheckCircle className="h-4 w-4" />
            Enregistrer
          </button>
        </div>
      </div>

      {/* Who am I (read-only) */}
      <div className="rounded border p-3 bg-white text-sm text-slate-700">
        <div>
          Utilisateur : <b>{user?.name || "—"}</b>{" "}
          <span className="text-slate-500">({String(user?.role || "").toUpperCase()})</span>
        </div>
        {user?.matricule && (
          <div>Matricule : <b>{user.matricule}</b></div>
        )}
      </div>
    </div>
  );
}
