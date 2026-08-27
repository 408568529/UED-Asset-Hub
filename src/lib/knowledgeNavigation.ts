export function getKnowledgeReturnHref(value: string | undefined, fallback = "/knowledge") {
  return value === "/knowledge" || value?.startsWith("/knowledge?") ? value : fallback;
}

export function appendKnowledgeReturnHref(href: string, returnTo: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
