import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { login, clearError } from "../../redux/slices/authSlice";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const d = useDispatch();
  const nav = useNavigate();
  const { status, error, token } = useSelector((s) => s.auth);

  const isLoading = status === "loading";
  const isAuthenticated = !!token;

  useEffect(() => {
    if (isAuthenticated && token) {
      const t = setTimeout(() => nav("/"), 150);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated, token, nav]);

  const submit = async (e) => {
    e.preventDefault();
    d(clearError());
    await d(login({ email, password }));
  };

  return (
    // canvas is WHITE (from layout/global). Only the card is cream.
    <div className="w-full">
      <div className="rounded-2xl shadow-soft border border-cream-border/80 bg-cream p-8">
        {/* logo */}
        <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
          <img
            src="/gp-logo.png"
            alt="GP Logo"
            className="w-20 h-20 object-contain"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        {/* title + subtitle */}
        <div className="text-center space-y-1 mb-6">
          <h2 className="text-3xl font-extrabold text-primary">Connexion</h2>
          <p className="text-sm text-slate-700">
            Entrez vos identifiants pour accéder au système
          </p>
        </div>

        {/* error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* form */}
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-800">
              Identifiant
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 rounded-md bg-white 
                         border border-accent/30 
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent 
                         placeholder:text-slate-400"
              placeholder="Votre identifiant"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-800">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 rounded-md bg-white 
                         border border-accent/30 
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent 
                         placeholder:text-slate-400"
              placeholder="Votre mot de passe"
            />
          </div>

          {/* green button only (not cream) */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 rounded-xl bg-primary hover:bg-primary-dark 
                       text-white shadow-soft transition disabled:opacity-50"
          >
            {isLoading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
