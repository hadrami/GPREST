// src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector} from "react-redux";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { login, clearError } from "../../redux/slices/authSlice";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const { status, error, token, user, requiresPasswordChange } = useSelector((s) => s.auth);
  const isLoading = status === "loading";
  const loc = useLocation();

  useEffect(() => {
    if (!token) return;
    if (requiresPasswordChange || user?.mustChangePassword) {
      navigate("/force-password-change", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [token, requiresPasswordChange, user, navigate]);

  useEffect(() => {
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  const submit = (e) => {
      e.preventDefault(); // <-- IMPORTANT: avoid full page reload
    dispatch(clearError());
    const res =  dispatch(login({ username, password })).unwrap();
    if (res.meta.requestStatus === "fulfilled") {
      const role = res.payload?.user?.role;
      const next =
        (loc.state && loc.state.from?.pathname) ||
        (role === "SCAN_AGENT" ? "/scan" : "/dashboard");

      navigate(next, { replace: true });
    }
  };


  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-4 bg-white">
      <div className="w-full max-w-md rounded-2xl shadow-soft border border-cream-border/80 bg-cream p-8">
        {/* Logo (optional) */}
        <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
          <img
            src="/gp-logo.png"
            alt="GPRest"
            className="w-20 h-20 object-contain"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>

        <div className="text-center space-y-1 mb-6">
          <h2 className="text-3xl font-extrabold text-primary">Connexion</h2>
          <p className="text-sm text-slate-700">Entrez votre nom d’utilisateur</p>
        </div>

        {sp.get("reason") === "session_expired" && !error && (
          <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2 rounded-md text-sm">
            Votre session a expiré. Veuillez vous reconnecter.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-md text-sm">
            {String(error)}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-800">
              Nom d’utilisateur
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-1 block w-full px-3 py-2 rounded-md bg-white border border-accent/30
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent
                         placeholder:text-slate-400"
              placeholder="ex: admin"
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
              autoComplete="current-password"
              className="mt-1 block w-full px-3 py-2 rounded-md bg-white border border-accent/30
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent
                         placeholder:text-slate-400"
              placeholder="Votre mot de passe"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 rounded-xl bg-primary hover:bg-primary-dark text-white shadow-soft transition
                       disabled:opacity-50"
          >
            {isLoading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
