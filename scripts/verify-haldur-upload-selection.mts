import assert from 'node:assert/strict';
import { droppedFiles, selectedFiles, selectedFolderContents, uploadRelativePath } from '../src/lib/haldur/uploadSelection.ts';
const file = (name: string, path = '') => Object.assign(new File(['content'], name), { webkitRelativePath: path });
const chosen = selectedFiles([file('same.md', 'Root/a/same.md'), file('same.md', 'Root/b/same.md'), file('.DS_Store', 'Root/.DS_Store')]);
assert.deepEqual(chosen.map(item => item.relativePath), ['Root/a/same.md', 'Root/b/same.md']);
const contents = selectedFolderContents([
  file('SKILL.md', 'Haldur-Design-Skill/SKILL.md'),
  file('same.md', 'Haldur-Design-Skill/规范/同名/same.md'),
  file('same.md', 'Haldur-Design-Skill/参考/same.md'),
  file('.DS_Store', 'Haldur-Design-Skill/.DS_Store')
]);
assert.deepEqual(contents.map(item => item.relativePath), ['SKILL.md', '规范/同名/same.md', '参考/same.md']);
assert.throws(() => selectedFolderContents([file('no-folder.md')]));
for (const bad of ['../secret', '/absolute', 'a//b', 'a/./b', 'a/../b', 'a\\b', 'a\u0000b']) assert.throws(() => uploadRelativePath(bad));
const entry = (name: string) => ({ name, isFile: true, isDirectory: false, file: (ok: (value: File) => void) => ok(file(name)) });
const batches = [Array.from({ length: 100 }, (_, n) => entry(`file-${n}.md`)), [entry('last.md')], []];
const directory = { name: 'Root', isFile: false, isDirectory: true, createReader: () => ({ readEntries: (ok: (entries: unknown[]) => void) => ok(batches.shift()!) }) };
const dropped = await droppedFiles({ items: [{ kind: 'file', webkitGetAsEntry: () => directory }] } as unknown as DataTransfer);
assert.equal(dropped.length, 101);
assert.equal(dropped[100].relativePath, 'Root/last.md');
await assert.rejects(droppedFiles({ items: [{ kind: 'file', webkitGetAsEntry: () => null }] } as unknown as DataTransfer));
const failed = { ...directory, createReader: () => ({ readEntries: (_ok: unknown, fail: (error: Error) => void) => fail(new Error('access denied')) }) };
await assert.rejects(droppedFiles({ items: [{ kind: 'file', webkitGetAsEntry: () => failed }] } as unknown as DataTransfer), /access denied/);
const nestedDirectory = (name: string) => {
  const batches = [[entry('child.md')], []];
  return { name, isFile: false, isDirectory: true, createReader: () => ({ readEntries: (ok: (entries: unknown[]) => void) => ok(batches.shift()!) }) };
};
const mixed = await droppedFiles({ items: [entry('SKILL.md'), nestedDirectory('规范'), nestedDirectory('参考')].map(value => ({ kind: 'file', webkitGetAsEntry: () => value })) } as unknown as DataTransfer);
assert.deepEqual(mixed.map(item => item.relativePath), ['SKILL.md', '规范/child.md', '参考/child.md']);
console.log('PASS: folder contents without wrapper, mixed files/folders, nested selection, same-name files, path rejection, multi-batch directory traversal, inaccessible drop');
