import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const META_DIR = path.join(DATA_DIR, "meta");
const legacyTrainingMediaDir = path.join(DATA_DIR, "training-media");
const configuredTrainingMediaDir = process.env.TRAINING_MEDIA_DIR;
// Keep manually managed training videos beside runtime data, not inside it.
export const TRAINING_MEDIA_DIR = configuredTrainingMediaDir && path.resolve(configuredTrainingMediaDir) !== path.resolve(legacyTrainingMediaDir)
  ? configuredTrainingMediaDir
  : path.join(path.dirname(DATA_DIR), "training-media");
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
