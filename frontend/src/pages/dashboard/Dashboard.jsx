import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function Dashboard() {
  const [, setShowModal] = useState(false);
  const { user = {} } = useSelector(s => s.auth);

  useEffect(() => {
    if (user.isFirstLogin) setShowModal(true);
  }, [user]);

  // demo counts
  const militairesCount = 127, professeursCount = 42, etudiantsCount = 215, employesCount = 35;

  const summaryCards = [
    { title: "Militaires",  count: militairesCount,  color: "bg-primary",     text: "text-white",        iconColor: "text-white" },
    { title: "Professeurs", count: professeursCount, color: "bg-accent",      text: "text-primary",      iconColor: "text-white" },
    { title: "Étudiants",   count: etudiantsCount,   color: "bg-accent/40",   text: "text-primary",      iconColor: "text-primary" },
    { title: "Employés",    count: employesCount,    color: "bg-accent/40",   text: "text-primary",      iconColor: "text-primary" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Yellow welcome band */}
      <div className="bg-secondary/20 rounded-lg shadow p-6 mb-6">
        <h2 className="text-2xl font-bold text-primary mb-2">Bienvenue</h2>
        <p className="text-slate-600 mb-4">Vue d’ensemble des effectifs et activités récentes.</p>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {summaryCards.map((c, i) => (
            <div key={i} className={`${c.color} rounded-lg shadow-lg overflow-hidden`}>
              <div className="px-4 py-5 sm:p-6 flex items-center justify-between">
                <div>
                  <dt className={`text-sm font-medium ${c.text}`}>{c.title}</dt>
                  <dd className={`mt-1 text-3xl font-semibold ${c.text}`}>{c.count}</dd>
                </div>
                <div className="rounded-full bg-white/60 p-2">
                  <svg className={`w-10 h-10 ${c.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extra stats on accent tint */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-accent/40 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-primary mb-2">Total personnel</h3>
          <p className="text-3xl font-bold text-primary">
            {militairesCount + professeursCount + etudiantsCount + employesCount}
          </p>
        </div>

        <div className="bg-accent/40 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-primary mb-2">Activité récente</h3>
          <ul className="list-disc list-inside text-slate-600">
            <li>Mise à jour de dossier</li>
            <li>Nouvel employé ajouté</li>
          </ul>
        </div>

        <div className="bg-accent/40 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-primary mb-2">Alertes</h3>
          <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 text-sm">
            3 éléments en attente
          </div>
        </div>
      </div>

      {/* Logos row (unchanged) */}
      <div className="mt-10 mb-4 flex gap-6 justify-center flex-wrap">
        {['ESP','IS2M','IPGEI','ISME','ISMS','ISM-BTPU'].map(code => (
          <Link key={code} to={`/instituts/${code}`}>
            <img
              src={`/assets/${code}.png`}
              alt={code}
              className="h-16 hover:opacity-75 transition-opacity"
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.style.display = 'none'; }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
