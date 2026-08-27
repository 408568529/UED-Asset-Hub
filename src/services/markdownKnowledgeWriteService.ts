import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "@/config/storage";
import { assertMarkdownKnowledgeDocumentId, markdownKnowledgeService, MarkdownKnowledgePathError, parseMarkdownKnowledgeMetadata } from "@/services/markdownKnowledgeService";
import { markdownKnowledgeDocumentTypes, markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics, type MarkdownKnowledgeDocument, type MarkdownKnowledgeImportInput, type MarkdownKnowledgeInput, type MarkdownKnowledgeMetadata, type MarkdownKnowledgeRelatedScope, type MarkdownKnowledgeSpecTopic } from "@/types/markdownKnowledge";

export class MarkdownKnowledgeWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownKnowledgeWriteError";
  }
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  const unique = new Map<string, string>();
  values.forEach((value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim().replace(/\s+/g, " ");
    const key = trimmed.toLocaleLowerCase();
    if (key && !unique.has(key)) unique.set(key, trimmed);
  });
  return [...unique.values()];
}

function validateInput(input: MarkdownKnowledgeInput) {
  if (!input || typeof input !== "object") throw new MarkdownKnowledgeWriteError("Knowledge 文档数据无效。");
  if (!markdownKnowledgeDocumentTypes.includes(input.documentType)) throw new MarkdownKnowledgeWriteError("文档类型无效。");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content : "";
  if (!title) throw new MarkdownKnowledgeWriteError("标题为必填项。");
  if (!content.trim()) throw new MarkdownKnowledgeWriteError("Markdown 正文为必填项。");

  const specTopic = input.specTopic;
  const relatedScopes = uniqueStrings(input.relatedScopes) as MarkdownKnowledgeRelatedScope[];
  if (input.documentType === "micro-spec") {
    if (!markdownKnowledgeSpecTopics.some((option) => option.value === specTopic)) {
      throw new MarkdownKnowledgeWriteError("微规范必须选择有效的规范主题。");
    }
    if (!relatedScopes.length || relatedScopes.some((scope) => !markdownKnowledgeRelatedScopes.some((option) => option.value === scope))) {
      throw new MarkdownKnowledgeWriteError("微规范必须至少选择一个有效的关联类目。");
    }
  }

  return {
    title,
    documentType: input.documentType,
    specTopic: specTopic as MarkdownKnowledgeSpecTopic | undefined,
    relatedScopes,
    description: typeof input.description === "string" ? input.description.trim() : "",
    category: typeof input.category === "string" ? input.category.trim() : "",
    tags: uniqueStrings(input.tags),
    author: typeof input.author === "string" && input.author.trim() ? input.author.trim() : "UED",
    status: typeof input.status === "string" && input.status.trim() ? input.status.trim() : "published",
    content
  };
}

async function ensureKnowledgeRoot() {
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  const stats = await fs.lstat(KNOWLEDGE_DIR);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new MarkdownKnowledgePathError("Knowledge Root 必须是非符号链接目录。");
}

function createMetadata(id: string, input: ReturnType<typeof validateInput>, createdAt: string, legacy?: Pick<MarkdownKnowledgeMetadata, "legacySource" | "legacyId">): MarkdownKnowledgeMetadata {
  const common = {
    schemaVersion: 1 as const,
    id,
    title: input.title,
    description: input.description,
    category: input.category,
    tags: input.tags,
    author: input.author,
    createdAt,
    updatedAt: new Date().toISOString(),
    contentFormat: "markdown" as const,
    status: input.status,
    legacySource: legacy?.legacySource ?? null,
    legacyId: legacy?.legacyId ?? null
  };
  return input.documentType === "micro-spec"
    ? { ...common, documentType: "micro-spec", specTopic: input.specTopic as MarkdownKnowledgeSpecTopic, relatedScopes: input.relatedScopes }
    : { ...common, documentType: input.documentType };
}

