import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function AdminTestEnvironmentsPage() {
  return <AdminGuard><main><AdminWorkspace><header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">测试环境管理</h1><p className="mt-0.5 text-xs text-muted-foreground">维护产品、版本和授权测试账号；密码查看及复制持续记录日志。</p></div></header><div className="admin-page-content"><TestEnvironmentManager adminMode /></div></AdminWorkspace></main></AdminGuard>;
}
