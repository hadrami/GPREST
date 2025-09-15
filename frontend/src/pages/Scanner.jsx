// src/pages/Scanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Scanner as QrScanner } from "@yudiel/react-qr-scanner";
import { scanVerify } from "../lib/scan.api";

const NO_QR_TIMEOUT_MS = 8000; // auto-close if nothing detected
const OVERLAY_CM = "1cm";      // visual guide box

export default function Scanner() {
  const [result, setResult] = useState(null);           // {status, person?, consumed?, message?}
  const [loading, setLoading] = useState(false);
  const [manualMatricule, setManualMatricule] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [meal, setMeal] = useState("");

  const MEALS = [
  { key: "PETIT_DEJEUNER",   label: "Petit déjeuner" },
  { key: "DEJEUNER",         label: "Déjeuner" },
  { key: "DINER",            label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map(m => [m.key, m.label]));


    

  const [scanning, setScanning] = useState(false);


  const timeoutRef = useRef(null);
  const lockedRef  = useRef(false);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  /* ----------------------- VERIFY API ----------------------- */


  async function verifyMatricule(matricule,meal,date,{ consume }) {
    try {
      setLoading(true);
      const {data}= await scanVerify({ matricule, meal, date, consume });
      setResult(data);
    } catch (e) {
      setResult({ status: "error", message: e?.response?.data?.message || e.message || "Erreur" });
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------- LIB SCANNER ----------------------- */
  function startScanner() {
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
    const text = extractText(payload);
    const matricule = String(text || "").trim();
    if (!matricule || lockedRef.current) return;

    lockedRef.current = true;
    clearTimeout(timeoutRef.current);
    stopScanner(); // CLOSE camera immediately
    verifyMatricule(matricule, meal,date, { consume: true });
  }

  /* -------------------- MANUAL FALLBACK --------------------- */
  function onManualVerify(consume) {
    const mat = manualMatricule.trim();
    if (!mat) return setResult({ status: "error", message: "Saisissez un matricule." });
    verifyMatricule(mat,meal,date,{ consume });
  }

  // Result colors: green only if allowed/consumed; red otherwise
  const isGreen =
    result?.status === "allowed" && (result.consumed === true || result.consumed === undefined);
  const panelClass = isGreen
    ? "bg-green-50 border border-green-300 text-green-800"
    : "bg-red-50 border border-red-300 text-red-800";

  return (
    <div className="p-4 space-y-4">
    <div className="mt-3 flex flex-wrap items-center gap-2">
    <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />

   <select className="border rounded px-3 py-2" value={meal} onChange={(e)=>setMeal(e.target.value)}>
          {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        </div>
      <h1 className="text-xl font-semibold">Scanner QR Code</h1>

      {/* One ergonomic primary button (light green) */}
      <button
        onClick={startScanner}
        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-400 hover:bg-emerald-500 text-white font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
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
          disabled={loading || !manualMatricule.trim()}
          className="px-3 py-2 rounded-lg bg-slate-700 text-white disabled:opacity-50"
        >
          Vérifier
        </button>
        <button
          onClick={() => onManualVerify(true)}
          disabled={loading || !manualMatricule.trim()}
          className="px-3 py-2 rounded-lg bg-amber-600 text-white disabled:opacity-50"
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
