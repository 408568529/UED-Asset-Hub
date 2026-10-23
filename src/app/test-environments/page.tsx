import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function TestEnvironmentsPage() {
  return <AdminGuard><main className="tool-workspace"><WorkspacePageHeader className="tool-workspace-header" title="测试环境" description="快速查找环境地址与授权账号，复制和密码查看均保留审计。" /><div className="tool-workspace-content"><TestEnvironmentManager /></div></main></AdminGuard>;
}
