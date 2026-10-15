import { createHash } from "node:crypto";
import { readFile, realpath, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const officialClientSha256 = "93bde01047b1932bb1daaf8811dae61b66ccb6a7e9a72b3b686577d10015ef37";
export const previousPatchedClientSha256 = "492c56a31ec65867aa4e48f95ebad1f9af2198c7301ca68f069f7aee387136fe";
export const patchedClientSha256 = "2cc6256717f1265494a125914e063082c5061a395cf44596fa720243e5cfd6eb";
export const originalLoadHandler = "\t\tconst loaded = () => {\n\t\t\tif (!trustedPreviewStarted) return;\n\t\t\tconnection?.close();\n\t\t\tfailNavigatedPreview();\n\t\t};";
export const compatibleLoadHandler = "\t\tconst loaded = () => {\n\t\t\tif (!trustedPreviewStarted || !connection) return;\n\t\t\tconst current = connection;\n\t\t\tvoid current.verifyCurrentDocument().then((alive) => {\n\t\t\t\tif (!active || alive) return;\n\t\t\t\tcurrent.close();\n\t\t\t\tfailNavigatedPreview();\n\t\t\t});\n\t\t};";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const originalReadinessTimeout = 'const timeout = window.setTimeout(() => setFrameState((state) => state === "loading" ? "failed" : state), 8e3);';
export const compatibleReadinessTimeout = `let timeout;
		let frameInView = false;
		const updateReadinessTimeout = () => {
			window.clearTimeout(timeout);
			if (!frameInView || document.visibilityState !== "visible") return;
			timeout = window.setTimeout(() => setFrameState((state) => state === "loading" ? "failed" : state), 8e3);
			frameRef.current?.contentWindow?.postMessage({
				source: "dsh-genui",
				type: "ready-request",
				artifactId: meta.artifactId,
				versionId: activeVersionId
			}, "*");
		};
		const readinessObserver = new IntersectionObserver(([entry]) => {
			frameInView = entry.isIntersecting;
			updateReadinessTimeout();
		});
		if (frameRef.current) readinessObserver.observe(frameRef.current);
		document.addEventListener("visibilitychange", updateReadinessTimeout);`;
export const originalReadinessCleanup = '\t\t\twindow.clearTimeout(timeout);\n\t\t\twindow.removeEventListener("message", receive);';
export const compatibleReadinessCleanup = '\t\t\twindow.clearTimeout(timeout);\n\t\t\treadinessObserver.disconnect();\n\t\t\tdocument.removeEventListener("visibilitychange", updateReadinessTimeout);\n\t\t\twindow.removeEventListener("message", receive);';

export function patchGenuiClientLoad(source) {
  const hash = digest(source);
  if (hash === patchedClientSha256) return source;
  if (![officialClientSha256, previousPatchedClientSha256].includes(hash)) throw new Error("Pinned GenUI client identity does not match the approved compatibility patch.");
  let result = source;
  if (hash === officialClientSha256) {
    if (result.split(originalLoadHandler).length !== 2) throw new Error("Pinned GenUI load handler does not match.");
    result = result.replace(originalLoadHandler, compatibleLoadHandler);
  }
  for (const [original, replacement] of [[originalReadinessTimeout, compatibleReadinessTimeout], [originalReadinessCleanup, compatibleReadinessCleanup]]) {
    if (result.split(original).length !== 2) throw new Error("Pinned GenUI readiness handler does not match.");
    result = result.replace(original, replacement);
  }
  if (digest(result) !== patchedClientSha256) throw new Error("GenUI compatibility patch integrity failed.");
  return result;
}

export async function installGenuiClientLoadPatch(dshHome) {
  const home = await realpath(dshHome);
  const packageRoot = await realpath(path.join(home, "profiles/web/node_modules/dsh-plugin-genui"));
  if (!packageRoot.toLowerCase().startsWith(home.toLowerCase() + path.sep)) throw new Error("GenUI package must be inside the isolated DSH home.");
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (manifest.name !== "dsh-plugin-genui" || manifest.version !== "0.15.1") throw new Error("Only the pinned GenUI version supports this compatibility patch.");
  const target = await realpath(path.join(packageRoot, "lib/client.js"));
  if (!target.toLowerCase().startsWith(packageRoot.toLowerCase() + path.sep)) throw new Error("GenUI client path escapes its package.");
  const source = await readFile(target, "utf8");
  const updated = patchGenuiClientLoad(source);
  if (updated !== source) {
    const temporary = target + ".ued-load-liveness.tmp";
    await writeFile(temporary, updated, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  }
  return { packageVersion: manifest.version, compatibility: "ued-visible-readiness-v2", officialClientSha256, patchedClientSha256, applied: updated !== source };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("An isolated DSH home is required.");
  console.log(JSON.stringify(await installGenuiClientLoadPatch(process.argv[2])));
}
