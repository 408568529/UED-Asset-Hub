import { appendFile, rename, rm, stat } from "node:fs/promises";

function isMissing(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

export function createBoundedNdjsonWriter({ filePath, maxBytes = 5 * 1024 * 1024, maxRotatedFiles = 3, fileSystem = { appendFile, rename, rm, stat }, onDegraded = () => {}, onRecovered = () => {} }) {
  let queue = Promise.resolve();
  let degraded = false;

  const notify = (callback) => { try { callback(); } catch {} };
  const markDegraded = () => {
    if (degraded) return;
    degraded = true;
    notify(onDegraded);
  };
  const markRecovered = () => {
    if (!degraded) return;
    degraded = false;
    notify(onRecovered);
  };
  const fileSize = async (target) => {
    try { return (await fileSystem.stat(target)).size; }
    catch (error) { if (isMissing(error)) return 0; throw error; }
  };
  const renameIfPresent = async (from, to) => {
    try { await fileSystem.rm(to, { force: true }); }
    catch (error) { if (!isMissing(error)) throw error; }
    try { await fileSystem.rename(from, to); }
    catch (error) { if (!isMissing(error)) throw error; }
  };
  const rotate = async () => {
    await fileSystem.rm(`${filePath}.${maxRotatedFiles}`, { force: true });
    for (let index = maxRotatedFiles - 1; index >= 1; index -= 1) await renameIfPresent(`${filePath}.${index}`, `${filePath}.${index + 1}`);
    await renameIfPresent(filePath, `${filePath}.1`);
  };
  const append = async (record) => {
    try {
      const line = `${JSON.stringify(record)}\n`;
      if (Buffer.byteLength(line) > maxBytes) {
        markDegraded();
        return { written: false, degraded: true };
      }
      if ((await fileSize(filePath)) + Buffer.byteLength(line) > maxBytes) await rotate();
      await fileSystem.appendFile(filePath, line, { mode: 0o600 });
      markRecovered();
      return { written: true, degraded: false };
    } catch {
      markDegraded();
      return { written: false, degraded: true };
    }
  };

  return {
    append(record) {
      const task = queue.then(() => append(record), () => append(record));
      queue = task.then(() => undefined, () => undefined);
      return task;
    },
    flush: () => queue,
    isDegraded: () => degraded
  };
}
