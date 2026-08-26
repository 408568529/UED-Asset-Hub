import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { ComponentSpecForm } from "@/components/admin/ComponentSpecForm";

export default function NewComponentPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建组件规范"><ComponentSpecForm /></AdminPageFrame>
    </AdminGuard>
  );
}
