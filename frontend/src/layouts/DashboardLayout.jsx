import React, { useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ReceiptText } from "lucide-react";

import { logout } from "../redux/slices/authSlice";

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : true
  );

  const asideRef = useRef(null);
  const toggleRef = useRef(null);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);

  const roleUC = String(user?.role || "").toUpperCase();
  const isAdmin = roleUC === "ADMIN";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      const a = asideRef.current;
      const t = toggleRef.current;
      if (!a) return;
      if (a.contains(e.target)) return;
      if (t && t.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [open]);

  const doLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  const mobileTranslate = open ? "translate-x-0" : "-translate-x-full";
  const desktopTranslate = open ? "md:translate-x-0" : "md:-translate-x-full";
  const mainOffset = open ? "md:ml-64" : "md:ml-0";

  return (
    <div className="min-h-screen bg-white flex">
      {open && isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-primary text-white",
          "shadow-lg",
          mobileTranslate,
          desktopTranslate,
          "transition-transform duration-300 ease-in-out",
        ].join(" ")}
        aria-label="Navigation latérale"
      >
        <div className="h-16 flex items-center justify-between px-3 bg-secondary">
          <div className="flex items-center gap-2">
            <img
              src="/assets/gp-logo.png"
              alt="GP"
              className="h-8 w-8 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <span className="text-primary font-semibold">Système GP</span>
          </div>
          <button
            className="md:hidden text-primary"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {user && (
          <div className="px-3 py-3 bg-primary-dark border-b border-primary/60">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary text-primary flex items-center justify-center font-bold">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium leading-5 truncate">{user.name}</p>
                <p className="text-xs text-gray-200">{roleUC || "UTILISATEUR"}</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          <NavItem
            to="/dashboard"
            label="Tableau de bord"
            iconPath="M3 12l2-2 7-7 7 7M9 10v10m4-10v10"
            canClick={isAdmin}
            onNavigate={() => setOpen(false)}
          />
          <NavItem
            to="/students"
            label="DB Personnes"
            iconPath="M5 5v14l7-4 7 4V5"
            canClick={isAdmin}
            onNavigate={() => setOpen(false)}
          />
          <NavItem
            to="/mealplans"
            label="Plans de repas"
            iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v8m0 0v8m0-8H4m8 0h8"
            canClick={isAdmin}
            onNavigate={() => setOpen(false)}
          />
          <NavItem
            to="/scan"
            label="Scanner"
            iconPath="M3 7h18M3 12h18M3 17h18"
            canClick={true}
            onNavigate={() => setOpen(false)}
          />
          <NavItem
            to="/reports/summary"
            label="Rapports"
            iconPath="M9 17V7m4 10V7m5 11H5M18 7H5"
            canClick={isAdmin}
            onNavigate={() => setOpen(false)}
          />

          <NavItem
  to="/prestations"              // route placeholder, on branchera plus tard
  label="Prestations"
  icon= <ReceiptText size={18} />
  canClick={isAdmin}
  onNavigate={() => setOpen(false)}
/>

        </nav>

        <div className="p-3 border-t border-primary/60">
          <button
            onClick={doLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-white bg-primary-dark hover:bg-primary"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1"
              />
            </svg>
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      <div className={`flex-1 min-w-0 transition-[margin] duration-300 ${mainOffset}`}>
        {/* Top bar with centered title + right logo */}
        <header className="h-16 sticky top-0 z-30 bg-secondary shadow">
          <div className="px-3 h-full grid grid-cols-3 items-center">
            {/* Left: burger */}
            <button
              ref={toggleRef}
              className="text-primary justify-self-start"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Center: title */}
            <h1 className="text-base md:text-lg font-semibold text-primary text-center">
              Gestion de Restauration
            </h1>

            {/* Right: small logo (same as Login) */}
            <div className="justify-self-end">
              <img
                src="/assets/gp-logo.png"
                alt="Logo"
                className="h-8 w-8 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, iconPath, label, onNavigate, canClick, disabledTooltip = "Admins only" }) {
  const base = "group flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md";
  const clickable = "hover:bg-primary-dark";
  const disabled = "opacity-60 cursor-not-allowed pointer-events-none";

  const icon = (
    <span className="shrink-0">
      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
      </svg>
    </span>
  );

  if (!canClick) {
    return (
      <div className={`${base} ${disabled}`} aria-disabled="true" title={disabledTooltip}>
        {icon}
        <span className="whitespace-nowrap text-white/80">{label}</span>
      </div>
    );
  }

  return (
    <Link
      to={to}
      onClick={() => {
        onNavigate?.();
      }}
      className={`${base} ${clickable}`}
    >
      {icon}
      <span className="whitespace-nowrap text-white/90 group-hover:text-white">{label}</span>
    </Link>
  );
}
