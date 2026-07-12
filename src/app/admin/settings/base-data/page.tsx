import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { BaseDataManager } from "@/components/admin/BaseDataManager";

export default function BaseDataPage() {
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Settings / Base Data</p><h1 className="mt-6 text-3xl font-black">基础数据管理</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">统一维护标签、使用场景、资料文件夹和可复用分类。重命名、替换与删除会同步处理所有引用。</p><AdminWorkspace><BaseDataManager /></AdminWorkspace></main></AdminGuard>;
}
