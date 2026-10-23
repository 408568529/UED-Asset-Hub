import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { OperationLogList } from "@/components/admin/OperationLogList";
import { operationLogService } from "@/services/operationLogService";

export default async function AdminLogsPage() {
  const logs = await operationLogService.getLogs();

  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <WorkspacePageHeader className="admin-page-header" title="更新日志" description="记录资产与账号相关的关键操作。" />
        <div className="admin-page-content"><OperationLogList logs={logs} /></div>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
