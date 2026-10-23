"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copySafeDiagnosticReport, RuntimeDiagnosticsView, type RuntimeDiagnosticsPayload } from "@/components/admin/runtimeDiagnosticsPresentation";

export function RuntimeDiagnosticsPanel() {
  const [payload, setPayload] = useState<RuntimeDiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/runtime-diagnostics", { cache: "no-store" });
      const body = await response.json().catch(() => null) as RuntimeDiagnosticsPayload | { error?: { code?: string } | null } | null;
      if (!response.ok || !body || !("diagnostics" in body) || !("report" in body)) throw new Error("unavailable");
      setPayload(body);
    } catch { setPayload(null); setMessage("Runtime diagnostics unavailable"); }
    finally { loadingRef.current = false; setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const copy = async () => {
    if (!payload?.report || !navigator.clipboard?.writeText) { setMessage("复制失败，请手动复制。"); return; }
    try { await copySafeDiagnosticReport(payload.report, navigator.clipboard.writeText.bind(navigator.clipboard)); setMessage("安全诊断报告已复制。"); }
    catch { setMessage("复制失败，请手动复制。"); }
  };
  const actions = <div className="flex gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />刷新</Button>{payload ? <Button type="button" variant="outline" onClick={() => void copy()}><Copy size={15} />复制安全报告</Button> : null}</div>;
  if (!payload) return <section className="workspace-state-panel"><p role="status">{loading ? "正在读取当前安全诊断快照…" : message}</p>{actions}</section>;
  return <div className="grid gap-4"><div className="flex flex-wrap justify-end gap-2">{actions}</div><RuntimeDiagnosticsView payload={payload} message={message} /></div>;
}
