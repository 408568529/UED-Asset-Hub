"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminSession";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Checking session</p>
      </main>
    );
  }

  return <>{children}</>;
}
