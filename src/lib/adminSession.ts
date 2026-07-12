"use client";

export async function isAdminLoggedIn() {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return response.ok && (await response.json() as { authenticated?: boolean }).authenticated === true;
  } catch {
    return false;
  }
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) return false;
  window.dispatchEvent(new Event("ued-admin-session-change"));
  return true;
}

export async function logoutAdmin() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.dispatchEvent(new Event("ued-admin-session-change"));
}
