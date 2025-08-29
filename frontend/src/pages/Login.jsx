import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login } from "../redux/slices/authSlice";
import { Navigate } from "react-router-dom";

export default function Login() {
  const d = useDispatch();
  const { token, requiresPasswordChange, status, error } = useSelector(s=>s.auth);
  const [email, setEmail] = useState("admin@gprest.local");
  const [password, setPassword] = useState("Admin@123");

  const onSubmit = (e) => {
    e.preventDefault();
    d(login({ email, password }));
  };

  if (token && requiresPasswordChange) return <Navigate to="/force-password-change" replace />;
  if (token) return <Navigate to="/" replace />;

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white border rounded-xl p-6 shadow">
        <h1 className="text-xl font-semibold mb-4">Sign in</h1>
        <label className="block mb-2 text-sm">Email</label>
        <input className="w-full border rounded px-3 py-2 mb-3" value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="block mb-2 text-sm">Password</label>
        <input type="password" className="w-full border rounded px-3 py-2 mb-3" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <button disabled={status==="loading"} className="w-full py-2 rounded bg-blue-600 text-white">
          {status==="loading" ? "..." : "Login"}
        </button>
        <p className="text-xs text-slate-500 mt-2">First login will require a password change.</p>
      </form>
    </div>
  );
}
