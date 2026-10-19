import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { acceptsLocalDistributionRequest } from "../../scripts/local-distribution-config.mjs";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, getAdminSecurityConfig } from "@/config/admin";

type AdminSessionPayload = {
  username: string;
  expiresAt: number;
};

function encode(payload: AdminSessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getAdminSecurityConfig().sessionSecret).update(value).digest("base64url");
}

function verifySession(token?: string) {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expected = sign(encodedPayload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSessionPayload;
    return payload.username === getAdminSecurityConfig().username && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function getRequestCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
}

export function authenticateAdmin(username: string, password: string) {
  const config = getAdminSecurityConfig();
  return username === config.username && password === config.password;
}

export function createAdminSession() {
  const payload = encode({ username: getAdminSecurityConfig().username, expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000 });
  return `${payload}.${sign(payload)}`;
}

export function isAdminRequest(request: Request) {
  if (!acceptsLocalDistributionRequest(request)) return false;
  return verifySession(getRequestCookie(request));
}

export async function hasAdminSession() {
  if (!acceptsLocalDistributionRequest({ headers: await headers(), method: "GET" })) return false;
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}
