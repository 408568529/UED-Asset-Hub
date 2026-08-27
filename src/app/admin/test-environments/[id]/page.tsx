import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { TestEnvironmentForm } from "@/components/testEnvironment/TestEnvironmentForm";

export default async function EditTestEnvironmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminGuard><AdminPageFrame title="编辑测试环境" contentLayout="form" returnHref="/admin/test-environments" returnLabel="返回测试环境"><TestEnvironmentForm environmentId={decodeURIComponent(id)} /></AdminPageFrame></AdminGuard>;
}
