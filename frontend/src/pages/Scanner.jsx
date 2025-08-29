import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import api from "../lib/api";

const COLORS = {
  ok: "bg-green-600",
  bad: "bg-red-600",
  warn: "bg-amber-600",
};

export default function Scanner() {
  const videoRef = useRef(null);
  const [banner, setBanner] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    reader.decodeFromVideoDevice(null, videoRef.current, async (res) => {
      if (!res) return;
      try {
        // QR expected to contain JSON: { p: base64payload, s: signature }
        const parsed = JSON.parse(res.getText());
        const r = await api.post("/tickets/validate", { payloadBase64: parsed.p, sig: parsed.s });
        setBanner({ text: `✅ OK — ${r.data.student?.nom} ${r.data.student?.prenom} (${r.data.meal})`, color: COLORS.ok });
        setHistory(h => [{ ts: new Date().toLocaleTimeString(), status: "OK", meta: r.data.student?.matricule }, ...h].slice(0,10));
        navigator.vibrate?.(50);
      } catch (e) {
        const reason = e.response?.data?.reason || "Erreur";
        const color =
          reason === "already_used" || reason === "signature_invalid" || reason === "not_found"
          ? COLORS.bad
          : COLORS.warn;
        setBanner({ text: `❌ ${reason}`, color });
        setHistory(h => [{ ts: new Date().toLocaleTimeString(), status: reason, meta: "" }, ...h].slice(0,10));
        navigator.vibrate?.([60, 60]);
      }
    });
    return () => reader.reset();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Scanner</h1>
      {banner && <div className={`text-white px-4 py-3 rounded ${banner.color}`}>{banner.text}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <video ref={videoRef} className="w-full aspect-video rounded-lg border shadow" muted autoPlay playsInline />
        <div className="bg-white border rounded-lg p-3 shadow">
          <div className="font-semibold mb-2">Last scans</div>
          <ul className="space-y-2 text-sm">
            {history.map((it,i)=>(
              <li key={i} className="flex justify-between">
                <span className="text-slate-600">{it.ts}</span>
                <span className="font-mono">{it.status}</span>
                <span className="text-slate-500">{it.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-slate-500">Tip: good light, ~20cm distance, clean camera lens.</p>
    </div>
  );
}
