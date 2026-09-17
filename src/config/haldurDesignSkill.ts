import path from "node:path";

export class HaldurDesignSkillConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HaldurDesignSkillConfigError";
  }
}

function configuredPath(name: "HALDUR_DESIGN_SKILL_ROOT" | "HALDUR_DESIGN_SKILL_RUNTIME_ROOT") {
  const value = process.env[name]?.trim();
  if (!value) throw new HaldurDesignSkillConfigError(`缺少 ${name}。`);
  const resolved = path.resolve(value);
  const projectRoot = path.resolve(process.cwd());
  const relative = path.relative(projectRoot, resolved);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new HaldurDesignSkillConfigError(`${name} 不允许位于 Git 代码目录内。`);
  }
  return resolved;
}

export function getHaldurDesignSkillConfig() {
  const root = configuredPath("HALDUR_DESIGN_SKILL_ROOT");
  const runtimeRoot = configuredPath("HALDUR_DESIGN_SKILL_RUNTIME_ROOT");
  const relative = path.relative(root, runtimeRoot);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new HaldurDesignSkillConfigError("HALDUR_DESIGN_SKILL_RUNTIME_ROOT 不允许位于 HALDUR_DESIGN_SKILL_ROOT 内。");
  }
  const inverse = path.relative(runtimeRoot, root);
  if (inverse === "" || (!inverse.startsWith(`..${path.sep}`) && inverse !== ".." && !path.isAbsolute(inverse))) {
    throw new HaldurDesignSkillConfigError("HALDUR_DESIGN_SKILL_ROOT 不允许位于 HALDUR_DESIGN_SKILL_RUNTIME_ROOT 内。");
  }
  return { root, runtimeRoot, rootName: "Haldur-Design-Skill" };
}
