import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/config/admin";
import { isAdminRequest } from "@/lib/adminAuth";
import { operationLogService } from "@/services/operationLogService";

export async function POST(request: Request) {
  const authenticated = isAdminRequest(request);
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({ name: ADMIN_SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
  if (authenticated) {
    await operationLogService.createLog({
      type: "logout",
      title: "退出登录",
      description: "管理员退出管理台",
      targetType: "auth",
      operator: "admin"
    }).catch((error) => console.error("Admin logout log write failed", error));
  }
  return response;
}
