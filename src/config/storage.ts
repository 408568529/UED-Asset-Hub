import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const MICRO_STANDARD_ROOT = process.env.MICRO_STANDARD_ROOT;
export const META_DIR = path.join(DATA_DIR, "meta");
export const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const configuredAssetHubRuntimeDir = process.env.ASSET_HUB_RUNTIME_DIR;
export const ASSET_HUB_RUNTIME_DIR = configuredAssetHubRuntimeDir || path.join(path.dirname(DATA_DIR), "asset-hub-runtime");
const legacyTrainingMediaDir = path.join(DATA_DIR, "training-media");
const configuredTrainingMediaDir = process.env.TRAINING_MEDIA_DIR;
// Keep manually managed training videos beside runtime data, not inside it.
export const TRAINING_MEDIA_DIR = configuredTrainingMediaDir && path.resolve(configuredTrainingMediaDir) !== path.resolve(legacyTrainingMediaDir)
  ? configuredTrainingMediaDir
  : path.join(path.dirname(DATA_DIR), "training-media");
export const TRAINING_UPLOAD_DIR = path.join(TRAINING_MEDIA_DIR, "uploaded");
export const TRAINING_LIBRARY_DIR = path.join(TRAINING_MEDIA_DIR, "library");
export const shouldMigrateLegacyTrainingMedia = !configuredTrainingMediaDir || path.resolve(configuredTrainingMediaDir) === path.resolve(legacyTrainingMediaDir);

export const storageFolders = {
  product: "vibe-product",
  component: "component-spec",
  sop: "standard-sop",
  skill: "skill-center",
  font: "font-library",
  prompt: "prompt-library",
  training: "training",
  testEnvironment: "test-environments",
  uploads: "uploads"
} as const;

export function resolveDataPath(storedPath: string) {
  return path.isAbsolute(storedPath) ? storedPath : path.join(DATA_DIR, storedPath);
}
