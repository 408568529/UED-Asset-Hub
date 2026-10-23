import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function AdminTestEnvironmentsPage() {
  return <AdminGuard><main><AdminWorkspace><WorkspacePageHeader className="admin-page-header" title="测试环境管理" description="维护产品、版本和授权测试账号；密码查看及复制持续记录日志。" /><div className="admin-page-content"><TestEnvironmentManager adminMode /></div></AdminWorkspace></main></AdminGuard>;
}
