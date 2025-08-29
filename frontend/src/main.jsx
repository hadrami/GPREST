import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { store } from "./redux/store";
import "./index.css";

import App from "./App";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange"; 
import Dashboard from "./pages/Dashboard";
import StudentsList from "./Students/List";
import StudentsImport from "./Students/Import";
import StudentForm from "./Students/Form";
import Scanner from "./pages/Scanner";
import ReportsSummary from "./Reports/Summary";
import ProtectedRoute from "./components/ProtectedRoute";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/force-password-change" element={<ForcePasswordChange />} />

          <Route path="/" element={<App />}>
            <Route
              index
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="students"
              element={
                <ProtectedRoute>
                  <StudentsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="students/import"
              element={
                <ProtectedRoute>
                  <StudentsImport />
                </ProtectedRoute>
              }
            />
            <Route
              path="students/new"
              element={
                <ProtectedRoute>
                  <StudentForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="students/:id"
              element={
                <ProtectedRoute>
                  <StudentForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="scanner"
              element={
                <ProtectedRoute roles={['SCAN_AGENT','ADMIN','MANAGER']}>
                  <Scanner />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports/summary"
              element={
                <ProtectedRoute roles={['ADMIN','MANAGER']}>
                  <ReportsSummary />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
