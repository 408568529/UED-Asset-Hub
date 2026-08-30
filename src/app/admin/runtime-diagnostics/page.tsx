import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { RuntimeDiagnosticsPanel } from "@/components/admin/RuntimeDiagnosticsPanel";

export default function RuntimeDiagnosticsPage() {
  return <AdminGuard><main><AdminWorkspace><div className="admin-page-content"><RuntimeDiagnosticsPanel /></div></AdminWorkspace></main></AdminGuard>;
}
