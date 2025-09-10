// src/components/ProtectedRoute.jsx
import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

/**
 * Wrap protected pages:
 * <ProtectedRoute><Dashboard /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, requireAuth = true }) {
  const { token, user, requiresPasswordChange, status } = useSelector((s) => s.auth);
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
    // Not logged in → login
    if (!token) {
      return <Navigate to="/login" state={{ from: loc }} replace />;
    }
    // Must change password → lock to /force-password-change
    if (requiresPasswordChange || user?.mustChangePassword) {
      if (loc.pathname !== "/force-password-change") {
        return <Navigate to="/force-password-change" replace />;
      }
    }
  }

  return children;
}

/**
 * Optional: GuestOnly wrapper. If already logged in, redirect to "/".
 */
export function GuestOnly({ children }) {
  const { token } = useSelector((s) => s.auth);
  if (token) return <Navigate to="/" replace />;
  return children;
}
