import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default function AdminSettingsPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Settings</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">系统设置</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">第一期保留配置入口，后续可接入账号、存储目录、AI 服务和上传策略。</p>
        <AdminTabs />
      </main>
    </AdminGuard>
  );
}
