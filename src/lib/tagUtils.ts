export function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
