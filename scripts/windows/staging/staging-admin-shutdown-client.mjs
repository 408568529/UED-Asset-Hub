import { createHash, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import tls from "node:tls";

const expectedCaFileSha256 = "2f9f0db0ac07d8ca2824123a1c5129dc3710eb77d9f661afa4b6a541b46a65e5";
const origin = process.env.UED_STAGING_ORIGIN;
const caPath = process.env.NODE_EXTRA_CA_CERTS;
const timeoutMs = 15_000;
let phase = "startup";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function loadTrustedCa() {
  if (origin !== "https://172.17.1.100:4443" || !caPath) fail("staging_tls_configuration_invalid");
  const pem = await readFile(caPath);
  const fileSha256 = createHash("sha256").update(pem).digest("hex");
  if (fileSha256 !== expectedCaFileSha256) fail("staging_ca_file_fingerprint_mismatch");
  const cert = new X509Certificate(pem);
  if (!cert.ca || cert.subject !== cert.issuer) fail("staging_ca_not_self_issued");
  console.log(`TLS_CA_FILE_SHA256=${fileSha256}`);
  console.log(`TLS_CA_FINGERPRINT_SHA256=${cert.fingerprint256}`);
  await verifyTlsPeer();
}

function verifyTlsPeer() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: "172.17.1.100", port: 4443, rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity });
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      const san = peer.subjectaltname ?? "";
      if (!socket.authorized || !san.includes("172.17.1.100")) {
        socket.destroy();
        fail("staging_tls_peer_verification_failed");
      }
      console.log(`TLS_LEAF_SAN=${san}`);
      console.log(`TLS_LEAF_FINGERPRINT_SHA256=${peer.fingerprint256}`);
      socket.end();
      resolve();
    });
    socket.once("error", reject);
  });
}

function request(path, { method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, origin), {
      method,
      headers,
      rejectUnauthorized: true,
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("request_timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sessionProbe() {
  phase = "https-session-probe";
  const response = await request("/api/auth/session");
  if (response.statusCode !== 200) fail("https_session_probe_failed");
  const payload = JSON.parse(response.body);
  if (typeof payload.authenticated !== "boolean") fail("https_session_probe_invalid_response");
  console.log("HTTPS_SESSION_PROBE=PASS");
}

async function readAdminCredential() {
  phase = "credential-input";
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const auth = JSON.parse(input);
  input = "";
  if (typeof auth.username !== "string" || typeof auth.password !== "string" || !auth.username || !auth.password) fail("staging_admin_credential_missing");
  return auth;
}

async function authenticateAdmin() {
  const auth = await readAdminCredential();
  phase = "admin-login";
  const commonHeaders = { Origin: origin, Referer: `${origin}/agent`, "Content-Type": "application/json" };
  const login = await request("/api/auth/login", { method: "POST", headers: commonHeaders, body: JSON.stringify(auth) });
  auth.password = "";
  if (login.statusCode !== 200) fail("staging_admin_authentication_failed");
  const setCookie = login.headers["set-cookie"]?.[0];
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie || !/^ued_admin_session=/.test(cookie)) fail("staging_admin_session_cookie_missing");
  const cookieFlags = setCookie.toLowerCase();
  if (!cookieFlags.includes("httponly") || !cookieFlags.includes("secure") || !cookieFlags.includes("samesite=lax")) fail("staging_admin_session_cookie_policy_failed");
  console.log("HTTPS_ADMIN_LOGIN=PASS");
  console.log("SECURE_SESSION_COOKIE=PASS");

  phase = "authenticated-session-probe";
  const session = await request("/api/auth/session", { headers: { Cookie: cookie } });
  if (session.statusCode !== 200 || JSON.parse(session.body).authenticated !== true) fail("authenticated_session_probe_failed");
  console.log("HTTPS_AUTHENTICATED_SESSION=PASS");
  return { commonHeaders, cookie };
}

async function loginProbe() {
  await authenticateAdmin();
  console.log("HTTPS_LOGIN_PROBE_ONLY=PASS");
}

async function loginLogoutProbe() {
  const { commonHeaders, cookie } = await authenticateAdmin();
  phase = "admin-logout";
  const logout = await request("/api/auth/logout", { method: "POST", headers: { ...commonHeaders, Cookie: cookie } });
  if (logout.statusCode !== 200 || JSON.parse(logout.body).authenticated !== false) fail("staging_admin_logout_failed");
  const cleared = logout.headers["set-cookie"]?.[0]?.toLowerCase() ?? "";
  if (!cleared.includes("ued_admin_session=") || !cleared.includes("max-age=0")) fail("staging_admin_logout_cookie_not_cleared");
  const session = await request("/api/auth/session");
  if (session.statusCode !== 200 || JSON.parse(session.body).authenticated !== false) fail("staging_admin_logout_session_still_active");
  console.log("HTTPS_ADMIN_LOGOUT=PASS");
  console.log("HTTPS_SESSION_CLEARED=PASS");
}

async function shutdown() {
  const { commonHeaders, cookie } = await authenticateAdmin();
  phase = "shutdown-request";
  const response = await request("/api/staging-shutdown", { method: "POST", headers: { ...commonHeaders, Cookie: cookie }, body: "{}" });
  if (response.statusCode !== 202) fail("staging_shutdown_not_accepted");
  const result = JSON.parse(response.body);
  if (!new Set(["accepted", "already_scheduled"]).has(result.status)) fail("staging_shutdown_response_invalid");
  console.log(`SUPERVISOR_SHUTDOWN_HTTP=${response.statusCode}`);
  console.log(`SUPERVISOR_SHUTDOWN_STATUS=${result.status}`);
}

async function main() {
  await loadTrustedCa();
  if (process.argv[2] === "--session-probe") await sessionProbe();
  else if (process.argv[2] === "--login-probe") await loginProbe();
  else if (process.argv[2] === "--login-logout-probe") await loginLogoutProbe();
  else await shutdown();
}

main().catch((error) => {
  const code = typeof error?.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : "staging_https_request_failed";
  console.error(`STAGING_HTTPS_CLIENT_PHASE=${phase}`);
  console.error(`STAGING_HTTPS_CLIENT_ERROR=${code}`);
  process.exitCode = 1;
});
