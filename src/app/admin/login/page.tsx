import { LoginForm } from "@/app/admin/login/login-form";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
      <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Admin Login</p>
      <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">登录管理台</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">第一期使用预设账号密码，后续可替换为真实后端登录。</p>
      <LoginForm />
    </main>
  );
}
