import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const clientManifestName = /^(?:page|route)_client-reference-manifest\.js$/u;
const expectedClientReferenceCount = 123;

function fail(message) {
  throw new Error(`NEXT_MANIFEST_NORMALIZATION_STOP:${message}`);
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("UNSUPPORTED_ENCODING");
  }
}

function parseStrictJson(source) {
  let index = 0;
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[index] ?? "")) index++; };
  const string = () => {
    const start = index;
    if (source[index++] !== '"') fail("MALFORMED_JSON");
    while (index < source.length) {
      const code = source.charCodeAt(index++);
      if (code === 0x22) {
        try { return { value: JSON.parse(source.slice(start, index)), start, end: index }; }
        catch { fail("MALFORMED_JSON"); }
      }
      if (code < 0x20) fail("MALFORMED_JSON");
      if (code === 0x5c) {
        if (index >= source.length) fail("MALFORMED_JSON");
        const escaped = source[index++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(index, index + 4))) fail("MALFORMED_JSON");
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped)) fail("MALFORMED_JSON");
      }
    }
    fail("MALFORMED_JSON");
  };
  const value = () => {
    whitespace();
    const start = index;
    const character = source[index];
    if (character === "{") {
      index++;
      whitespace();
      const properties = [];
      const names = new Set();
      if (source[index] === "}") { index++; return { type: "object", properties, start, end: index }; }
      while (index < source.length) {
        whitespace();
        const key = string();
        if (names.has(key.value)) fail("DUPLICATE_JSON_KEY");
        names.add(key.value);
        whitespace();
        if (source[index++] !== ":") fail("MALFORMED_JSON");
        const child = value();
        properties.push({ key: key.value, keyStart: key.start, keyEnd: key.end, child });
        whitespace();
        if (source[index] === "}") { index++; return { type: "object", properties, start, end: index }; }
        if (source[index++] !== ",") fail("MALFORMED_JSON");
      }
      fail("MALFORMED_JSON");
    }
    if (character === "[") {
      index++;
      whitespace();
      const items = [];
      if (source[index] === "]") { index++; return { type: "array", items, start, end: index }; }
      while (index < source.length) {
        items.push(value());
        whitespace();
        if (source[index] === "]") { index++; return { type: "array", items, start, end: index }; }
        if (source[index++] !== ",") fail("MALFORMED_JSON");
      }
      fail("MALFORMED_JSON");
    }
    if (character === '"') return { type: "string", ...string() };
    const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(source.slice(index));
    if (!primitive) fail("MALFORMED_JSON");
    index += primitive[0].length;
    return { type: "primitive", start, end: index };
  };
  const root = value();
  whitespace();
  if (index !== source.length) fail("MALFORMED_JSON");
  return root;
}

function property(node, key) {
  return node?.type === "object" ? node.properties.find((entry) => entry.key === key)?.child : undefined;
}

function canonicalObjectSlice(source, node) {
  if (node?.type !== "object") fail("UNEXPECTED_TARGET_SCHEMA");
  const properties = [...node.properties].sort((left, right) => compareUtf8(left.key, right.key));
  return `{${properties.map(({ key, child }) => `${JSON.stringify(key)}:${source.slice(child.start, child.end)}`).join(",")}}`;
}

function replaceRange(source, start, end, replacement) {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function assertPreserved(beforeSource, before, afterSource, after, orderedTargetPath = []) {
  const visit = (left, right, at = []) => {
    if (!left || !right || left.type !== right.type) fail("SEMANTIC_PRESERVATION_FAILED");
    if (left.type === "object") {
      const leftKeys = left.properties.map(({ key }) => key);
      const rightKeys = right.properties.map(({ key }) => key);
      if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key))) fail("SEMANTIC_PRESERVATION_FAILED");
      const isTarget = at.length === orderedTargetPath.length && at.every((part, index) => part === orderedTargetPath[index]);
      const expectedKeys = isTarget ? [...leftKeys].sort(compareUtf8) : leftKeys;
      if (expectedKeys.some((key, index) => key !== rightKeys[index])) fail("SEMANTIC_PRESERVATION_FAILED");
      for (const { key, child } of left.properties) {
        const next = right.properties.find((entry) => entry.key === key)?.child;
        visit(child, next, [...at, key]);
      }
    } else if (left.type === "array") {
      if (left.items.length !== right.items.length) fail("SEMANTIC_PRESERVATION_FAILED");
      left.items.forEach((item, index) => visit(item, right.items[index], [...at, index]));
    } else if (beforeSource.slice(left.start, left.end) !== afterSource.slice(right.start, right.end)) {
      fail("SEMANTIC_PRESERVATION_FAILED");
    }
  };
  visit(before, after);
}

const jsonTargetByPath = new Map([
  ["app-build-manifest.json", ["pages"]],
  ["app-path-routes-manifest.json", []],
  ["server/app-paths-manifest.json", []],
  ["prerender-manifest.json", ["routes"]],
]);

function selectTarget(root, pathParts) {
  let node = root;
  for (const part of pathParts) node = property(node, part);
  return node;
}

export function assertJsonManifestPreserved(relativePath, beforeBytes, afterBytes) {
  const targetPath = jsonTargetByPath.get(relativePath);
  if (!targetPath) fail("UNEXPECTED_TARGET_PATH");
  const beforeSource = decodeUtf8(beforeBytes);
  const afterSource = decodeUtf8(afterBytes);
  const before = parseStrictJson(beforeSource);
  const after = parseStrictJson(afterSource);
  if (before.type !== "object" || after.type !== "object") fail("UNEXPECTED_ROOT_SCHEMA");
  const target = selectTarget(before, targetPath);
  if (!target || target.type !== "object") fail("UNEXPECTED_TARGET_SCHEMA");
  assertPreserved(beforeSource, before, afterSource, after, targetPath);
}

