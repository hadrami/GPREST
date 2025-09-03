// frontend/src/Students/Import.jsx
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { importStudents } from "../redux/slices/studentsSlice";

export default function StudentsImport() {
  const d = useDispatch();
  const { importStatus, importResult, error } = useSelector((s) => s.students);
  const [file, setFile] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    await d(importStudents(file));
  };

  const downloadTemplate = () => {
    // open in same origin (Vite proxy will forward to backend)
    window.open("/api/students/template", "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/40 p-4 bg-white">
        <h2 className="text-lg font-semibold text-primary mb-2">Importer des étudiants (Excel)</h2>

        {error && <div className="text-red-700 bg-red-50 border border-red-300 rounded p-2 mb-2">{error}</div>}

        <form onSubmit={submit} className="flex flex-col sm:flex-row items-start gap-3">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block"
          />
          <button
            type="submit"
            disabled={!file || importStatus === "loading"}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {importStatus === "loading" ? "Import…" : "Importer"}
          </button>

          <button
            type="button"
            onClick={downloadTemplate}
            className="px-4 py-2 rounded-lg border border-accent/50 hover:bg-secondary"
          >
            Télécharger le modèle
          </button>
        </form>

        {importResult && (
          <div className="mt-3 text-sm bg-secondary/40 border border-accent/50 rounded p-2">
            Import terminé — lignes: <b>{importResult.rows}</b>,
            créés: <b>{importResult.created}</b>,
            mis à jour: <b>{importResult.updated}</b>,
            ignorés: <b>{importResult.skipped}</b>.
          </div>
        )}
      </div>

      <div className="text-sm text-slate-600">
        <p>Le fichier doit contenir les colonnes: <b>Matricule</b>, <b>Nom</b>, <b>Prénom</b> (ou <b>Nom complet</b>), <b>Etablissement</b> (si vous êtes ADMIN), et <b>Email</b> (optionnel).</p>
      </div>
    </div>
  );
}
