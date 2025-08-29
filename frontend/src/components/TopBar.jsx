import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../redux/slices/authSlice";
import { Link } from "react-router-dom";

export default function TopBar() {
  const d = useDispatch();
  const user = useSelector(s=>s.auth.user);

  return (
    <header className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg">GPRest</Link>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm text-slate-600">{user.name} ({user.role})</span>}
          <button onClick={()=>d(logout())} className="px-3 py-1 rounded bg-slate-800 text-white">Logout</button>
        </div>
      </div>
    </header>
  );
}
