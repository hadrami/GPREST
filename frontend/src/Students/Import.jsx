import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { importStudents } from "../redux/slices/studentsSlice";

export default function StudentsImport() {
  const d = useDispatch();
  const { lastImport } = useSelector(s=>s.students);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError("Choose a .xlsx or .csv file");
    setError(null);
    setStatus("loading");
    const res = await d(importStudents(file));
    setStatus(res.meta.requestStatus);
  };

  return (
    <div className="bg-white border rounded-xl p-4 shadow max-w-xl">
      <h1 className="text-lg font-semibold mb-3">Import students</h1>
      <form onSubmit={submit} className="space-y-3">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>setFile(e.target.files?.[0] || null)} />
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button disabled={status==="loading"} className="px-3 py-2 rounded bg-emerald-600 text-white">
          {status==="loading" ? "Importing..." : "Import"}
        </button>
      </form>

      {lastImport && (
        <div className="mt-4 text-sm">
          <div className="font-semibold">Result</div>
          <ul className="list-disc list-inside text-slate-700">
            <li>Rows: {lastImport.rows}</li>
            <li>Created: {lastImport.created}</li>
            <li>Updated: {lastImport.updated}</li>
            <li>Establishments created: {lastImport.establishmentsCreated}</li>
          </ul>
          {lastImport.errors?.length > 0 && (
            <div className="mt-2">
              <div className="font-semibold">Errors</div>
              <ul className="text-red-600 list-disc list-inside">
                {lastImport.errors.slice(0,10).map((e,i)=>(
                  <li key={i}>Row {e.row}: {e.reason}</li>
                ))}
                {lastImport.errors.length > 10 && <li>…and more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
