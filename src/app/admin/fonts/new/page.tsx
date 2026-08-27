import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { FontForm } from "@/components/admin/FontForm";

export default function NewFontPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建 Font Library" contentLayout="form"><FontForm /></AdminPageFrame>
    </AdminGuard>
  );
}
