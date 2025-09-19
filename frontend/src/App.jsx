// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

// Layouts
import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

// Pages
import SelfMealPlan from "./pages/SelfMealPlan.jsx";

import MealPlansList from "./pages/mealplans/MealPlansList.jsx";
import Summary from "./Reports/Summary.jsx";
import StudentsList from "./Students/List.jsx";
import StudentsImport from "./Students/Import.jsx";
import Login from "./pages/auth/Login.jsx";
import ForcePasswordChange from "./pages/auth/ForcePasswordChange.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Scanner from "./pages/Scanner.jsx";
import Prestations from "./pages/Prestations.jsx";

// Guards
import ProtectedRoute, { GuestOnly } from "./components/ProtectedRoute.jsx";

export default function App() {
  const { token, user } = useSelector((s) => s.auth);

    const homeFor = (role) => {
    const r = String(role || "").toUpperCase();
    if (r === "SCAN_AGENT") return "/scan";
    if (r === "STUDENT" || r === "STAFF") return "/my-plan";
    return "/dashboard";
  };
  return (
    <Routes>
      {/* Landing redirect */}
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

      {/* Self-service page for STUDENT/STAFF ONLY (no dashboard chrome) */}
      <Route
        path="/my-plan"
        element={
          <ProtectedRoute allowedRoles={["STUDENT", "STAFF"]}>
            <SelfMealPlan />
          </ProtectedRoute>
        }
      />

      {/* Public/auth layout */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />

        {/* force password change if you use it */}
        <Route
          path="/force-password-change"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "SCAN_AGENT", "MANAGER"]}>
              <ForcePasswordChange />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* App layout */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["ADMIN", "MANAGER", "SCAN_AGENT"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Scan page: ADMIN + SCAN_AGENT only */}
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "SCAN_AGENT"]}>
              <Scanner />
            </ProtectedRoute>
          }
        />

        {/* Dashboard: ADMIN + MANAGER */}
        <Route
          index
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />

        {/* Students, Mealplans, Import, Summary, Prestations: ADMIN + MANAGER */}
        <Route
          path="/students"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <StudentsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mealplans"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <MealPlansList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students/import"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <StudentsImport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/summary"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <Summary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prestations"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]}>
              <Prestations />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
