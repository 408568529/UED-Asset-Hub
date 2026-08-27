import { promises as fs } from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "@/config/storage";
import { markdownKnowledgeDocumentTypes, markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics, type MarkdownKnowledgeDiagnostic, type MarkdownKnowledgeDocument, type MarkdownKnowledgeListResult, type MarkdownKnowledgeMetadata } from "@/types/markdownKnowledge";

const documentIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export class MarkdownKnowledgePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownKnowledgePathError";
  }
}

export class MarkdownKnowledgeMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownKnowledgeMetadataError";
  }
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function assertMarkdownKnowledgeDocumentId(value: string) {
  if (typeof value !== "string" || !documentIdPattern.test(value)) {
    throw new MarkdownKnowledgePathError("Markdown Knowledge document-id 非法。");
  }
  if (path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("%")) {
    throw new MarkdownKnowledgePathError("Markdown Knowledge document-id 不允许使用绝对路径或编码路径。");
  }
  try {
    if (decodeURIComponent(value) !== value) throw new MarkdownKnowledgePathError("Markdown Knowledge document-id 不允许编码路径。");
  } catch (error) {
    if (error instanceof MarkdownKnowledgePathError) throw error;
    throw new MarkdownKnowledgePathError("Markdown Knowledge document-id 包含无效编码。");
  }
}

function documentDirectory(id: string) {
  assertMarkdownKnowledgeDocumentId(id);
  const root = path.resolve(KNOWLEDGE_DIR);
  const directory = path.resolve(root, id);
  if (!isInside(root, directory) || path.relative(root, directory) !== id) {
    throw new MarkdownKnowledgePathError("Markdown Knowledge 路径越界。");
  }
  return { root, directory };
}

async function knowledgeRootExists() {
  try {
    const stats = await fs.lstat(KNOWLEDGE_DIR);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new MarkdownKnowledgePathError("Knowledge Root 必须是非符号链接目录。");
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function existingDocumentDirectory(id: string) {
  const paths = documentDirectory(id);
  if (!(await knowledgeRootExists())) return null;
  try {
    const stats = await fs.lstat(paths.directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new MarkdownKnowledgePathError("Knowledge 文档目录不安全。");
    return paths;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function readRegularFile(filePath: string) {
  try {
    const stats = await fs.lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new MarkdownKnowledgePathError("Knowledge 文件不安全。");
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function parseMarkdownKnowledgeMetadata(value: unknown, expectedId: string): MarkdownKnowledgeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MarkdownKnowledgeMetadataError("metadata.json 必须是对象。");
  const metadata = value as Record<string, unknown>;
  const validDocumentType = markdownKnowledgeDocumentTypes.includes(metadata.documentType as MarkdownKnowledgeMetadata["documentType"]);
  const validMicroSpec = metadata.documentType !== "micro-spec" || (
    markdownKnowledgeSpecTopics.some((topic) => topic.value === metadata.specTopic)
    && Array.isArray(metadata.relatedScopes)
    && metadata.relatedScopes.length > 0
    && metadata.relatedScopes.every((scope) => markdownKnowledgeRelatedScopes.some((option) => option.value === scope))
  );
  const valid = metadata.schemaVersion === 1
    && metadata.id === expectedId
    && isNonEmptyString(metadata.title)
    && validDocumentType
    && validMicroSpec
    && typeof metadata.description === "string"
    && typeof metadata.category === "string"
    && Array.isArray(metadata.tags) && metadata.tags.every((tag) => typeof tag === "string")
    && isNonEmptyString(metadata.author)
    && isIsoDate(metadata.createdAt)
    && isIsoDate(metadata.updatedAt)
    && metadata.contentFormat === "markdown"
    && isNonEmptyString(metadata.status)
    && (metadata.legacySource === null || typeof metadata.legacySource === "string")
    && (metadata.legacyId === null || typeof metadata.legacyId === "string");
  if (!valid) throw new MarkdownKnowledgeMetadataError("metadata.json 不符合 Markdown Knowledge Schema。");
  return metadata as unknown as MarkdownKnowledgeMetadata;
}

async function readMetadataFromDirectory(id: string, directory: string) {
  const content = await readRegularFile(path.join(directory, "metadata.json"));
  if (content === null) return null;
  try {
    return parseMarkdownKnowledgeMetadata(JSON.parse(content), id);
  } catch (error) {
    if (error instanceof MarkdownKnowledgeMetadataError) throw error;
    throw new MarkdownKnowledgeMetadataError("metadata.json 不是有效 JSON。");
  }
}

export const markdownKnowledgeService = {
  async list(): Promise<MarkdownKnowledgeListResult> {
    if (!(await knowledgeRootExists())) return { documents: [], diagnostics: [] };
    const entries = await fs.readdir(KNOWLEDGE_DIR, { withFileTypes: true });
    const documents: MarkdownKnowledgeMetadata[] = [];
    const diagnostics: MarkdownKnowledgeDiagnostic[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        diagnostics.push({ code: "invalid-entry", message: `已跳过不安全 Knowledge 条目：${entry.name}` });
        continue;
      }
      try {
        assertMarkdownKnowledgeDocumentId(entry.name);
        const metadata = await readMetadataFromDirectory(entry.name, path.join(KNOWLEDGE_DIR, entry.name));
        if (!metadata) {
          diagnostics.push({ id: entry.name, code: "missing-metadata", message: "缺少 metadata.json。" });
          continue;
        }
        documents.push(metadata);
      } catch (error) {
        diagnostics.push({
          id: entry.name,
          code: error instanceof MarkdownKnowledgePathError ? "unsafe-path" : "invalid-metadata",
          message: error instanceof Error ? error.message : "无法读取 Knowledge 文档。"
        });
      }
    }

    return { documents, diagnostics };
  },

  async readMetadata(id: string): Promise<MarkdownKnowledgeMetadata | null> {
    const paths = await existingDocumentDirectory(id);
    return paths ? readMetadataFromDirectory(id, paths.directory) : null;
  },

  async readContent(id: string): Promise<string | null> {
    const paths = await existingDocumentDirectory(id);
    return paths ? readRegularFile(path.join(paths.directory, "content.md")) : null;
  },

  async getById(id: string): Promise<MarkdownKnowledgeDocument | null> {
    const metadata = await this.readMetadata(id);
    if (!metadata) return null;
    return { metadata, content: await this.readContent(id) };
  }
};
