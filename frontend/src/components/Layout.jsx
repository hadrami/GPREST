import React from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar />
      <div className="max-w-7xl mx-auto p-4 flex gap-4">
        <Sidebar />
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
