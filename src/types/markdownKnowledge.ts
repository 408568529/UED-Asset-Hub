export const markdownKnowledgeDocumentTypes = ["knowledge", "project", "micro-spec"] as const;

export const markdownKnowledgeSpecTopics = [
  { value: "layout", label: "布局" },
  { value: "navigation", label: "导航" },
  { value: "search-filter", label: "查询 / 筛选" },
  { value: "table", label: "表格" },
  { value: "form", label: "表单" },
  { value: "dialog", label: "弹窗" },
  { value: "feedback", label: "反馈" },
  { value: "status", label: "状态" },
  { value: "copywriting", label: "文案" },
  { value: "upload-download", label: "上传 / 下载" },
  { value: "permission", label: "权限" },
  { value: "i18n", label: "国际化" },
  { value: "other", label: "其他" }
] as const;

export const markdownKnowledgeRelatedScopes = [
  { value: "web-component-library", label: "WEB端组件库" },
  { value: "app-component-library", label: "APP端组件库" },
  { value: "global", label: "全局规范" },
  { value: "portal", label: "Portal" },
  { value: "retail-app", label: "零售App" }
] as const;

export type MarkdownKnowledgeDocumentType = (typeof markdownKnowledgeDocumentTypes)[number];
export type MarkdownKnowledgeSpecTopic = (typeof markdownKnowledgeSpecTopics)[number]["value"];
export type MarkdownKnowledgeRelatedScope = (typeof markdownKnowledgeRelatedScopes)[number]["value"];

interface MarkdownKnowledgeMetadataBase {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  contentFormat: "markdown";
  status: string;
  legacySource: string | null;
  legacyId: string | null;
}

export type MarkdownKnowledgeMetadata = MarkdownKnowledgeMetadataBase & (
  | {
      documentType: "micro-spec";
      specTopic: MarkdownKnowledgeSpecTopic;
      relatedScopes: MarkdownKnowledgeRelatedScope[];
    }
  | {
      documentType: "knowledge" | "project";
      specTopic?: MarkdownKnowledgeSpecTopic;
      relatedScopes?: MarkdownKnowledgeRelatedScope[];
    }
);

export interface MarkdownKnowledgeInput {
  title: string;
  documentType: MarkdownKnowledgeDocumentType;
  specTopic?: MarkdownKnowledgeSpecTopic;
  relatedScopes?: MarkdownKnowledgeRelatedScope[];
  description?: string;
  category?: string;
  tags?: string[];
  author?: string;
  status?: string;
  content: string;
}

export interface MarkdownKnowledgeImportInput extends Omit<MarkdownKnowledgeInput, "documentType"> {
  documentType: "micro-spec";
  fileName: string;
}

export interface MarkdownKnowledgeDocument {
  metadata: MarkdownKnowledgeMetadata;
  content: string | null;
}

export interface MarkdownKnowledgeDiagnostic {
  id?: string;
  code: "invalid-entry" | "missing-metadata" | "invalid-metadata" | "unsafe-path";
  message: string;
}

export interface MarkdownKnowledgeListResult {
  documents: MarkdownKnowledgeMetadata[];
  diagnostics: MarkdownKnowledgeDiagnostic[];
}
