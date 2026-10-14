"use client";

export async function isAdminLoggedIn() {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return response.ok && (await response.json() as { authenticated?: boolean }).authenticated === true;
  } catch {
    return false;
  }
}

export async function loginAdmin(username: string, password: string): Promise<"authenticated" | "invalid_credentials" | "server_configuration_error" | "service_unavailable"> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (response.status === 401) return "invalid_credentials";
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string };
      return body.code === "host_security_config_invalid" || body.code === "host_security_config_missing" ? "server_configuration_error" : "service_unavailable";
    }
    window.dispatchEvent(new Event("ued-admin-session-change"));
    return "authenticated";
  } catch {
    return "service_unavailable";
  }
}

export async function logoutAdmin() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.dispatchEvent(new Event("ued-admin-session-change"));
}
