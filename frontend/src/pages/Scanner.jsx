// src/pages/Scanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Scanner as QrScanner } from "@yudiel/react-qr-scanner";
import { scanVerify } from "../lib/scan.api";

const NO_QR_TIMEOUT_MS = 8000; // auto-close if nothing detected
const OVERLAY_CM = "1cm";      // visual guide box

// Meal keys expected by backend
const MEALS = [
  { key: "PETIT_DEJEUNER", label: "Petit déjeuner" },
  { key: "DEJEUNER",       label: "Déjeuner" },
  { key: "DINER",          label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map(m => [m.key, m.label]));

// Time windows in minutes from midnight [start, end]
const WINDOWS = [
  { key: "PETIT_DEJEUNER", start: 6 * 60 + 0,  end: 8 * 60 + 40 },  // 06:00 - 08:40
  { key: "DEJEUNER",       start: 12 * 60 + 45, end: 14 * 60 + 45 }, // 12:45 - 14:45
  { key: "DINER",          start: 18 * 60 + 0,  end: 20 * 60 + 15 }, // 18:00 - 20:15
];

function two(n) { return String(n).padStart(2, "0"); }
function fmtHM(mins) { const h = Math.floor(mins / 60), m = mins % 60; return `${two(h)}:${two(m)}`; }
function todayIsoDate(d = new Date()) { return d.toISOString().slice(0, 10); }

function getMinutesSinceMidnight(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Determine scan availability based on current time.
 * Returns:
 *  - { scannable: true, mealKey, window } when inside a window
 *  - { scannable: false, next: { mealKey, startMins, isTomorrow } } when outside
 */
function resolveWindowStatus(now = new Date()) {
  const mins = getMinutesSinceMidnight(now);

  // Inside which window?
  for (const w of WINDOWS) {
    if (mins >= w.start && mins <= w.end) {
      return { scannable: true, mealKey: w.key, window: w };
    }
  }

  // Next window today?
  const upcoming = WINDOWS.find(w => mins < w.start);
  if (upcoming) {
    return {
      scannable: false,
      next: { mealKey: upcoming.key, startMins: upcoming.start, isTomorrow: false },
    };
  }

  // After last window → next is tomorrow's first window
  const firstTomorrow = WINDOWS[0];
  return {
    scannable: false,
    next: { mealKey: firstTomorrow.key, startMins: firstTomorrow.start, isTomorrow: true },
  };
}

export default function Scanner() {
  const [result, setResult] = useState(null);           // {status, person?, consumed?, message?}
  const [loading, setLoading] = useState(false);
  const [manualMatricule, setManualMatricule] = useState("");

  // Derived, not editable anymore:
  const [today, setToday] = useState(() => todayIsoDate());
  const [status, setStatus] = useState(() => resolveWindowStatus());

  const [scanning, setScanning] = useState(false);
  const timeoutRef = useRef(null);
  const lockedRef  = useRef(false);

  // Keep time badges & availability fresh every 20s
  useEffect(() => {
    const tick = () => {
      setToday(todayIsoDate());
      setStatus(resolveWindowStatus());
    };
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  async function verifyMatricule(matricule, { consume }) {
    try {
      setLoading(true);
      const meal = status.scannable ? status.mealKey : null;
      const date = today; // locked to today
      if (!meal) {
        setResult({ status: "error", message: "En dehors des horaires — scan désactivé." });
        return;
      }
      const { data } = await scanVerify({ matricule, meal, date, consume });
      setResult(data);
    } catch (e) {
      setResult({
        status: "error",
        message: e?.response?.data?.message || e.message || "Erreur",
      });
    } finally {
      setLoading(false);
    }
  }

  function startScanner() {
    if (!status.scannable) {
      setResult({ status: "error", message: "En dehors des horaires — scan désactivé." });
      return;
    }
    setResult(null);
    lockedRef.current = false;
    setScanning(true);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      stopScanner();
      setResult({ status: "no_qr", message: "Aucun QR détecté. Réessayez." });
    }, NO_QR_TIMEOUT_MS);
  }

  function stopScanner() {
    clearTimeout(timeoutRef.current);
    setScanning(false);
    lockedRef.current = false;
  }

  // Extract text from various payload shapes
  function extractText(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (Array.isArray(payload)) {
      const p = payload[0];
      return p?.rawValue || p?.text || p?.decodedText || (p?.getText?.() ?? "");
    }
    return payload.decodedText || payload.rawValue || payload.text || (payload.getText?.() ?? "");
  }

  function onDecode(payload) {
    if (!status.scannable) {
      stopScanner();
      setResult({ status: "error", message: "En dehors des horaires — scan désactivé." });
      return;
    }

    const text = extractText(payload);
    const matricule = String(text || "").trim();
    if (!matricule || lockedRef.current) return;

    lockedRef.current = true;
    clearTimeout(timeoutRef.current);
    stopScanner(); // CLOSE camera immediately
    verifyMatricule(matricule, { consume: true });
  }

  function onManualVerify(consume) {
    if (!status.scannable) {
      setResult({ status: "error", message: "En dehors des horaires — scan désactivé." });
      return;
    }
    const mat = manualMatricule.trim();
    if (!mat) return setResult({ status: "error", message: "Saisissez un matricule." });
    verifyMatricule(mat, { consume });
  }

  // Result colors: green only if allowed/consumed; red otherwise
  const isGreen =
    result?.status === "allowed" && (result.consumed === true || result.consumed === undefined);
  const panelClass = isGreen
    ? "bg-green-50 border border-green-300 text-green-800"
    : "bg-red-50 border border-red-300 text-red-800";

  // Badges (read-only): today + current/next meal
  const mealBadge = (() => {
    if (status.scannable) {
      return {
        text: `${MEAL_LABELS[status.mealKey]} — fenêtre ouverte`,
        className:
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-900 border border-emerald-300",
      };
    }
    const next = status.next;
    const when = next.isTomorrow ? `demain ${fmtHM(next.startMins)}` : `à ${fmtHM(next.startMins)}`;
    return {
      text: `Prochain: ${MEAL_LABELS[next.mealKey]} ${when}`,
      className:
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-rose-100 text-rose-900 border border-rose-300",
    };
  })();

  return (
    <div className="p-4 space-y-4">
      {/* Read-only badges replacing the old inputs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-800 border border-slate-300">
          {today}
        </span>
        <span className={mealBadge.className}>{mealBadge.text}</span>
      </div>

      <h1 className="text-xl font-semibold">Scanner QR Code</h1>

      {/* One ergonomic primary button (light green) */}
      <button
        onClick={startScanner}
        disabled={!status.scannable}
        className={`w-full sm:w-auto px-5 py-3 rounded-2xl text-white font-medium shadow-sm focus:outline-none focus:ring-2 ${
          status.scannable
            ? "bg-emerald-400 hover:bg-emerald-500 focus:ring-emerald-300"
            : "bg-gray-300 cursor-not-allowed"
        }`}
      >
        Scanner QR
      </button>

      {/* Library scanner view */}
      {scanning && (
        <div className="max-w-md mx-auto relative mt-2">
          <QrScanner
            onDecode={onDecode}
            onScan={onDecode}
            onResult={onDecode}
            onError={(err) => {
              console.error("Scanner error:", err);
              stopScanner();
              setResult({ status: "error", message: "Caméra indisponible." });
            }}
            constraints={{
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 }, height: { ideal: 720 },
              advanced: [{ focusMode: "continuous" }],
            }}
            styles={{ container: { width: "100%", borderRadius: "0.75rem", overflow: "hidden" } }}
          />
          {/* Small visual guide box (1cm) */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="border-2 border-white/70 rounded-md" style={{ width: OVERLAY_CM, height: OVERLAY_CM }} />
          </div>
        </div>
      )}

      {/* Manual fallback */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={manualMatricule}
          onChange={(e) => setManualMatricule(e.target.value)}
          placeholder="Matricule (saisie manuelle)"
          className="border rounded-lg px-3 py-2"
          style={{ minWidth: 240 }}
        />
        <button
          onClick={() => onManualVerify(false)}
          disabled={loading || !manualMatricule.trim() || !status.scannable}
          className="px-3 py-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed bg-slate-700"
        >
          Vérifier
        </button>
        <button
          onClick={() => onManualVerify(true)}
          disabled={loading || !manualMatricule.trim() || !status.scannable}
          className="px-3 py-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600"
        >
          Vérifier + Consommer
        </button>
      </div>

      {(loading || result) && (
        <div className={`rounded-lg p-3 ${panelClass}`}>
          {loading ? (
            <div>Vérification…</div>
          ) : (
            <>
              <div className="font-medium">
                {isGreen && "✅ Autorisé (consommé)"}
                {!isGreen && result?.status === "already_consumed" && "❌ Déjà consommé"}
                {!isGreen && result?.status === "not_planned" && "❌ Pas de repas planifié"}
                {!isGreen && result?.status === "not_found" && "❌ Matricule inconnu"}
                {!isGreen && result?.status === "no_qr" && "❌ Aucun QR détecté"}
                {!isGreen &&
                  result?.status &&
                  !["already_consumed", "not_planned", "not_found", "no_qr"].includes(result?.status ?? "") &&
                  "❌ Erreur"}
              </div>

              {result?.person && (
                <div className="text-sm mt-1 space-y-0.5">
                  <div><span className="font-semibold">Nom:</span> {result.person.name ?? "—"}</div>
                  <div><span className="font-semibold">Matricule:</span> {result.person.matricule ?? "—"}</div>
                </div>
              )}

              {result?.message && <div className="text-sm mt-1">{result.message}</div>}
              {!status.scannable && (
                <div className="text-sm mt-2">
                  🔒 Scan désactivé: en dehors des horaires autorisés.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
