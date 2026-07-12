import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminAuth";

export async function AdminGuard({ children }: { children: ReactNode }) {
  if (!await hasAdminSession()) redirect("/admin/login");
  return <>{children}</>;
}
