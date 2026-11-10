export type UploadSelection = { file: File; relativePath: string };

export function uploadRelativePath(value: string) {
  const parts = value.split("/");
  if (!value || parts.some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) throw new Error("上传路径无效，请重新选择文件夹。");
  return parts.join("/");
}

export function selectedFiles(files: FileList | File[]): UploadSelection[] {
  return Array.from(files).filter(file => file.name !== ".DS_Store").map(file => ({ file, relativePath: uploadRelativePath(file.webkitRelativePath || file.name) }));
}

// The destination Skill folder already exists in Hub; omit the selected wrapper.
export function selectedFolderContents(files: FileList | File[]): UploadSelection[] {
  return selectedFiles(files).map(item => {
    const separator = item.relativePath.indexOf("/");
    if (separator < 0) throw new Error("无法读取文件夹层级，请重新选择文件夹。");
    return { ...item, relativePath: uploadRelativePath(item.relativePath.slice(separator + 1)) };
  });
}

// Read every directory batch: Chromium may return only 100 entries per call.
async function readEntry(entry: FileSystemEntry, parent = ""): Promise<UploadSelection[]> {
  const relativePath = uploadRelativePath(parent + entry.name);
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return file.name === ".DS_Store" ? [] : [{ file, relativePath }];
  }
  if (!entry.isDirectory) throw new Error("无法读取拖入的项目，请使用选择文件夹。");
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: UploadSelection[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return files;
    for (const child of batch) files.push(...await readEntry(child, relativePath + "/"));
  }
}

export function droppedFiles(transfer: DataTransfer): Promise<UploadSelection[]> {
  // Capture entries synchronously while the browser's drop store is accessible.
  const entries = Array.from(transfer.items).filter(item => item.kind === "file").map(item => item.webkitGetAsEntry());
  if (entries.some(entry => entry === null)) return Promise.reject(new Error("浏览器无法读取拖入的目录，请使用选择文件夹。"));
  const singleFolder = entries.length === 1 && entries[0]!.isDirectory;
  return Promise.all(entries.map(entry => readEntry(entry!))).then(groups => {
    const files = groups.flat();
    // A single folder is a contents import, matching the folder picker.
    // Mixed files/folders keep their selected child directory structure.
    return singleFolder ? files.map(item => ({ ...item, relativePath: uploadRelativePath(item.relativePath.slice(item.relativePath.indexOf("/") + 1)) })) : files;
  });
}
