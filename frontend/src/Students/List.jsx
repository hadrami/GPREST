// src/Students/List.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { deleteStudent, fetchStudents } from "../redux/slices/studentsSlice";
import { Link } from "react-router-dom";
import {
  EyeIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

function rowOf(item) {
  const p = item.person || item;
  return {
    id: p.id,
    matricule: p.matricule,
    name: p.name,
    email: p.email,
    establishmentName: p.establishment?.name ?? p.etablissement?.name ?? "—",
  };
}

export default function StudentsList() {
  const dispatch = useDispatch();
  const { items = [],   page = 1, pageSize = 20 } = useSelector(
    (s) => s.students
  );

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [selected, setSelected] = useState(null); // for modal

  async function load({ resetPage = false } = {}) {
    setLoading(true);
    setErr(null);
    try {
      await dispatch(
        fetchStudents({
          search: q,
          page: resetPage ? 1 : page,
          pageSize,
        })
      ).unwrap();
    } catch (e) {
      setErr(e || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // first view: all rows
    load({ resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => items.map(rowOf), [items]);

  async function onDelete(id) {
    if (!window.confirm("Supprimer cet étudiant ?")) return;
    try {
      await dispatch(deleteStudent(id)).unwrap();
      load({ resetPage: false });
    } catch (e) {
      alert(e || "Erreur de suppression");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Étudiants</h1>

      {/* Only a search field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load({ resetPage: true });
        }}
        className="grid gap-2 md:grid-cols-4"
      >
        <div className="md:col-span-2 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-primary text-white" type="submit">
            Rechercher
          </button>
          <button
            className="px-3 py-2 rounded border"
            type="button"
            onClick={() => {
              setQ("");
              load({ resetPage: true });
            }}
          >
            Tout
          </button>
        </div>
      </form>

      {err && <div className="text-red-600">{String(err)}</div>}
      {loading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500">Aucun résultat.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2">Matricule</th>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Établissement</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2">{it.matricule}</td>
                    <td className="p-2">{it.name}</td>
                    <td className="p-2">{it.email || "—"}</td>
                    <td className="p-2">{it.establishmentName}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-3">
                        <button
                          title="Voir"
                          onClick={() => setSelected(it)}
                          className="hover:opacity-80"
                        >
                          <EyeIcon className="w-5 h-5 text-blue-600" />
                        </button>
                        <button
                          title="Supprimer"
                          onClick={() => onDelete(it.id)}
                          className="hover:opacity-80"
                        >
                          <TrashIcon className="w-5 h-5 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

       {/* Mobile cards (same style as MealPlans) */}
<div className="md:hidden grid gap-3">
  {rows.map((it) => (
    <article
      key={it.id}
      className="
        relative rounded-2xl bg-white
        shadow-lg shadow-slate-200/70
        ring-1 ring-slate-200
        p-4
        transition-transform duration-150
        active:scale-[0.99]
      "
    >
      {/* tiny gradient accent to give depth */}
      <div className="pointer-events-none absolute inset-x-0 -top-px h-1.5 rounded-t-2xl bg-gradient-to-r from-primary/80 via-accent/70 to-emerald-400" />

      {/* header: name + matricule + actions */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold leading-5">{it.name || "—"}</div>
          <div className="text-xs text-slate-500">
            Matricule&nbsp;•&nbsp;{it.matricule || "—"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            title="Voir"
            onClick={() => setSelected(it)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100"
          >
            <EyeIcon className="w-5 h-5" />
          </button>
          <button
            title="Supprimer"
            onClick={() => onDelete(it.id)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* info pills */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
          {it.email || "—"}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          {it.establishmentName}
        </span>
      </div>
    </article>
  ))}
</div>

        </>
      )}

      {/* VIEW MODAL */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title="Détails de l’étudiant">
          <Item label="Matricule" value={selected.matricule} />
          <Item label="Nom" value={selected.name} />
          <Item label="Établissement" value={selected.establishmentName} />
        </Modal>
      )}
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div className="flex justify-between gap-6 py-1">
      <div className="text-slate-500">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 space-y-2">{children}</div>
        <div className="p-3 border-t text-right">
          <button onClick={onClose} className="px-3 py-2 rounded bg-primary text-white">Fermer</button>
        </div>
      </div>
    </div>
  );
}
