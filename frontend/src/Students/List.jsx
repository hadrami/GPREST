// src/Students/List.jsx — Persons list (Étudiants + Personnel)
// Keep layout/styles; add: acronym title, lock Establishment select for MANAGER

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../redux/slices/studentsSlice";
import { apiListStudents } from "../lib/students.api"; // server search
import { EyeIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { apiListEstablishments, apiGetEstablishment } from "../lib/establishments.api.js"; // +get one by id

function rowOf(item) {
  const p = item.person || item;
  return {
    id: p.id,
    matricule: p.matricule,
    name: p.name,
    email: p.email,
    establishmentName: p.establishment?.name ?? p.etablissement?.name ?? "—",
    personType: (p.type || p.personType || p.role || "").toString().toLowerCase(),
  };
}

const PERSON_TYPES = [
  { value: "", label: "Tous les types" },
  { value: "student", label: "Étudiant" },
  { value: "staff", label: "Personnel" },
];

// Strict acronym extraction identical to MealPlansList

export default function PersonsList() {
  const dispatch = useDispatch();
  const { items = [], status, error, total = 0 } = useSelector((s) => s.students);

  // Auth (to detect MANAGER + their establishment)
  const { user } = useSelector((s) => s.auth);
  const roleUC = String(user?.role || "").toUpperCase();
  const isManager = roleUC === "MANAGER";
  const managerEstId =
    user?.establishmentId || user?.etablissementId || user?.establishment?.id || "";

    console.log("User role:", roleUC, "isManager:", isManager, "managerEstId:", managerEstId);

  // Manager establishment metadata for title
  const [managerEstName, setManagerEstName] = useState(null);

  // Enforce page size 20 (fixed)
  const pageSize = 20;
  const [page, setPage] = useState(1);

  // Filters
  const [q, setQ] = useState("");
  const [personType, setPersonType] = useState("");           // "student" | "staff" | ""
  const [establishmentId, setEstablishmentId] = useState(""); // backend id ("" = all)

  // Establishments
  const [estabs, setEstabs] = useState([]);
  const [estabsLoading, setEstabsLoading] = useState(true);
  const [estabsError, setEstabsError] = useState(null);

  // Modal
  const [selected, setSelected] = useState(null);

  // Debounce timer
  const debounceRef = useRef(null);

  // Load students from server
  const load = async ({ resetPage = false } = {}) => {
    try {
      const nextPage = resetPage ? 1 : page;
      await dispatch(
        fetchStudents({
          search: q,
          establishmentId: isManager ? managerEstId : establishmentId || "",          personType,
          page: nextPage,
          pageSize,
        })
      ).unwrap();
      if (resetPage) setPage(1);
    } catch {
      /* handled via slice status/error */
    }
  };

  // Fetch ALL establishments once
  useEffect(() => {
    const run = async () => {
      setEstabsLoading(true);
      setEstabsError(null);
      try {
        const { data } = await apiListEstablishments({ page: 1, pageSize: 1000 });
        const items = Array.isArray(data?.items) ? data.items : [];
        const sorted = items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEstabs(sorted);
      } catch (e) {
        setEstabsError(e?.response?.data?.message || e.message || "Erreur établissements");
      } finally {
        setEstabsLoading(false);
      }
    };
    run();
  }, []);

  // LOCK + prefill for MANAGER and fetch their establishment name/acronym
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (isManager && managerEstId && user) {
        setEstablishmentId(String(managerEstId));
        try {
         const { data } = await apiGetEstablishment(managerEstId);
         if (!cancel) setManagerEstName(data?.name || null);
        
        } catch {
         if (!cancel) setManagerEstName(null);
        }
      }
    })();
    return () => { cancel = true; };
  }, [isManager, managerEstId, user]);

  // Initial load
  useEffect(() => {
    load({ resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactive search: auto-refresh when q, personType, or establishment changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ resetPage: true });
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, personType, establishmentId]);

  // Re-fetch when page changes
  useEffect(() => {
    load({ resetPage: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const rows = useMemo(() => items.map(rowOf), [items]);

  // Build select options; ensure manager's establishment appears even if missing
  const establishmentOptions = useMemo(() => {
    const opts = [{ id: "", name: "Tous les établissements" }];
    if (Array.isArray(estabs)) {
      const sorted = [...estabs].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      sorted.forEach((e) => opts.push({ id: e.id, name: e.name || "—" }));
    }
    if (isManager && managerEstId && managerEstName) {
      const exists = opts.some((o) => String(o.id) === String(managerEstId));
      if (!exists) opts.push({ id: String(managerEstId), name: managerEstName });
    }
    return opts;
  }, [estabs, isManager, managerEstId, managerEstName]);

  // Current selection object for subtitle + acronym when not manager
  const currentEstObj =
    establishmentOptions.find((o) => String(o.id || "") === String(establishmentId || "")) || null;



  const currentEstName = isManager
    ? (managerEstName || currentEstObj?.name || "")
    : (currentEstObj?.name || "Tous les établissements");

  // ------- Export ALL results (CSV Excel-friendly) -------
  const exportCsv = async () => {
    const type =
      personType.toLowerCase() === "student"
        ? "STUDENT"
        : personType.toLowerCase() === "staff"
        ? "STAFF"
        : "";

    const all = [];
    let p = 1;
    const ps = 1000; // big pages to minimize roundtrips
    while (true) {
      const { data } = await apiListStudents({
        search: q,
        establishmentId: establishmentId || "",
        type,
        page: p,
        pageSize: ps,
      });
      const batch = Array.isArray(data?.items) ? data.items : [];
      all.push(...batch);
      const totalApi = Number(data?.total || 0);
      if (all.length >= totalApi || batch.length === 0) break;
      p += 1;
    }

    const title = `Personnes `;
    const head = ["Matricule", "Nom", "Email", "Établissement", "Type"];
    const lines = [
      `"${title.replace(/"/g, '""')}"`,
      "",
      head.join(";"),
      ...all.map((it) => {
        const row = [
          it.matricule ?? "",
          it.name ?? "",
          it.email ?? "",
          it.establishment?.name ?? "—",
          (it.type || "").toUpperCase() === "STAFF"
            ? "Personnel"
            : (it.type || "").toUpperCase() === "STUDENT"
            ? "Étudiant"
            : "—",
        ];
        return row
          .map((v) => {
            const s = String(v ?? "");
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";");
      }),
    ].join("\n");

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const safeTitle = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

    const blob = new Blob(["\uFEFF" + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle || "personnes-export"}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived footer numbers
  const shown = Math.min(page * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 space-y-4">
      {/* Title with acronym + subtitle with establishment name */}
      <div>
     <h1 className="text-xl font-semibold">Personnes</h1>
  {isManager ? (
  <div className="text-sm text-slate-600">
    Résultats pour l’établissement :{" "}
    <span className="font-medium text-primary">
      {managerEstName ?? "Chargement…"}
    </span>
  </div>
) : (
  <div className="text-sm text-slate-500">
    {currentEstName || "Tous les établissements"}
  </div>
)}

      </div>

      {/* Search + filters (reactive) */}
      <div className="grid gap-2 md:grid-cols-4 w-full">
        {/* Text query */}
        <label className=" lg:col-span-1 flex items-center border rounded px-2">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-500" />
          <input
            className="px-2 py-2 outline-none w-full"
            placeholder="Rechercher (matricule, nom, email…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {/* Establishment (LOCKED for MANAGER) */}
      {/* Establishment select — hidden if manager */}
{!isManager && (
  <label className="flex items-center border rounded px-2">
    <select
      className="w-full py-2 bg-white outline-none"
      value={establishmentId}
      onChange={(e) => setEstablishmentId(e.target.value)}
      disabled={estabsLoading}
      title="Établissement"
    >
      {establishmentOptions.map((o) => (
        <option key={o.id || "all"} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  </label>
)}


        {/* Person type */}
        <label className="flex items-center border rounded px-2">
          <select
            className="w-full py-2 bg-white outline-none"
            value={personType}
            onChange={(e) => setPersonType(e.target.value)}
          >
            {PERSON_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Export icon */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={exportCsv}
            className="p-2 rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300"
            title="Exporter CSV"
            aria-label="Exporter CSV"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Errors if any */}
        <div className="md:col-span-4 flex gap-2">
          {estabsError && (
            <span className="text-red-600 text-sm">{String(estabsError)}</span>
          )}
        </div>
      </div>

      {/* Status / errors */}
      {status === "failed" && <div className="text-red-600">{String(error || "Erreur")}</div>}
      {status === "loading" ? (
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
                  <th className="text-left p-2">Type</th>
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
                      {it.personType === "staff"
                        ? "Personnel"
                        : it.personType === "student"
                        ? "Étudiant"
                        : "—"}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-3">
                        <button
                          title="Voir"
                          onClick={() => setSelected(it)}
                          className="hover:opacity-80"
                        >
                          <EyeIcon className="w-5 h-5 text-blue-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid gap-3">
            {rows.map((it) => (
              <article
                key={it.id}
                className="relative rounded-2xl bg-white shadow-lg shadow-slate-200/70 ring-1 ring-slate-200 p-4 transition-transform duration-150 active:scale-[0.99]"
              >
                <div className="pointer-events-none absolute inset-x-0 -top-px h-1.5 rounded-t-2xl bg-gradient-to-r from-primary/80 via-accent/70 to-emerald-400" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold leading-5">{it.name || "—"}</div>
                    <div className="text-xs text-slate-500">
                      Matricule • {it.matricule || "—"}
                    </div>
                  </div>
                  <button
                    title="Voir"
                    onClick={() => setSelected(it)}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100"
                  >
                    <EyeIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                    {it.email || "—"}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    {it.establishmentName}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                    {it.personType === "staff"
                      ? "Personnel"
                      : it.personType === "student"
                      ? "Étudiant"
                      : "—"}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination footer */}
          <div className="flex justify-between items-center pt-2">
            <div className="text-sm text-slate-600">
              {shown}/{total}
            </div>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Préc
              </button>
              <button
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Suiv
              </button>
            </div>
          </div>
        </>
      )}

      {/* VIEW MODAL */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title="Détails de la personne">
          <Item label="Matricule" value={selected.matricule} />
          <Item label="Nom" value={selected.name} />
          <Item label="Établissement" value={selected.establishmentName} />
          <Item
            label="Type"
            value={
              selected.personType === "staff"
                ? "Personnel"
                : selected.personType === "student"
                ? "Étudiant"
                : "—"
            }
          />
          {selected.email && <Item label="Email" value={selected.email} />}
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
