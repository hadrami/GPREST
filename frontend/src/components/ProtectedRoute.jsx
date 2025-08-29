import React from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, roles }) {
  const { token, requiresPasswordChange, user } = useSelector(s=>s.auth);

  if (!token) return <Navigate to="/login" replace />;
  if (requiresPasswordChange) return <Navigate to="/force-password-change" replace />;

  if (roles && user && !roles.includes(user.role)) {
    return <div className="p-6 text-red-600">Access denied.</div>;
  }
  return children;
}
