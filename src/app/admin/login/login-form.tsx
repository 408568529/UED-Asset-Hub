"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAdmin } from "@/lib/adminSession";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function submit(formData: FormData) {
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    if (!loginAdmin(username, password)) {
      setError("账号或密码不正确");
      return;
    }

    router.push("/admin");
  }

  return (
    <form action={submit} className="mt-10 max-w-md space-y-5 border-t border-foreground/10 pt-8">
      <label className="block space-y-2">
        <span className="text-sm font-bold">账号</span>
        <Input name="username" autoComplete="username" placeholder="请输入账号" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-bold">密码</span>
        <Input name="password" type="password" autoComplete="current-password" placeholder="请输入密码" />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" size="lg">登录</Button>
    </form>
  );
}
