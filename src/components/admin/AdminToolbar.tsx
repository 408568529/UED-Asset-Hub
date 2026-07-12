"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreateAssetMenu } from "@/components/admin/CreateAssetMenu";
import { logoutAdmin } from "@/lib/adminSession";

export function AdminToolbar() {
  const router = useRouter();

  async function logout() {
    await logoutAdmin();
    router.push("/admin/login");
  }

  return (
    <div className="flex flex-wrap gap-3">
      <CreateAssetMenu />
      <Button type="button" variant="outline" onClick={() => void logout()}>退出登录</Button>
    </div>
  );
}
