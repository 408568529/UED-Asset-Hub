import { AdminGuard } from "@/components/admin/AdminGuard";
import { TestEnvironmentForm } from "@/components/testEnvironment/TestEnvironmentForm";

export default async function EditTestEnvironmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Edit Test Environment</p><h1 className="mt-5 text-3xl font-black">编辑测试环境</h1><TestEnvironmentForm environmentId={decodeURIComponent(id)} /></main></AdminGuard>;
}
