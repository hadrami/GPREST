import React from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gp-accent">
      <TopBar />
      <div className="max-w-7xl mx-auto p-4 flex gap-4">
        <Sidebar />
        <main className="flex-1 space-y-4">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
