// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

import StudentsList from "./Students/List.jsx";
import StudentsImport from "./Students/Import.jsx";
import TicketsGenerate from "./Tickets/Generate.jsx";

import Login from "./pages/auth/Login.jsx";
import ForcePasswordChange from "./pages/auth/ForcePasswordChange.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Scanner from "./pages/Scanner.jsx";

/** Guest-only pages (e.g., /login) */
function GuestOnly({ children }) {
  const { token, requiresPasswordChange } = useSelector((s) => s.auth);
  if (token && requiresPasswordChange) return <Navigate to="/force-password-change" replace />;
  if (token) return <Navigate to="/" replace />;
  return children;
}

/** Protected pages; optionally allow access for forced password-change screen */
function Authed({ allowPasswordChange = false, children }) {
  const { token, requiresPasswordChange } = useSelector((s) => s.auth);
  if (!token) return <Navigate to="/login" replace />;
  if (!allowPasswordChange && requiresPasswordChange) {
    return <Navigate to="/force-password-change" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Default → login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Public/auth routes */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/force-password-change"
          element={
            <Authed allowPasswordChange>
              <ForcePasswordChange />
            </Authed>
          }
        />
      </Route>

      {/* App (protected) */}
      <Route
        element={
          <Authed>
            <DashboardLayout />
          </Authed>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/students" element={<StudentsList />} />
        <Route path="/students/import" element={<StudentsImport />} />
        <Route path="/tickets/generate" element={<TicketsGenerate />} />
        {/* add more protected routes here */}
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
