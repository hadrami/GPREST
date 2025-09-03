// frontend/src/Students/List.jsx
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { deleteStudent, fetchStudents } from "../redux/slices/studentsSlice";

export default function StudentsList() {
  const d = useDispatch();
  const { items, total, page, pageSize, status, error } = useSelector((s) => s.students);
  const [q, setQ] = useState("");

  useEffect(() => { d(fetchStudents({ page: 1, pageSize })); }, [d, pageSize]);

  const search = (e) => {
    e.preventDefault();
    d(fetchStudents({ search: q, page: 1, pageSize }));
  };

  const next = () => d(fetchStudents({ search: q, page: page + 1, pageSize }));
  const prev = () => d(fetchStudents({ search: q, page: Math.max(1, page - 1), pageSize }));

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-col sm:flex-row gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom / matricule / email"
          className="flex-1 px-3 py-2 rounded-md border border-accent/30 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark">Rechercher</button>
      </form>

      {error && <div className="text-red-700 bg-red-50 border border-red-300 rounded p-2">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-accent/40">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary">
            <tr className="text-left">
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Etablissement</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" && (
              <tr><td className="px-3 py-3" colSpan={5}>Chargement…</td></tr>
            )}
            {status !== "loading" && items.length === 0 && (
              <tr><td className="px-3 py-3" colSpan={5}>Aucun étudiant</td></tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">{s.matricule}</td>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2">{s.email ?? "—"}</td>             
                <td className="px-3 py-2">{s.etablissement?.name ?? "—"}</td>

                <td className="px-3 py-2">
                  <button
                    onClick={() => d(deleteStudent(s.id))}
                    className="text-red-600 hover:text-red-800"
                    title="Supprimer"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>Total: {total}</span>
        <div className="flex gap-2">
          <button onClick={prev} disabled={page <= 1}
                  className="px-3 py-1 rounded-md border disabled:opacity-50">Préc.</button>
          <span>Page {page}</span>
          <button onClick={next} disabled={page * pageSize >= total}
                  className="px-3 py-1 rounded-md border disabled:opacity-50">Suiv.</button>
        </div>
      </div>
    </div>
  );
}
