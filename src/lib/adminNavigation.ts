export function getAdminReturnTo(value: string | null, fallback = "/admin") {
  return value?.startsWith("/admin") ? value : fallback;
}
