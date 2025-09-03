import React from "react";
import { Outlet } from "react-router-dom";
import Footer from "../components/Footer";

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* main area */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>

      {/* footer spans full width at bottom */}
      <Footer />
    </div>
  );
}
