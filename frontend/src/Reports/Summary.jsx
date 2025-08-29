import React, { useEffect, useState } from "react";
import api from "../lib/api";

export default function Summary() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(()=>{
    (async () => {
      try {
        const { data } = await api.get("/reports/summary");
        setData(data);
      } catch (e) {
        setErr(e.response?.data?.message || "Failed to load");
      }
    })();
  }, []);

  return (
    <div className="bg-white border rounded-xl p-4 shadow">
      <h1 className="text-lg font-semibold mb-2">Summary report</h1>
      {err && <div className="text-red-600">{err}</div>}
      {!data && !err && <div>Loading...</div>}
      {data && (
        <pre className="text-xs bg-slate-50 p-3 rounded border overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
