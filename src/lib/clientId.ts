export function createClientId(prefix = "") {
  const randomId = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${randomId}`;
}
