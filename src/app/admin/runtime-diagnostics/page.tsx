import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { RuntimeDiagnosticsPanel } from "@/components/admin/RuntimeDiagnosticsPanel";

export default function RuntimeDiagnosticsPage() {
  return <AdminGuard><AdminPageFrame title="运行诊断" description="只读安全快照；不会启动、恢复或控制 Runtime。"><RuntimeDiagnosticsPanel /></AdminPageFrame></AdminGuard>;
}
