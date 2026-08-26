import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { OperationLogList } from "@/components/admin/OperationLogList";
import { operationLogService } from "@/services/operationLogService";

export default async function AdminLogsPage() {
  const logs = await operationLogService.getLogs();

  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">更新日志</h1><p className="mt-0.5 text-xs text-muted-foreground">记录资产与账号相关的关键操作。</p></div></header>
        <div className="admin-page-content"><OperationLogList logs={logs} /></div>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
