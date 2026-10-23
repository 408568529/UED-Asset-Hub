import { createHash } from 'node:crypto';
import { readingPolicyUrl } from './haldur-reading-policy.mjs';
import { readFile, realpath, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const officialServerSha256 = '594ae015e9e042fc8a5916522c32c9aea33342f6faa3c1446dbc8f54a171bb04';
const digest = value => createHash('sha256').update(value).digest('hex');
const marker = 'import { isHaldurRead, registerHaldurReadingPolicy } from "./ued-haldur-reading-policy.mjs";\n';
const replacements = [
  ['\t\tconst call = connectedRead(exec);', '\t\tif (isHaldurRead(exec.name)) return;\n\t\tconst call = connectedRead(exec);'],
  ['function registerDiscoveryBudget(ctx) {', 'function registerDiscoveryBudget(ctx) {\n\tregisterHaldurReadingPolicy(ctx);'],
  ['Use at most two discovery calls per connected source, four reads from one source, and six connected reads in one user turn.', 'For the existing Haldur tools only, use at most 6 discovery calls and 64 document pages per user turn. Read SKILL.md first; finish its ordered prerequisites and each document through nextOffset with unchanged sha256. Other sources retain two discovery calls per source, four reads per source and six reads per turn.'],
  ['then answer or create the useful interactive surface now.', 'then report the missing evidence. Do not create or update a source-dependent design using invented fallback styles.'],
];
export function patchGenuiHaldurReading(source) {
  if (source.startsWith(marker)) {
    const restored = replacements.reduce((text, [before, after]) => text.replace(after, before), source.slice(marker.length));
    if (digest(restored) !== officialServerSha256) throw new Error('Installed reading patch identity mismatch.');
    return source;
  }
  if (digest(source) !== officialServerSha256) throw new Error('Only pinned GenUI 0.15.1 server bytes may be patched.');
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw new Error('Reading patch anchor mismatch.');
    source = source.replace(before, after);
  }
  return marker + source;
}
export async function installGenuiHaldurReadingPatch(dshHome) {
  const home = await realpath(dshHome);
  let root;
  try { root = await realpath(path.join(home, 'profiles/web/node_modules/dsh-plugin-genui')); }
  catch (error) { if (error.code === 'ENOENT') return { applied: false, reason: 'genui-not-installed' }; throw error; }
  if (!root.startsWith(home + path.sep)) throw new Error('GenUI must remain inside the isolated DSH home.');
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.name !== 'dsh-plugin-genui' || manifest.version !== '0.15.1') throw new Error('Pinned GenUI 0.15.1 required.');
  const target = await realpath(path.join(root, 'lib/index.js'));
  if (!target.startsWith(root + path.sep)) throw new Error('GenUI server path escapes package.');
  const source = await readFile(target, 'utf8'), updated = patchGenuiHaldurReading(source);
  await writeFile(path.join(root, 'lib/ued-haldur-reading-policy.mjs'), await readFile(readingPolicyUrl), { mode: 0o600 });
  if (updated !== source) {
    const temporary = target + '.ued-reading.tmp';
    await writeFile(temporary, updated, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  }
  return { compatibility: 'ued-haldur-reading-v1', applied: updated !== source, serverSha256: digest(updated) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await installGenuiHaldurReadingPatch(process.argv[2])));
