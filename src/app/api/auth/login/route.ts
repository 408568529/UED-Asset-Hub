import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE } from "@/config/admin";
import { authenticateAdmin, createAdminSession } from "@/lib/adminAuth";
import { operationLogService } from "@/services/operationLogService";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  if (!authenticateAdmin(String(body.username ?? ""), String(body.password ?? ""))) {
    return NextResponse.json({ message: "账号或密码不正确" }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSession(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.ADMIN_SESSION_SECURE === "true",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE
  });
  await operationLogService.createLog({
    type: "login",
    title: "登录",
    description: "管理员登录管理台",
    targetType: "auth",
    operator: String(body.username ?? "admin")
  }).catch((error) => console.error("Admin login log write failed", error));
  return response;
}
