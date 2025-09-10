// src/Students/Import.jsx
import React, { useMemo, useState } from "react";
import  api  from "../lib/api";

export default function StudentsImport() {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("student"); // or 'staff'
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  const canImport = useMemo(() => !!file, [file]);
  const disabled = status === "loading";

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canImport) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);

    try {
      setStatus("loading"); setError(null); setSummary(null);
      const { data } = await api.post("plans/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSummary(data);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Importer les choix de repas</h1>
      <p className="text-sm text-slate-600">
        Importez un fichier Excel avec une colonne <b>Matricule</b>, et pour chaque jour, trois colonnes
        <i> Petit-déjeuner / Déjeuner / Dîner</i> (2 lignes d’en-tête) ou des en-têtes plats “YYYY-MM-DD Déjeuner”.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="px-3 py-2 rounded-md border"
            value={kind}
            onChange={(e)=>setKind(e.target.value)}
          >
            <option value="student">Étudiants</option>
            <option value="staff">Personnel</option>
          </select>

          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="px-3 py-2 rounded-md border"
          />
        </div>

        {error && <div className="text-red-700 bg-red-50 border rounded p-2">{error}</div>}

        <button
          type="submit"
          disabled={!canImport || disabled}
          className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {disabled ? "Importation…" : "Importer"}
        </button>

        {summary && (
          <div className="mt-4 rounded-md border bg-white">
            <div className="p-3 border-b font-medium">Résumé</div>
            <div className="p-3 text-sm">
              <div>Créés: <b>{summary.created || 0}</b></div>
              <div>Mis à jour: <b>{summary.updated || 0}</b></div>
              {Array.isArray(summary.issues) && summary.issues.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer">Problèmes ({summary.issues.length})</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {summary.issues.slice(0, 50).map((it, idx) => (
                      <li key={idx}>
                        {it.row ? `Ligne ${it.row}: ` : ""}{String(it.reason)}
                      </li>
                    ))}
                    {summary.issues.length > 50 && <li>… et {summary.issues.length - 50} autres</li>}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
