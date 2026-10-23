/** Resolve package-local links against the source document, never the Hub URL. */
export function resolveHaldurMarkdownLink(sourcePath: string, href: string): string {
  if (!href || href.startsWith("#") || href.startsWith("/") && !href.startsWith("//") || /^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return "";
  const hashAt = href.indexOf("#");
  const fragment = hashAt < 0 ? "" : href.slice(hashAt);
  const local = (hashAt < 0 ? href : href.slice(0, hashAt)).split("?")[0];
  const parts = sourcePath.split("/").slice(0, -1);
  try {
    for (const raw of local.split("/")) {
      const part = decodeURIComponent(raw).normalize("NFC");
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) return ""; parts.pop(); continue; }
      if (/[\\/\x00-\x1f\x7f]/.test(part)) return "";
      parts.push(part);
    }
  } catch { return ""; }
  const path = parts.join("/");
  if (!path) return "";
  const encoded = encodeURIComponent(path);
  if (/\.md$/i.test(path)) return `/haldur-design-skill?file=${encoded}${fragment}`;
  if (/\.(html?|svg|png|jpe?g|webp|gif)$/i.test(path)) return `/api/haldur-design-skill/preview/view?path=${encoded}`;
  return `/api/haldur-design-skill/files?path=${encoded}`;
}
