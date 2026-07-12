import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Settings</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">系统设置</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">第一期保留配置入口，后续可接入账号、存储目录、AI 服务和上传策略。</p>
        <AdminWorkspace><section className="border-y border-border py-6"><h2 className="text-xl font-black">基础数据管理</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">维护标签、使用场景、培训资料文件夹、Prompt 分类和 Skill 分类。</p><Button asChild className="mt-5"><Link href="/admin/settings/base-data">进入基础数据管理</Link></Button></section></AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
