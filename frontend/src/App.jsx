// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

// Layouts
import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

// Pages (same structure you already have)
import MealPlansList from "./pages/mealplans/MealPlansList.jsx";
import Summary from "./Reports/Summary.jsx";
import StudentsList from "./Students/List.jsx";
import StudentsImport from "./Students/Import.jsx";
import TicketsGenerate from "./Tickets/Generate.jsx";
import Login from "./pages/auth/Login.jsx";
import ForcePasswordChange from "./pages/auth/ForcePasswordChange.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Scanner from "./pages/Scanner.jsx";

// Role-aware guard (from your new ProtectedRoute.jsx)
import ProtectedRoute, { GuestOnly } from "./components/ProtectedRoute.jsx";

export default function App() {
  const { token, user, requiresPasswordChange } = useSelector((s) => s.auth);

  // Where to send a logged-in user by default
  const homeFor = (role) => (role === "SCAN_AGENT" ? "/scan" : "/");

  return (
    <Routes>
      {/* Default landing:
          - unauthenticated → /login
          -  SCAN_AGENT→ /scanner
          - ADMIN → / (Dashboard) */}
      <Route
        path="/"
        element={
          token ? (
            <Navigate to={homeFor(user?.role)} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

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

        {/* Allow authenticated users who must change password to access this screen */}
        <Route
          path="/force-password-change"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "SCAN_AGENT"]}>
              <ForcePasswordChange />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* App (protected under the dashboard layout) */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["ADMIN", "SCAN_AGENT"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* SCAN: ADMIN + SCAN_AGENT */}
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "SCAN_AGENT"]}>
              <Scanner />
            </ProtectedRoute>
          }
        />

        {/* ADMIN-ONLY below */}
        <Route
          index
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={<Navigate to="/" replace />}
        />

        <Route
          path="/students"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <StudentsList />
            </ProtectedRoute>
          }
        />

        <Route
          path="/mealplans"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <MealPlansList />
            </ProtectedRoute>
          }
        />

        <Route
          path="/students/import"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <StudentsImport />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tickets/generate"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <TicketsGenerate />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports/summary"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Summary />
            </ProtectedRoute>
          }
        />
      
      </Route>

      {/* Fallbacks */}
      {requiresPasswordChange && token ? (
        // If user must change password and hits an unknown URL, push to the force page
        <Route path="*" element={<Navigate to="/force-password-change" replace />} />
      ) : token ? (
        // If authed but unknown URL:
        <Route
          path="*"
          element={<Navigate to={homeFor(user?.role)} replace />}
        />
      ) : (
        // If not authed:
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}
