export function normalizeTrainingName(name: string) {
  return name.trim().replace(/\s+/g, "").toLocaleLowerCase();
}
