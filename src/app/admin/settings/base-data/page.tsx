import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { BaseDataManager } from "@/components/admin/BaseDataManager";

export default function BaseDataPage() {
  return <AdminGuard><AdminPageFrame title="基础数据管理" description="维护标签、使用场景、资料文件夹和可复用分类。"><BaseDataManager /></AdminPageFrame></AdminGuard>;
}
