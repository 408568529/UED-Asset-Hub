import { promises as fs } from "node:fs";
import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { operationLogService } from "@/services/operationLogService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { Skill, SkillInput, SkillVersion } from "@/types/skill";

const SKILLS_FILE = "skills.json";
const VERSIONS_FILE = "skill-versions.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function sortSkills(a: Skill, b: Skill) {
  return +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

function sortVersions(a: SkillVersion, b: SkillVersion) {
  return +new Date(b.createdAt) - +new Date(a.createdAt);
}

function matchesKeyword(skill: Skill, keyword?: string) {
  if (!keyword) return true;
  const value = `${skill.name} ${skill.description} ${skill.category} ${skill.author} ${skill.tags.join(" ")}`.toLowerCase();
  return value.includes(keyword.toLowerCase());
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "Skill 操作已完成，但日志记录写入失败。";
  }
  return undefined;
}

export const skillService = {
  async getSkills(keyword?: string): Promise<Skill[]> {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    return skills.filter((skill) => matchesKeyword(skill, keyword)).sort(sortSkills);
  },

  async countSkills(): Promise<number> {
    return (await readJsonFile<Skill[]>(SKILLS_FILE, [])).length;
  },

  async getSkillById(id: string): Promise<Skill | null> {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    return skills.find((skill) => skill.id === id) ?? null;
  },

  async getSkillVersions(skillId: string): Promise<SkillVersion[]> {
    const versions = await readJsonFile<SkillVersion[]>(VERSIONS_FILE, []);
    return versions.filter((version) => version.skillId === skillId).sort(sortVersions);
  },

  async createSkill(input: SkillInput, packagePath: string, file: File, operator = "admin"): Promise<MutationResult<Skill>> {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const versions = await readJsonFile<SkillVersion[]>(VERSIONS_FILE, []);
    const now = new Date().toISOString();
    const skill: Skill = {
      id: createId(input.name),
      ...input,
      downloadCount: 0,
      packagePath,
      changeLog: input.changeLog || "上传新版本",
      createdAt: now,
      updatedAt: now
    };
    const version: SkillVersion = {
      id: `skill-version-${Date.now()}`,
      skillId: skill.id,
      version: skill.version,
      packagePath,
      fileName: file.name,
      fileSize: file.size,
      readme: skill.readme,
      changeLog: skill.changeLog,
      operator,
      createdAt: now,
      downloadCount: 0
    };
    await writeJsonFile(SKILLS_FILE, [skill, ...skills]);
    await writeJsonFile(VERSIONS_FILE, [version, ...versions]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "upload",
        title: `上传 Skill：${skill.name}`,
        description: `上传 Skill Center 资产「${skill.name}」${skill.version}`,
        targetType: "asset",
        targetId: skill.id,
        targetName: skill.name,
        operator,
        diffSummary: [`上传版本 ${skill.version}`, `文件名：${file.name}`, `文件大小：${file.size} bytes`]
      });
    });
    return { data: skill, warning };
  },

  async updateSkill(id: string, input: SkillInput, operator = "admin"): Promise<MutationResult<Skill> | null> {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const index = skills.findIndex((skill) => skill.id === id);
    if (index < 0) return null;
    const skill = { ...skills[index], ...input, updatedAt: new Date().toISOString() };
    skills[index] = skill;
    await writeJsonFile(SKILLS_FILE, skills);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "update",
        title: `编辑 Skill：${skill.name}`,
        description: `编辑 Skill Center 资产「${skill.name}」`,
        targetType: "asset",
        targetId: skill.id,
        targetName: skill.name,
        operator,
        diffSummary: ["Skill 元数据已更新"]
      });
    });
    return { data: skill, warning };
  },

  async addVersion(skillId: string, versionName: string, packagePath: string, file: File, changeLog: string, readme: string, operator = "admin") {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const versions = await readJsonFile<SkillVersion[]>(VERSIONS_FILE, []);
    const index = skills.findIndex((skill) => skill.id === skillId);
    if (index < 0) return null;
    const now = new Date().toISOString();
    const skill = {
      ...skills[index],
      version: versionName,
      packagePath,
      readme: readme || skills[index].readme,
      changeLog: changeLog || "上传新版本",
      updatedAt: now
    };
    const version: SkillVersion = {
      id: `skill-version-${Date.now()}`,
      skillId,
      version: versionName,
      packagePath,
      fileName: file.name,
      fileSize: file.size,
      readme: skill.readme,
      changeLog: skill.changeLog,
      operator,
      createdAt: now,
      downloadCount: 0
    };
    skills[index] = skill;
    await writeJsonFile(SKILLS_FILE, skills);
    await writeJsonFile(VERSIONS_FILE, [version, ...versions]);
    await captureWarning(async () => {
      await operationLogService.createLog({
        type: "version",
        title: `更新 Skill 版本：${skill.name} ${versionName}`,
        description: `上传 Skill 新版本 ${versionName}`,
        targetType: "version",
        targetId: version.id,
        targetName: skill.name,
        operator,
        diffSummary: [skill.changeLog]
      });
    });
    return version;
  },

  async overwriteCurrentVersion(skillId: string, versionName: string, packagePath: string, file: File, changeLog: string, readme: string, operator = "admin") {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const versions = await readJsonFile<SkillVersion[]>(VERSIONS_FILE, []);
    const index = skills.findIndex((skill) => skill.id === skillId);
    if (index < 0) return null;
    const now = new Date().toISOString();
    const currentVersion = skills[index].version;
    const skillVersions = versions.filter((version) => version.skillId === skillId).sort(sortVersions);
    const target = skillVersions.find((version) => version.version === currentVersion) ?? skillVersions[0];
    const skill = {
      ...skills[index],
      version: versionName,
      packagePath,
      readme: readme || skills[index].readme,
      changeLog: changeLog || "覆盖上传当前版本",
      updatedAt: now
    };
    skills[index] = skill;

    if (target) {
      const versionIndex = versions.findIndex((version) => version.id === target.id);
      versions[versionIndex] = {
        ...target,
        version: versionName,
        packagePath,
        fileName: file.name,
        fileSize: file.size,
        readme: skill.readme,
        changeLog: skill.changeLog,
        operator
      };
      await writeJsonFile(VERSIONS_FILE, versions);
    } else {
      const version: SkillVersion = {
        id: `skill-version-${Date.now()}`,
        skillId,
        version: versionName,
        packagePath,
        fileName: file.name,
        fileSize: file.size,
        readme: skill.readme,
        changeLog: skill.changeLog,
        operator,
        createdAt: now,
        downloadCount: 0
      };
      await writeJsonFile(VERSIONS_FILE, [version, ...versions]);
    }

    await writeJsonFile(SKILLS_FILE, skills);
    await captureWarning(async () => {
      await operationLogService.createLog({
        type: "update",
        title: `覆盖上传 Skill：${skill.name} ${versionName}`,
        description: `覆盖 Skill 当前版本包 ${versionName}`,
        targetType: "asset",
        targetId: skill.id,
        targetName: skill.name,
        operator,
        diffSummary: [skill.changeLog, `文件名：${file.name}`, `文件大小：${file.size} bytes`]
      });
    });
    return skill;
  },

  async incrementDownload(skillId: string, versionId?: string) {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const versions = await readJsonFile<SkillVersion[]>(VERSIONS_FILE, []);
    const skillIndex = skills.findIndex((skill) => skill.id === skillId);
    if (skillIndex >= 0) {
      skills[skillIndex] = { ...skills[skillIndex], downloadCount: skills[skillIndex].downloadCount + 1 };
      await writeJsonFile(SKILLS_FILE, skills);
    }
    if (versionId) {
      const versionIndex = versions.findIndex((version) => version.id === versionId);
      if (versionIndex >= 0) {
        versions[versionIndex] = { ...versions[versionIndex], downloadCount: versions[versionIndex].downloadCount + 1 };
        await writeJsonFile(VERSIONS_FILE, versions);
      }
    }
  },

  async deleteSkill(id: string, operator = "admin"): Promise<DeleteResult> {
    const skills = await readJsonFile<Skill[]>(SKILLS_FILE, []);
    const skill = skills.find((item) => item.id === id);
    const nextSkills = skills.filter((item) => item.id !== id);
    if (nextSkills.length === skills.length) return { deleted: false };
    await writeJsonFile(SKILLS_FILE, nextSkills);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "delete",
        title: `删除 Skill：${skill?.name ?? id}`,
        description: `删除 Skill Center 资产「${skill?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: skill?.name,
        operator,
        diffSummary: ["删除 Skill"]
      });
    });
    return { deleted: true, warning };
  },

  async readPackage(packagePath: string) {
    return fs.readFile(packagePath);
  }
};
