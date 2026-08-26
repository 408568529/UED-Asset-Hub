import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">系统设置</h1><p className="mt-0.5 text-xs text-muted-foreground">维护当前可配置的基础数据。</p></div></header>
        <div className="admin-page-content"><section className="border border-border px-5 py-5"><h2 className="text-base font-black">基础数据管理</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">维护标签、使用场景、培训资料文件夹、Prompt 分类和 Skill 分类。</p><Button asChild className="mt-5"><Link href="/admin/settings/base-data">进入基础数据管理</Link></Button></section></div>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