function normalizeJson(relativePath, bytes) {
  const source = decodeUtf8(bytes);
  const root = parseStrictJson(source);
  if (root.type !== "object") fail("UNEXPECTED_ROOT_SCHEMA");
  const target = selectTarget(root, jsonTargetByPath.get(relativePath));
  if (!target || target.type !== "object") fail("UNEXPECTED_TARGET_SCHEMA");
  const output = replaceRange(source, target.start, target.end, canonicalObjectSlice(source, target));
  assertJsonManifestPreserved(relativePath, bytes, Buffer.from(output, "utf8"));
  const reparsed = parseStrictJson(output);
  const afterTarget = selectTarget(reparsed, jsonTargetByPath.get(relativePath));
  if (!afterTarget || afterTarget.type !== "object" || afterTarget.properties.map(({ key }) => key).join("\u0000") !== [...target.properties].sort((a, b) => compareUtf8(a.key, b.key)).map(({ key }) => key).join("\u0000")) fail("SEMANTIC_PRESERVATION_FAILED");
  return Buffer.from(output, "utf8");
}

const wrapperPrefix = "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[";

function scanObjectEnd(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return index + 1;
  }
  fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
}

function scanStringEnd(source, start) {
  if (source[start] !== '"') fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const character = source[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index + 1;
  }
  fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
}

function normalizeClientReference(bytes) {
  const source = decodeUtf8(bytes);
  if (!source.startsWith(wrapperPrefix)) fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  const routeTokenEnd = scanStringEnd(source, wrapperPrefix.length);
  const assignmentBoundary = source.slice(routeTokenEnd, routeTokenEnd + 2);
  if (assignmentBoundary !== "]=") fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  const routeLiteral = source.slice(wrapperPrefix.length, routeTokenEnd);
  let route;
  try {
    route = JSON.parse(routeLiteral);
  } catch {
    fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  }
  if (typeof route !== "string" || !route.startsWith("/")) fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  const payloadStart = routeTokenEnd + 2;
  if (source[payloadStart] !== "{") fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  const payloadEnd = scanObjectEnd(source, payloadStart);
  const suffix = source.slice(payloadEnd);
  if (suffix !== "" && suffix !== ";" && suffix !== ";\n" && suffix !== "\n") fail("MALFORMED_CLIENT_REFERENCE_WRAPPER");
  const payloadSource = source.slice(payloadStart, payloadEnd);
  const payload = parseStrictJson(payloadSource);
  if (payload.type !== "object") fail("UNEXPECTED_ROOT_SCHEMA");
  const target = property(payload, "clientModules");
  if (!target || target.type !== "object") fail("UNEXPECTED_TARGET_SCHEMA");
  const normalizedPayload = replaceRange(payloadSource, target.start, target.end, canonicalObjectSlice(payloadSource, target));
  const reparsed = parseStrictJson(normalizedPayload);
  assertPreserved(payloadSource, payload, normalizedPayload, reparsed, ["clientModules"]);
  const afterTarget = property(reparsed, "clientModules");
  if (reparsed.type !== "object" || !afterTarget || afterTarget.type !== "object" || afterTarget.properties.map(({ key }) => key).join("\u0000") !== [...target.properties].sort((a, b) => compareUtf8(a.key, b.key)).map(({ key }) => key).join("\u0000")) fail("SEMANTIC_PRESERVATION_FAILED");
  const normalized = `${source.slice(0, payloadStart)}${normalizedPayload}${source.slice(payloadEnd)}`;
  if (!normalized.startsWith(wrapperPrefix) || JSON.parse(normalized.slice(wrapperPrefix.length, routeTokenEnd)) !== route || normalized.slice(routeTokenEnd + 2 + normalizedPayload.length) !== suffix) fail("WRAPPER_PRESERVATION_FAILED");
  return Buffer.from(normalized, "utf8");
}

export function normalizeNextManifestBytes(relativePath, bytes) {
  if (jsonTargetByPath.has(relativePath)) return normalizeJson(relativePath, bytes);
  if (typeof relativePath === "string" && relativePath.startsWith("server/app/") && relativePath.split("/").length >= 3 && clientManifestName.test(path.posix.basename(relativePath))) return normalizeClientReference(bytes);
  return null;
}

export async function normalizeNextManifestTree(root) {
  const rootPath = path.resolve(root);
  const changed = [];
  const seen = new Set();
  let clientReferenceCount = 0;
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, childRelative);
      else if (entry.isFile() && (jsonTargetByPath.has(childRelative) || (childRelative.startsWith("server/app/") && clientManifestName.test(entry.name)))) {
        if (!(await lstat(absolute)).isFile()) fail("UNSAFE_TARGET_FILE");
        const original = await readFile(absolute);
        const normalized = normalizeNextManifestBytes(childRelative, original);
        if (!normalized) fail("UNEXPECTED_TARGET_PATH");
        seen.add(childRelative);
        if (childRelative.startsWith("server/app/") && clientManifestName.test(entry.name)) clientReferenceCount++;
        if (!original.equals(normalized)) {
          await writeFile(absolute, normalized);
          changed.push(childRelative);
        }
      }
    }
  }
  await visit(rootPath);
  for (const expected of jsonTargetByPath.keys()) if (!seen.has(expected)) fail("MISSING_REQUIRED_MANIFEST");
  if (clientReferenceCount !== expectedClientReferenceCount) fail("CLIENT_REFERENCE_TARGET_COUNT_MISMATCH");
  return changed.sort(compareUtf8);
}
