import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function AdminTestEnvironmentsPage() {
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Admin / Test Environments</p><h1 className="mt-5 text-3xl font-black">测试环境管理</h1><AdminWorkspace><TestEnvironmentManager adminMode /></AdminWorkspace></main></AdminGuard>;
}
