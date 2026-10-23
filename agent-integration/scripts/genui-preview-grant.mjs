import { createHmac, timingSafeEqual } from "node:crypto";

export const previewGrantQuery = "ued_preview_grant";
export const previewGrantLifetimeMs = 5 * 60 * 1000;

export function hasValidPreviewGrant(request, url, sessionSecret) {
  if (!sessionSecret) return false;
  if (request.method !== "GET" || url.searchParams.getAll(previewGrantQuery).length !== 1) return false;
  const grant = url.searchParams.get(previewGrantQuery) || "";
  const [payload, signature, extra] = grant.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  let scope;
  try { scope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return false; }
  if (typeof scope?.artifactId !== "string" || typeof scope?.versionId !== "string"
    || !Number.isSafeInteger(scope?.expiresAt) || scope.expiresAt <= Date.now()
    || scope.expiresAt > Date.now() + previewGrantLifetimeMs) return false;
  const assetMatch = url.pathname.match(/^\/genui\/assets\/([^/]+)\/([^/]+)\/.+$/);
  if (url.pathname !== "/genui/bridge.js"
    && (!assetMatch || assetMatch[1] !== encodeURIComponent(scope.artifactId) || assetMatch[2] !== encodeURIComponent(scope.versionId))) return false;
  const expected = createHmac("sha256", sessionSecret).update(`genui-preview-asset-v1.${payload}`).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

