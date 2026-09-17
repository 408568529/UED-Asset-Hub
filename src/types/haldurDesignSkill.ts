export type HaldurDesignSkillNodeType = "directory" | "file";

export interface HaldurDesignSkillNodeMetadata {
  description?: string;
  tags?: string[];
  previewType?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface HaldurDesignSkillMetadataStore {
  schemaVersion: 1;
  entries: Record<string, HaldurDesignSkillNodeMetadata>;
}

export interface HaldurDesignSkillManifestEntry {
  relativePath: string;
  type: HaldurDesignSkillNodeType;
  size: number;
  modifiedAt: string;
  checksum?: string;
}

export interface HaldurDesignSkillNode extends HaldurDesignSkillManifestEntry {
  name: string;
  metadata?: HaldurDesignSkillNodeMetadata;
  children?: HaldurDesignSkillNode[];
}

export interface HaldurDesignSkillDiagnostic {
  code: "root-missing" | "root-unsafe" | "unsafe-entry" | "scan-failed" | "metadata-invalid" | "missing-skill-md";
  message: string;
  relativePath?: string;
}

export interface HaldurDesignSkillSnapshot {
  rootName: string;
  rootAvailable: boolean;
  generatedAt: string;
  revision: string | null;
  manifest: HaldurDesignSkillManifestEntry[];
  nodes: HaldurDesignSkillNode[];
  diagnostics: HaldurDesignSkillDiagnostic[];
  recoveryRequired?: boolean;
}

export type HaldurDirectoryOperationType = "create-directory" | "rename-directory" | "move-directory" | "delete-directory" | "upload-file" | "overwrite-file" | "rename-file" | "move-file" | "delete-file";
export type HaldurDirectoryJournalStatus = "prepared" | "mutating" | "verifying" | "metadata" | "committed" | "rollback" | "rolled-back" | "recovery-required";

export interface HaldurDirectoryJournal {
  operationId: string;
  operationType: HaldurDirectoryOperationType;
  sourceRelativePath?: string;
  targetRelativePath?: string;
  trashPath?: string;
  revisionBefore: string;
  revisionAfter?: string;
  operator: string;
  startedAt: string;
  completedAt?: string;
  status: HaldurDirectoryJournalStatus;
  rollbackResult?: "not-required" | "succeeded" | "failed";
  errorCode?: string;
  stagingPath?: string;
  backupPath?: string;
  payloadSize?: number;
  payloadHash?: string;
}

export interface HaldurDirectoryOperationResult {
  operationId: string;
  snapshot: HaldurDesignSkillSnapshot;
}
