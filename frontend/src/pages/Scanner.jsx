// src/pages/Scanner.jsx
import React, { useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { scanVerify } from "../lib/scan.api.js";

const MEALS = [
  { key: "PETIT_DEJEUNER", label: "Petit déjeuner" },
  { key: "DEJEUNER",       label: "Déjeuner" },
  { key: "DINER",          label: "Dîner" },
];
const MEAL_LABELS = Object.fromEntries(MEALS.map(m => [m.key, m.label]));

export default function Scanner() {
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState("DEJEUNER");

  const [matricule, setMatricule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // hidden file input to trigger camera/gallery on phone
  const fileInputRef = useRef(null);

  const onPickImage = () => {
    setError(null);
    setResult(null);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true); setError(null); setResult(null);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const codeReader = new BrowserMultiFormatReader();
          const res = await codeReader.decodeFromImageUrl(reader.result);
          const text = String(res.getText() || "").trim();
          if (!text) throw new Error("QR vide ou illisible");
          // Put the QR content (matricule) into the field
          setMatricule(text);
        } catch (err) {
          setError(err.message || "Lecture du QR échouée");
        } finally {
          setBusy(false);
          // clear file input so selecting the same image again re-triggers change
          e.target.value = "";
        }
      };
      reader.onerror = () => {
        setBusy(false);
        setError("Impossible de lire le fichier");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setBusy(false);
      setError(err.message || "Erreur lors du scan");
    }
  };

  const verify = async () => {
    if (!matricule.trim()) {
      setError("Veuillez saisir ou scanner un matricule.");
      return;
    }
    setBusy(true); setError(null); setResult(null);
    try {
      const { data } = await scanVerify({ matricule: matricule.trim(), meal, date, consume: false });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyAndConsume = async () => {
    if (!matricule.trim()) {
      setError("Veuillez saisir ou scanner un matricule.");
      return;
    }
    setBusy(true); setError(null); setResult(null);
    try {
      const { data } = await scanVerify({ matricule: matricule.trim(), meal, date, consume: true });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

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

      {/* One ergonomic action: pick/shot a photo to decode the QR */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={onPickImage}
          disabled={busy}
          className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60"
        >
          {busy ? "Lecture en cours…" : "Scanner un QR (photo)"}
        </button>

        {/* Manual fallback input */}
        <input
          value={matricule}
          onChange={(e)=>setMatricule(e.target.value)}
          placeholder="Matricule"
          className="border rounded px-3 py-2"
          style={{ minWidth: 220 }}
        />

        {/* Verify actions */}
        <button
          type="button"
          onClick={verify}
          disabled={busy || !matricule.trim()}
          className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-60"
        >
          Vérifier
        </button>
        <button
          type="button"
          onClick={verifyAndConsume}
          disabled={busy || !matricule.trim()}
          className="px-3 py-2 rounded bg-amber-600 text-white disabled:opacity-60"
          title="Vérifie et enregistre la consommation (empêche les doubles passages)"
        >
          Vérifier + Consommer
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}
      {result && <ResultCard result={result} date={date} meal={meal} />}

      {/* Hidden file input that opens the camera/photos on phone */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

function ResultCard({ result, date, meal }) {
  // Only green when planned & not yet consumed => backend returns { status: "ok" }
  const isGreen = result.status === "ok";
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
