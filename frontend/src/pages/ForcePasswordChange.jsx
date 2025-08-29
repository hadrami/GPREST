import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { changePassword } from "../redux/slices/authSlice";
import { Navigate } from "react-router-dom";

export default function ForcePasswordChange() {
  const d = useDispatch();
  const { token, requiresPasswordChange, status, error } = useSelector(s=>s.auth);

  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (nextPassword !== confirm) return alert("Confirmation mismatch");
    const r = await d(changePassword({ currentPassword, newPassword: nextPassword }));
    if (r.meta.requestStatus === "fulfilled") setDone(true);
  };

  if (!token) return <Navigate to="/login" replace />;
  if (!requiresPasswordChange && done) return <Navigate to="/" replace />;

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white border rounded-xl p-6 shadow space-y-3">
        <h1 className="text-xl font-semibold">Change password</h1>
        <p className="text-sm text-slate-500">Please set a new password to continue.</p>
        <div>
          <label className="block text-sm mb-1">Current password</label>
          <input type="password" className="w-full border rounded px-3 py-2" value={currentPassword}
                 onChange={e=>setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">New password</label>
          <input type="password" className="w-full border rounded px-3 py-2" value={nextPassword}
                 onChange={e=>setNextPassword(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Confirm new password</label>
          <input type="password" className="w-full border rounded px-3 py-2" value={confirm}
                 onChange={e=>setConfirm(e.target.value)} />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button disabled={status==="loading"} className="w-full py-2 rounded bg-green-600 text-white">
          {status==="loading" ? "..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
