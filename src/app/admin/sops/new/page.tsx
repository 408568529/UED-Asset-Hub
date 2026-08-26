import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { SopForm } from "@/components/admin/SopForm";

export default function NewSopPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建标准 SOP"><SopForm /></AdminPageFrame>
    </AdminGuard>
  );
}
