import React from "react";

export default function Footer() {
  return (
    <footer className="w-full bg-[#3D3D3D] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-2 text-center text-sm">
        © {new Date().getFullYear()} Groupe Polytechnique - DRH
      </div>
    </footer>
  );
}
