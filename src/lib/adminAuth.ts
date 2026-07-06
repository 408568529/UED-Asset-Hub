import { adminCredentials } from "@/config/admin";

export function isAdminRequest(request: Request) {
  return request.headers.get("x-admin-password") === adminCredentials.password;
}
