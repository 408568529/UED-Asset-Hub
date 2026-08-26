import { AdminGuard } from "@/components/admin/AdminGuard";
import { TestEnvironmentManager } from "@/components/testEnvironment/TestEnvironmentManager";

export default function TestEnvironmentsPage() {
  return <AdminGuard><main className="tool-workspace"><header className="tool-workspace-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">测试环境</h1><p className="mt-0.5 text-xs text-muted-foreground">快速查找环境地址与授权账号，复制和密码查看均保留审计。</p></div></header><div className="tool-workspace-content"><TestEnvironmentManager /></div></main></AdminGuard>;
}
