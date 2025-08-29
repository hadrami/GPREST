import React from "react";
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";

const linkClass = ({ isActive }) =>
  "block px-3 py-2 rounded-lg " + (isActive ? "bg-slate-200" : "hover:bg-slate-100");

export default function Sidebar() {
  const user = useSelector(s=>s.auth.user);

  return (
    <aside className="w-56 p-3">
      <nav className="space-y-1 text-sm">
        <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
        <NavLink to="/students" className={linkClass}>Students</NavLink>
        <NavLink to="/students/import" className={linkClass}>Import Students</NavLink>
        {(user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "SCAN_AGENT") && (
          <NavLink to="/scanner" className={linkClass}>Scanner</NavLink>
        )}
        {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
          <NavLink to="/reports/summary" className={linkClass}>Reports</NavLink>
        )}
      </nav>
    </aside>
  );
}
