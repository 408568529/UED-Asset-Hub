import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const releaseMode = "release-native";
const developerMode = "developer-source-output";
const invalidSegment = /[<>:"|?*\u0000-\u001f]/u;
const reserved = new Set(["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)]);

export function parseNativeBuildArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unknown native build argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate native build argument: ${key}`);
    values[key] = value;
    index += 1;
  }
  if (!values["--mode"]) throw new Error("Native build mode is required.");
  if (![releaseMode, developerMode].includes(values["--mode"])) throw new Error("Native build mode is invalid.");
  return { mode: values["--mode"], stagingRoot: values["--staging-root"], outputDir: values["--output-dir"], tempDir: values["--temp-dir"], assetHubCommit: values["--asset-hub-commit"], compilerVersion: values["--compiler-version"], linkerVersion: values["--linker-version"], windowsSdkVersion: values["--windows-sdk-version"], compilerPath: values["--compiler-path"], linkerPath: values["--linker-path"], sdkRoot: values["--sdk-root"], sourceArchive: values["--source-archive"], sourceSnapshotManifest: values["--source-snapshot-manifest"], buildReceiptDir: values["--build-receipt-dir"], experimentId: values["--experiment-id"], executionRunId: values["--execution-run-id"] };
}

function assertWindowsAbsolute(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z]:\\[^\\]/.test(value) || /^[A-Za-z]:[^\\]/.test(value) || value.startsWith("\\\\") || value.startsWith("\\\\?\\") || value.startsWith("\\.\\")) throw new Error(`${label} must be an absolute local drive path.`);
  const normalized = path.win32.normalize(value);
  for (const segment of normalized.split("\\").slice(1)) {
    const stem = segment.split(".")[0].toUpperCase();
    if (!segment || /[.\s]$/u.test(segment) || invalidSegment.test(segment) || reserved.has(stem)) throw new Error(`${label} contains an unsafe Windows path segment.`);
  }
  return normalized;
}

function contained(root, candidate) {
  const left = root.toLocaleLowerCase("en-US");
  const right = candidate.toLocaleLowerCase("en-US");
  return right === left || right.startsWith(`${left}\\`);
}

export function validateReleaseNativePathShape({ stagingRoot, outputDir, tempDir, protectedRoots = [] }) {
  const root = assertWindowsAbsolute(stagingRoot, "staging root");
  const output = assertWindowsAbsolute(outputDir, "output directory");
  const temp = assertWindowsAbsolute(tempDir, "temp directory");
  const outputBase = path.win32.join(root, "staging", "native-components", ".candidates");
  const tempBase = path.win32.join(root, "staging", "native-build-temp");
  if (!contained(outputBase, output) || output === outputBase) throw new Error("release-native output must be a native-components candidate child.");
  if (!contained(tempBase, temp) || temp === tempBase) throw new Error("release-native temp must be a native-build-temp child.");
  if (contained(output, temp) || contained(temp, output)) throw new Error("release-native output and temp directories must not overlap.");
  for (const protectedRoot of protectedRoots) {
    const protectedPath = assertWindowsAbsolute(protectedRoot, "protected root");
    if (contained(protectedPath, output) || contained(output, protectedPath) || contained(protectedPath, temp) || contained(temp, protectedPath)) throw new Error("release-native path overlaps a protected root.");
  }
  return { stagingRoot: root, outputDir: output, tempDir: temp };
}

async function assertNoReparsePath(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new Error("release-native paths must not cross reparse points.");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export async function prepareReleaseNativeDirectories({ stagingRoot, outputDir, tempDir, expectedCreationRunId, protectedRoots = [] }) {
  if (process.platform !== "win32") throw new Error("release-native native build paths require Windows.");
  const shaped = validateReleaseNativePathShape({ stagingRoot, outputDir, tempDir, protectedRoots });
  const canonicalRoot = await realpath(shaped.stagingRoot);
  const marker = JSON.parse(await readFile(path.join(canonicalRoot, ".ued-staging-owner.json"), "utf8"));
  if (!marker?.creationRunId || (expectedCreationRunId && marker.creationRunId !== expectedCreationRunId)) throw new Error("staging ownership marker is invalid.");
  await assertNoReparsePath(canonicalRoot);
  for (const directory of [shaped.outputDir, shaped.tempDir]) {
    await mkdir(directory, { recursive: true });
    const canonical = await realpath(directory);
    if (!contained(canonicalRoot, canonical)) throw new Error("release-native path escapes staging root.");
    await assertNoReparsePath(canonical);
  }
  return { ...shaped, canonicalStagingRoot: canonicalRoot, creationRunId: marker.creationRunId };
}

export function resolveNativeBuildPlan({ argv, projectRoot, componentDefinition, protectedRoots = [] }) {
  const options = parseNativeBuildArgs(argv);
  if (!componentDefinition?.componentName || !componentDefinition.developerOutputDirectory || !componentDefinition.executableRelativePath) throw new Error("native build component definition is invalid.");
  if (options.mode === developerMode) {
    if (options.stagingRoot || options.outputDir || options.tempDir || options.assetHubCommit || options.compilerVersion || options.linkerVersion || options.windowsSdkVersion || options.compilerPath || options.linkerPath || options.sdkRoot || options.sourceArchive || options.sourceSnapshotManifest || options.buildReceiptDir || options.experimentId || options.executionRunId) throw new Error("developer-source-output does not accept release-native inputs.");
    const outputDir = path.join(projectRoot, "native", componentDefinition.developerOutputDirectory, "bin");
    return { mode: options.mode, outputDir, tempDir: path.join(outputDir, ".build-temp"), executable: path.join(outputDir, path.basename(componentDefinition.executableRelativePath)), componentDefinition };
  }
  if (!options.stagingRoot || !options.outputDir || !options.tempDir) throw new Error("release-native requires --staging-root, --output-dir, and --temp-dir.");
  if (!/^[a-f0-9]{40}$/.test(options.assetHubCommit || "") || !options.compilerVersion || !options.linkerVersion || !options.windowsSdkVersion) throw new Error("release-native requires formal component provenance inputs.");
  const shaped = validateReleaseNativePathShape({ stagingRoot: options.stagingRoot, outputDir: options.outputDir, tempDir: options.tempDir, protectedRoots });
  if (path.win32.basename(shaped.outputDir) !== componentDefinition.componentName) throw new Error("release-native output directory is not the canonical component directory.");
  return { ...options, mode: options.mode, ...shaped, executable: path.win32.join(shaped.outputDir, path.basename(componentDefinition.executableRelativePath)), componentDefinition, assetHubCommit: options.assetHubCommit, componentToolchain: { compilerVersion: options.compilerVersion, linkerVersion: options.linkerVersion, windowsSdkVersion: options.windowsSdkVersion } };
}
