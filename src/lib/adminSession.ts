"use client";

import { ADMIN_PASSWORD_KEY, ADMIN_TOKEN_KEY, adminCredentials } from "@/config/admin";

export function isAdminLoggedIn() {
  return typeof window !== "undefined" && localStorage.getItem(ADMIN_TOKEN_KEY) === adminCredentials.token;
}

export function loginAdmin(username: string, password: string) {
  if (username !== adminCredentials.username || password !== adminCredentials.password) return false;
  localStorage.setItem(ADMIN_TOKEN_KEY, adminCredentials.token);
  localStorage.setItem(ADMIN_PASSWORD_KEY, password);
  window.dispatchEvent(new Event("ued-admin-session-change"));
  writeAuthLog("login", "登录", "管理员登录管理台");
  return true;
}

export function logoutAdmin() {
  const password = getAdminPassword();
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_PASSWORD_KEY);
  window.dispatchEvent(new Event("ued-admin-session-change"));
  writeAuthLog("logout", "退出登录", "管理员退出管理台", password);
}

export function getAdminPassword() {
  return typeof window === "undefined" ? "" : localStorage.getItem(ADMIN_PASSWORD_KEY) || "";
}

function writeAuthLog(type: "login" | "logout", title: string, description: string, password = getAdminPassword()) {
  fetch("/api/logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({
      type,
      title,
      description,
      targetType: "auth",
      operator: adminCredentials.username
    })
  }).catch((error) => {
    console.error("Auth log write failed", error);
  });
}
