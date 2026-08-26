import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { TestEnvironmentForm } from "@/components/testEnvironment/TestEnvironmentForm";

export default function NewTestEnvironmentPage() {
  return <AdminGuard><AdminPageFrame title="新建测试环境"><TestEnvironmentForm /></AdminPageFrame></AdminGuard>;
}
