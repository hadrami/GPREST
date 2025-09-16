import React, { useEffect, useRef, useState } from "react";
import { apiListEstablishments } from "../lib/establissments.api";

export default function EstablishmentSearch({ value, onChange, placeholder = "Chercher un établissement…" }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState([]);
  const boxRef = useRef(null);
  const [label, setLabel] = useState("");

  // Click outside to close
  useEffect(() => {
    function onDoc(e) {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // search debounce
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await apiListEstablishments({ search: term, page: 1, pageSize: 20 });
        setOpts(data?.items || []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [term, open]);

  // clear selection
  function clear() {
    setLabel("");
    onChange?.(null);
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center border rounded px-2">
        <input
          className="w-full py-2 bg-white outline-none"
          placeholder={placeholder}
          value={open ? term : (label || "")}
          onFocus={() => { setOpen(true); setTerm(""); }}
          onChange={(e) => setTerm(e.target.value)}
        />
        {value ? (
          <button type="button" className="text-slate-500 px-1" title="Effacer" onClick={clear}>✕</button>
        ) : null}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded border bg-white shadow">
          {loading ? (
            <div className="p-2 text-sm text-slate-500">Recherche…</div>
          ) : opts.length === 0 ? (
            <div className="p-2 text-sm text-slate-500">Aucun établissement</div>
          ) : (
            opts.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setLabel(o.name);
                  onChange?.(o.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50"
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
