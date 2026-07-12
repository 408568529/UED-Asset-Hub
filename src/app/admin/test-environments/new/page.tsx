import { AdminGuard } from "@/components/admin/AdminGuard";
import { TestEnvironmentForm } from "@/components/testEnvironment/TestEnvironmentForm";

export default function NewTestEnvironmentPage() {
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">New Test Environment</p><h1 className="mt-5 text-3xl font-black">新建测试环境</h1><TestEnvironmentForm /></main></AdminGuard>;
}
