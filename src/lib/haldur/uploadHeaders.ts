// Versioned transport encoding, independent of the filesystem path validator.
export function haldurUploadHeaders(parent: string, name: string) {
  return { "x-haldur-path-encoding": "uri-v1", "x-haldur-parent-path": encodeURIComponent(parent), "x-haldur-file-name": encodeURIComponent(name) };
}
export function decodeHaldurHeader(value: string, encoding: string | null) {
  if (!encoding) return value;
  if (encoding !== "uri-v1") throw new Error("不支持的文件名编码。");
  return decodeURIComponent(value);
}
