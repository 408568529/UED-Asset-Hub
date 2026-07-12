"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminLoggedIn, logoutAdmin } from "@/lib/adminSession";

export function AdminNavActions() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    async function sync() {
      setLoggedIn(await isAdminLoggedIn());
    }

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("ued-admin-session-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("ued-admin-session-change", sync);
    };
  }, []);

  if (loggedIn) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/admin">
            <Settings size={16} />
            管理台
          </Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void logoutAdmin()}>退出登录</Button>
      </div>
    );
  }

  return (
    <Button asChild size="sm">
      <Link href="/admin/login">
        <Settings size={16} />
        管理入口
      </Link>
    </Button>
  );
}
