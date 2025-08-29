import React from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const user = useSelector(s=>s.auth.user);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="bg-white p-4 border rounded-xl shadow">
        <h2 className="font-semibold mb-2">Welcome {user?.name || ""}</h2>
        <p className="text-sm text-slate-600">Manage students, generate tickets, scan, and view reports.</p>
      </div>
      <div className="bg-white p-4 border rounded-xl shadow">
        <h3 className="font-semibold">Quick actions</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link className="px-3 py-1 rounded bg-blue-600 text-white" to="/students">Students</Link>
          <Link className="px-3 py-1 rounded bg-emerald-600 text-white" to="/students/import">Import</Link>
          <Link className="px-3 py-1 rounded bg-slate-800 text-white" to="/scanner">Scanner</Link>
          <Link className="px-3 py-1 rounded bg-indigo-600 text-white" to="/reports/summary">Reports</Link>
        </div>
      </div>
    </div>
  );
}
