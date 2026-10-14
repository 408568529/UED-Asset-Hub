"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAdmin } from "@/lib/adminSession";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(formData: FormData) {
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    setSubmitting(true);
    const result = await loginAdmin(username, password);
    if (result !== "authenticated") {
      setError(result === "invalid_credentials" ? "账号或密码不正确" : result === "server_configuration_error" ? "登录服务配置错误，请检查隔离测试环境启动配置。" : "登录服务暂不可用，请检查服务运行状态。");
      setSubmitting(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <form action={submit} className="workflow-form max-w-md space-y-6">
      <label className="block space-y-2">
        <span className="text-sm font-bold">账号</span>
        <Input name="username" autoComplete="username" placeholder="请输入账号" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-bold">密码</span>
        <Input name="password" type="password" autoComplete="current-password" placeholder="请输入密码" />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" size="lg" disabled={submitting}>{submitting ? "登录中" : "登录"}</Button>
    </form>
  );
}
