import { AdminGuard } from "@/components/admin/AdminGuard";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function TestEnvironmentsPage() {
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-16 md:py-24"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Test Environments</p><h1 className="mt-5 text-3xl font-black">测试环境管理</h1><p className="mt-4 max-w-2xl leading-8 text-muted-foreground">按产品、客户版本和环境类型查找授权测试账号。密码默认隐藏，查看与复制都会记录日志。</p><div className="mt-12"><TestEnvironmentManager /></div></main></AdminGuard>;
}
