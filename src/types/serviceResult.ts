export interface MutationResult<T> {
  data: T;
  warning?: string;
}

export interface DeleteResult {
  deleted: boolean;
  warning?: string;
}
