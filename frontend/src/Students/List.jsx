import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents, deleteStudent, setPage, setLimit } from "../redux/slices/studentsSlice";
import { Link } from "react-router-dom";

export default function StudentsList() {
  const d = useDispatch();
  const { items, page, limit, total, status, error } = useSelector(s=>s.students);
  const [search, setSearch] = useState("");

  useEffect(() => {
    d(fetchStudents({ page, limit, search }));
  }, [d, page, limit, search]
);

  const onSearch = (e) => {
    e.preventDefault();
    d(fetchStudents({ page: 1, limit, search }));
  };

  const remove = async (id) => {
    if (confirm("Delete this student?")) {
      await d(deleteStudent(id));
      d(fetchStudents({ page, limit, search }));
    }
  };

  return (
    <div className="bg-white border rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold">Students</h1>
        <div className="flex gap-2">
          <Link to="/students/new" className="px-3 py-2 rounded bg-blue-600 text-white">New</Link>
          <Link to="/students/import" className="px-3 py-2 rounded bg-emerald-600 text-white">Import</Link>
        </div>
      </div>

      <form onSubmit={onSearch} className="flex gap-2 mb-3">
        <input className="border rounded px-3 py-2 flex-1" placeholder="Search matricule/nom/prenom"
               value={search} onChange={e=>setSearch(e.target.value)} />
        <button className="px-3 py-2 rounded bg-slate-800 text-white">Search</button>
      </form>

      {status==="loading" && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Matricule</th>
              <th className="text-left p-2">Nom</th>
              <th className="text-left p-2">Prénom</th>
              <th className="text-left p-2">Etablissement</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id} className="border-b">
                <td className="p-2 font-mono">{s.matricule}</td>
                <td className="p-2">{s.nom}</td>
                <td className="p-2">{s.prenom}</td>
                <td className="p-2">{s.etablissement?.name || "-"}</td>
                <td className="p-2">
                  <Link to={`/students/${s.id}`} className="text-blue-600 mr-3">Edit</Link>
                  <button className="text-red-600" onClick={()=>remove(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && status!=="loading" && (
              <tr><td className="p-3 text-slate-500" colSpan={5}>No students</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-slate-600">
          Page {page} · {total} total
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1" value={limit} onChange={e=>d(setLimit(Number(e.target.value)))}>
            {[10,20,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
          </select>
          <button className="px-2 py-1 border rounded" disabled={page<=1} onClick={()=>d(setPage(page-1))}>Prev</button>
          <button className="px-2 py-1 border rounded" disabled={(page*limit)>=total} onClick={()=>d(setPage(page+1))}>Next</button>
        </div>
      </div>
    </div>
  );
}
