// src/pages/self/SelfMealPlan.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { CheckCircle, AlertTriangle, MinusCircle } from "lucide-react";
import api from "../lib/api"; // reuse your shared Axios instance

// Keep prices consistent with Prestations.jsx
const RATES = {
  student: { petitDej: 2,  dej: 5,  diner: 3  },
  staff:   { petitDej: 15, dej: 50, diner: 25 },
};

const MEALS = [
  { key: "petitDej", label: "Petit déj" },
  { key: "dej",      label: "Déjeuner"  },
  { key: "diner",    label: "Dîner"     },
];

function ymd(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

export default function SelfMealPlan() {
  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const kind = roleUC === "STAFF" ? "staff" : "student"; // choose rate table

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // server state
  const [startDate, setStartDate] = useState(null); // Date
  const [endDate, setEndDate]     = useState(null); // Date
  const [choices, setChoices]     = useState({});   // { 'YYYY-MM-DD': { petitDej, dej, diner } }
  const [status, setStatus]       = useState(null); // 'PENDING_PAYMENT' | 'PAID' | null

  // fetch on mount
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Expected backend payload:
        // {
        //   start: '2025-10-01', end: '2025-10-14',
        //   choices: { '2025-10-01': { petitDej:true, dej:false, diner:false }, ... },
        //   status: 'PENDING_PAYMENT'|'PAID'|null
        // }
        const { data } = await api.get("/mealplans/self");
        if (cancel) return;

        const s = data?.start ? new Date(data.start) : new Date("2025-10-01T00:00:00");
        const e = data?.end   ? new Date(data.end)   : new Date("2025-10-14T00:00:00");
        setStartDate(s);
        setEndDate(e);
        setChoices(data?.choices || {});
        setStatus(data?.status ?? null);
      } catch {/*e*/}
    })();
    return () => { cancel = true; };
  }, []);

  // days in the 15-day window
  const days = useMemo(() => {
    if (!startDate || !endDate) return [];
    const arr = [];
    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) arr.push(ymd(d));
    return arr;
  }, [startDate, endDate]);

  // lock edits when we're within 5 days before the start
  const locked = useMemo(() => {
    if (!startDate) return true;
    const now = new Date();
    const lastEditable = addDays(startDate, -5);
    return now >= lastEditable;
  }, [startDate]);

  // live summary
  const summary = useMemo(() => {
    const r = RATES[kind];
    let c = { petitDej: 0, dej: 0, diner: 0 };
    for (const d of days) {
      const v = choices[d];
      if (!v) continue;
      if (v.petitDej) c.petitDej++;
      if (v.dej) c.dej++;
      if (v.diner) c.diner++;
    }
    const total = c.petitDej * r.petitDej + c.dej * r.dej + c.diner * r.diner;
    return { counts: c, total };
  }, [days, choices, kind]);

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
        start: ymd(startDate),
        end: ymd(endDate),
        choices,
      };
      const { data } = await api.post("/mealplans/self", payload);
      if (data?.status) setStatus(data.status);
    } catch {/*e*/}{
      setError("Échec de l’enregistrement. Réessayez.");
    }
      setSaving(false);
    
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mes choix de repas (15 jours)</h1>
        {status === "PAID" && (
          <span className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded bg-emerald-100 text-emerald-700">
            <CheckCircle size={16} /> Payé
          </span>
        )}
        {status === "PENDING_PAYMENT" && (
          <span className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded bg-red-100 text-red-700">
            <AlertTriangle size={16} /> En attente de paiement
          </span>
        )}
      </div>

      {/* Rules */}
      <div className="rounded-lg border p-3 text-sm leading-6 bg-amber-50">
        <p>
          • Toute sélection entraîne paiement, et toute absence sur un repas sélectionné est également due.
        </p>
        <p>
          • Vous pouvez modifier vos choix jusqu’à <strong>5 jours avant</strong> le début de la période.
          Passé ce délai, les choix sont verrouillés.
        </p>
        <p>
          • Pour le personnel (STAFF), après validation, le statut reste <strong>En attente de paiement</strong>
          jusqu’à confirmation par l’administrateur.
        </p>
      </div>

      {/* Period banner */}
      <div className="rounded-md bg-slate-50 border p-3 text-sm">
        {loading ? (
          <span>Chargement…</span>
        ) : startDate && endDate ? (
          <span>
            Période: <strong>{ymd(startDate)}</strong> → <strong>{ymd(endDate)}</strong>{" "}
            {locked ? (
              <span className="ml-2 text-red-600">(verrouillé)</span>
            ) : (
              <span className="ml-2 text-emerald-700">(modifiable)</span>
            )}
          </span>
        ) : (
          <span className="text-red-600">Période introuvable.</span>
        )}
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {days.map((d) => {
          const sel = choices[d] || { petitDej: false, dej: false, diner: false };
          return (
            <div key={d} className="rounded-xl border p-3">
              <div className="font-medium mb-2">{d}</div>
              <div className="flex gap-2">
                {MEALS.map((m) => {
                  const active = !!sel[m.key];
                  return (
                    <button
                      key={m.key}
                      disabled={locked}
                      onClick={() => toggle(d, m.key)}
                      className={[
                        "flex-1 rounded-lg px-3 py-2 text-sm border transition",
                        active
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white hover:bg-slate-50",
                        locked && "opacity-60 cursor-not-allowed",
                      ].join(" ")}
                      title={locked ? "Période verrouillée" : `Basculer ${m.label}`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary + Save */}
      <div className="rounded-xl border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm">
          <div className="flex gap-4">
            <span>Pt-déj: <strong>{summary.counts.petitDej}</strong></span>
            <span>Déj: <strong>{summary.counts.dej}</strong></span>
            <span>Dîner: <strong>{summary.counts.diner}</strong></span>
          </div>
          <div className="mt-1">
            Montant total:{" "}
            <strong>
              {summary.total} MRU {kind === "staff" ? "(tarifs personnel)" : "(tarifs étudiant)"}
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <span className="inline-flex items-center gap-1 text-red-600 text-sm">
              <MinusCircle size={16} /> {error}
            </span>
          )}
          <button
            onClick={onSave}
            disabled={locked || saving || loading}
            className={[
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
              locked || saving || loading
                ? "bg-slate-300 text-slate-600 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            ].join(" ")}
            title={locked ? "Période verrouillée" : "Enregistrer mes choix"}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
