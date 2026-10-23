import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE } from "@/config/admin";
import { authenticateAdmin, createAdminSession } from "@/lib/adminAuth";
import { operationLogService } from "@/services/operationLogService";
import { isHostSecurityConfigError } from "../../../../../scripts/host-security-config.mjs";
import { acceptsLocalDistributionRequest } from "../../../../../scripts/local-distribution-config.mjs";

export async function POST(request: Request) {
  if (!acceptsLocalDistributionRequest(request)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  let authenticated = false;
  try {
    authenticated = authenticateAdmin(String(body.username ?? ""), String(body.password ?? ""));
  } catch (error) {
    if (isHostSecurityConfigError(error)) {
      console.error(`[Admin Login] ${error.reasonCode}: ${error.field}`);
      return NextResponse.json({ code: error.reasonCode, message: "登录服务配置错误。" }, { status: 503 });
    }
    console.error("[Admin Login] login_service_unavailable");
    return NextResponse.json({ code: "login_service_unavailable", message: "登录服务暂不可用。" }, { status: 503 });
  }
  if (!authenticated) return NextResponse.json({ code: "invalid_credentials", message: "账号或密码不正确。" }, { status: 401 });

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
