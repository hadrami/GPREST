import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { selectIsAuthed, selectUser } from "../redux/slices/authSlice";

export default function ProtectedRoute({
  children,
  requireAuth = true,
  allowedRoles,           // e.g. ['ADMIN'] or ['ADMIN','SCAN_AGENT']
  fallbackForForbidden,   // optional custom path
}) {
  const { token, requiresPasswordChange, status } = useSelector((s) => s.auth);
  const user = useSelector(selectUser);
  const isAuthed = useSelector(selectIsAuthed) ?? Boolean(token);
  const loc = useLocation();

  // Avoid flicker during bootstrap
  if (status === "loading") {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center">
        Chargement…
      </div>
    );
  }

  if (requireAuth) {
    if (!isAuthed) {
      return <Navigate to="/login" state={{ from: loc }} replace />;
    }

    if (requiresPasswordChange || user?.mustChangePassword) {
      if (loc.pathname !== "/force-password-change") {
        return <Navigate to="/force-password-change" replace />;
      }
    }

    // Role gating — normalize to UPPERCASE
    if (allowedRoles && user?.role) {
      const roleUC = String(user.role).toUpperCase();
      const whiteList = allowedRoles.map((r) => String(r).toUpperCase());
      const ok = whiteList.includes(roleUC);

      if (!ok) {
           const fallback =
          fallbackForForbidden ??
          (roleUC === "SCAN_AGENT"
            ? "/scan"
            : (roleUC === "STUDENT" || roleUC === "STAFF")
              ? "/my-plan"
              : "/dashboard");
              if (loc.pathname !== fallback) return <Navigate to={fallback} replace />;
      }
    }
  }

  return children;
}

export function GuestOnly({ children }) {
  const { token, user } = useSelector((s) => s.auth);
  if (token) {
    const roleUC = String(user?.role || "").toUpperCase();
 const target =
     roleUC === "SCAN_AGENT" ? "/scan" :
      roleUC === "STUDENT" || roleUC === "STAFF" ? "/my-plan" :
      "/dashboard";    return <Navigate to={target} replace />;
  }
  return children;
}