async function writePreparedDirectory(directory: string, metadata: MarkdownKnowledgeMetadata, content: string) {
  await fs.mkdir(directory, { mode: 0o700 });
  await Promise.all([
    fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", flag: "wx" }),
    fs.writeFile(path.join(directory, "content.md"), content, { encoding: "utf8", flag: "wx" })
  ]);
}

async function pathExists(target: string) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function generatedDocumentId(documentType: MarkdownKnowledgeInput["documentType"]) {
  return `${documentType}_${randomUUID().replaceAll("-", "")}`;
}

export function titleFromMarkdownFileName(fileName: string) {
  const baseName = path.basename(fileName.trim());
  if (!/\.md$/i.test(baseName)) throw new MarkdownKnowledgeWriteError("仅支持上传 .md 文件。");
  const title = baseName.replace(/\.md$/i, "");
  if (!title) throw new MarkdownKnowledgeWriteError("Markdown 文件名不能仅包含扩展名。");
  return title;
}

export const markdownKnowledgeWriteService = {
  async create(input: MarkdownKnowledgeInput): Promise<MarkdownKnowledgeDocument> {
    const normalized = validateInput(input);
    await ensureKnowledgeRoot();
    const id = generatedDocumentId(normalized.documentType);
    assertMarkdownKnowledgeDocumentId(id);
    const targetDirectory = path.join(KNOWLEDGE_DIR, id);
    const temporaryDirectory = path.join(KNOWLEDGE_DIR, `.tmp-${randomUUID()}`);
    const createdAt = new Date().toISOString();
    const metadata = createMetadata(id, normalized, createdAt);

    try {
      if (await pathExists(targetDirectory)) throw new MarkdownKnowledgeWriteError("生成的 Knowledge Document ID 已存在，请重试。");
      await writePreparedDirectory(temporaryDirectory, metadata, normalized.content);
      await fs.rename(temporaryDirectory, targetDirectory);
      return { metadata: parseMarkdownKnowledgeMetadata(metadata, id), content: normalized.content };
    } catch (error) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  },

  async importMarkdown(input: MarkdownKnowledgeImportInput): Promise<MarkdownKnowledgeDocument> {
    const defaultTitle = titleFromMarkdownFileName(input.fileName);
    return this.create({ ...input, title: input.title?.trim() || defaultTitle });
  },

  async update(id: string, input: MarkdownKnowledgeInput): Promise<MarkdownKnowledgeDocument | null> {
    assertMarkdownKnowledgeDocumentId(id);
    const current = await markdownKnowledgeService.getById(id);
    if (!current) return null;
    if (current.metadata.documentType !== input.documentType) throw new MarkdownKnowledgeWriteError("编辑时不允许改变文档类型。");

    const normalized = validateInput({
      ...input,
      author: input.author ?? current.metadata.author,
      status: input.status ?? current.metadata.status
    });
    await ensureKnowledgeRoot();
    const targetDirectory = path.join(KNOWLEDGE_DIR, id);
    const temporaryDirectory = path.join(KNOWLEDGE_DIR, `.tmp-${randomUUID()}`);
    const backupDirectory = path.join(KNOWLEDGE_DIR, `.backup-${randomUUID()}`);
    const metadata = createMetadata(id, normalized, current.metadata.createdAt, current.metadata);
    let movedOriginal = false;

    try {
      await writePreparedDirectory(temporaryDirectory, metadata, normalized.content);
      await fs.rename(targetDirectory, backupDirectory);
      movedOriginal = true;
      await fs.rename(temporaryDirectory, targetDirectory);
      movedOriginal = false;
      await fs.rm(backupDirectory, { recursive: true }).catch(() => undefined);
      return { metadata: parseMarkdownKnowledgeMetadata(metadata, id), content: normalized.content };
    } catch (error) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      if (movedOriginal && !(await pathExists(targetDirectory)) && await pathExists(backupDirectory)) {
        await fs.rename(backupDirectory, targetDirectory).catch(() => undefined);
      }
      throw error;
    }
  }
};
