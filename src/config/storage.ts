import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const META_DIR = path.join(DATA_DIR, "meta");
export const TRAINING_MEDIA_DIR = process.env.TRAINING_MEDIA_DIR || path.join(DATA_DIR, "training-media");

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
