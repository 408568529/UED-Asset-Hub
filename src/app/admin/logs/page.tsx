import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { OperationLogList } from "@/components/admin/OperationLogList";
import { operationLogService } from "@/services/operationLogService";

export default async function AdminLogsPage() {
  const logs = await operationLogService.getLogs();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Operation Logs</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">更新日志</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">记录新增、编辑、删除、版本、登录和退出登录等关键操作。</p>
        <AdminTabs />
        <section className="mt-12">
          <OperationLogList logs={logs} />
        </section>
      </main>
    </AdminGuard>
  );
}
