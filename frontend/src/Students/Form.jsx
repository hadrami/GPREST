import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";

export default function StudentForm() {
  const { id } = useParams();
  const nav = useNavigate();

  const [matricule, setMatricule] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [etabName, setEtabName] = useState("");
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get(`/students/${id}`);
        setMatricule(data.matricule);
        setNom(data.nom);
        setPrenom(data.prenom);
        setEtabName(data.etablissement?.name || "");
      } catch (e) {
        setError(e.response?.data?.message || "Failed to load");
      } finally { setLoading(false); }
    })();
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (id) {
        await api.put(`/students/${id}`, { matricule, nom, prenom, establishmentName: etabName, active: true });
      } else {
        await api.post(`/students`, { matricule, nom, prenom, establishmentName: etabName, active: true });
      }
      nav("/students");
    } catch (e) {
      setError(e.response?.data?.message || "Save failed");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="bg-white border rounded-xl p-4 shadow max-w-xl">
      <h1 className="text-lg font-semibold mb-3">{id ? "Edit student" : "New student"}</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm">Matricule</label>
          <input className="w-full border rounded px-3 py-2" value={matricule} onChange={e=>setMatricule(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm">Nom</label>
            <input className="w-full border rounded px-3 py-2" value={nom} onChange={e=>setNom(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm">Prénom</label>
            <input className="w-full border rounded px-3 py-2" value={prenom} onChange={e=>setPrenom(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm">Etablissement (nom)</label>
          <input className="w-full border rounded px-3 py-2" value={etabName} onChange={e=>setEtabName(e.target.value)} />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-blue-600 text-white">{id ? "Update" : "Create"}</button>
          <button type="button" className="px-3 py-2 rounded border" onClick={()=>history.back()}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
