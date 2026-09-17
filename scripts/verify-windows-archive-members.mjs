import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { archiveMembers } from "./windows-release-constructor.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value, values[index + 1]]] : pairs, []));
if (!args["--archive"] || !args["--manifest"]) throw new Error("missing --archive or --manifest");
const manifestBytes = await readFile(args["--manifest"]); const manifest = JSON.parse(manifestBytes.toString("utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const members = await archiveMembers(args["--archive"]);
const expected = manifest.files.map((file) => file.relativePath).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
if (JSON.stringify(members) !== JSON.stringify(expected)) throw new Error("canonical archive members do not match snapshot manifest.");
console.log(JSON.stringify({ result: "PASS", archiveSha256: sha256(await readFile(args["--archive"])), manifestSha256: sha256(manifestBytes), memberCount: members.length, members }, null, 2));
