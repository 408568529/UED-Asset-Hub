import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
export const hashPattern = /^[a-f0-9]{64}$/u;
export function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) throw new Error(`${label}: unknown/missing fields`);
}
export function hash(value, label) { if (typeof value !== "string" || !hashPattern.test(value)) throw new Error(`${label}: SHA-256 required`); }
export function identity(value) { return sha256(Buffer.from(canonicalJson(value))); }
// Scan keys before JSON.parse can overwrite a duplicate. The parser also rejects trailing input.
export function parseStrictJson(bytes) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let offset = 0;
  const whitespace = () => { while (/\s/u.test(source[offset] || "") && offset < source.length) offset++; };
  const string = () => {
    const start = offset++;
    while (offset < source.length) {
      if (source[offset] === "\\") { offset += 2; continue; }
      if (source[offset++] === '"') return JSON.parse(source.slice(start, offset));
    }
    throw new Error("JSON unterminated string");
  };
  function value() {
    whitespace();
    if (source[offset] === "{") {
      offset++; whitespace(); const keys = new Set();
      if (source[offset] === "}") { offset++; return; }
      while (true) {
        whitespace(); if (source[offset] !== '"') throw new Error("JSON object key");
        const key = string(); if (keys.has(key)) throw new Error("JSON duplicate key: " + key); keys.add(key);
        whitespace(); if (source[offset++] !== ":") throw new Error("JSON colon"); value(); whitespace();
        const delimiter = source[offset++]; if (delimiter === "}") return; if (delimiter !== ",") throw new Error("JSON object delimiter");
      }
    }
    if (source[offset] === "[") {
      offset++; whitespace(); if (source[offset] === "]") { offset++; return; }
      while (true) { value(); whitespace(); const delimiter = source[offset++]; if (delimiter === "]") return; if (delimiter !== ",") throw new Error("JSON array delimiter"); }
    }
    if (source[offset] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(source.slice(offset));
    if (!token) throw new Error("JSON value"); offset += token[0].length;
  }
  value(); whitespace(); if (offset !== source.length) throw new Error("JSON trailing input");
  return JSON.parse(source);
}
