import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { scanVerify } from "../lib/scan.api.js";

const MEALS = [
  { key: "PETIT_DEJEUNER", label: "Petit déjeuner" },
  { key: "DEJEUNER",       label: "Déjeuner" },
  { key: "DINER",          label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map(m => [m.key, m.label]));

export default function Scanner() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState("DEJEUNER");
  const [matricule, setMatricule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const zxingReaderRef = useRef(null);

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { zxingReaderRef.current?.reset?.(); } catch {/* ignore*/}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function scanQR() {
    setError(null); setResult(null); setBusy(true); setMatricule("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      streamRef.current = stream;

      const video = videoRef.current || document.createElement("video");
      videoRef.current = video;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const started = Date.now();
        const loop = async () => {
          if (!video.videoWidth || !video.videoHeight) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const codes = await detector.detect(canvas);
            const qr = codes?.[0]?.rawValue || "";
            if (qr) {
              setMatricule(String(qr).trim());
              stopCamera();
              setBusy(false);
              return;
            }
          } catch {/* ignore */}
          if (Date.now() - started > 12000) {
            stopCamera();
            setBusy(false);
            setError("Aucun QR détecté. Réessayez.");
            return;
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const reader = new BrowserMultiFormatReader();
      zxingReaderRef.current = reader;
      const started = Date.now();
      await reader.decodeFromVideoElement(video, (res) => {
        if (res) {
          const text = String(res.getText() || "").trim();
          if (text) {
            setMatricule(text);
            stopCamera();
            setBusy(false);
          }
        } else if (Date.now() - started > 12000) {
          stopCamera();
          setBusy(false);
          setError("Aucun QR détecté. Réessayez.");
        }
      });
    } catch (e) {
      stopCamera();
      setBusy(false);
      setError(e?.message || "Impossible d'accéder à la caméra.");
    }
  }

  async function verify() {
    if (!matricule.trim()) { setError("Veuillez scanner ou saisir un matricule."); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const { data } = await scanVerify({ matricule: matricule.trim(), meal, date, consume: false });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndConsume() {
    if (!matricule.trim()) { setError("Veuillez scanner ou saisir un matricule."); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const { data } = await scanVerify({ matricule: matricule.trim(), meal, date, consume: true });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Scanner des repas</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2">
          <span className="text-sm">Date</span>
          <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="border rounded px-2 py-1 w-full" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm">Repas</span>
          <select value={meal} onChange={(e)=>setMeal(e.target.value)} className="border rounded px-2 py-1 w-full">
            {MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={scanQR} disabled={busy}
                className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">
          {busy ? "Scan en cours…" : "Scanner un QR"}
        </button>

        <input value={matricule} onChange={(e)=>setMatricule(e.target.value)}
               placeholder="Matricule" className="border rounded px-3 py-2" style={{ minWidth: 240 }} />

        <button type="button" onClick={verify}
                disabled={busy || !matricule.trim()}
                className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-60">
          Vérifier
        </button>
        <button type="button" onClick={verifyAndConsume}
                disabled={busy || !matricule.trim()}
                className="px-3 py-2 rounded bg-amber-600 text-white disabled:opacity-60"
                title="Vérifie et enregistre la consommation">
          Vérifier + Consommer
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}
      {result && <ResultCard result={result} date={date} meal={meal} />}

      {/* hidden elements used internally, not displayed */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function ResultCard({ result, date, meal }) {
  const isGreen = result.status === "ok" || result.status === "consumed";
  const bg = isGreen
    ? "bg-green-100 border-green-300 text-green-800"
    : "bg-red-100 border-red-300 text-red-800";
  const mealLabel = MEAL_LABELS[meal] || meal;

  return (
    <div className={`border rounded p-4 ${bg}`}>
      <div className="font-semibold mb-1">
        {isGreen ? "ACCEPTÉ" : "REFUSÉ"} — {result.status}
      </div>
      {result.person && (
        <div className="text-sm space-y-0.5">
          <div><span className="font-medium">Nom:</span> {result.person.name ?? "—"}</div>
          <div><span className="font-medium">Matricule:</span> {result.person.matricule ?? "—"}</div>
        </div>
      )}
      <div className="text-sm mt-1">
        <span className="font-medium">Date:</span> {date} • <span className="font-medium">Repas:</span> {mealLabel}
      </div>
      {result.status === "already_consumed" && result.consumedAt && (
        <div className="text-xs mt-1 opacity-80">
          Consommé à: {new Date(result.consumedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
