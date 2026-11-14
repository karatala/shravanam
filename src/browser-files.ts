import { mediaExtensions } from "./playback";

export type BrowserFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};
export type BrowserMediaFile = { file: File; handle?: BrowserFileHandle };
type FilePicker = (options: { multiple: boolean; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<BrowserFileHandle[]>;

export async function pickBrowserFiles(): Promise<BrowserMediaFile[] | null> {
  const picker = (window as Window & { showOpenFilePicker?: FilePicker }).showOpenFilePicker;
  if (!picker) return null;
  const handles = await picker.call(window, { multiple: true, types: [{ description: "Audio / Video", accept: { "application/octet-stream": mediaExtensions.map(extension => `.${extension}`) } }] });
  return Promise.all(handles.map(async handle => ({ file: await handle.getFile(), handle })));
}

export async function droppedBrowserFiles(data: DataTransfer): Promise<BrowserMediaFile[]> {
  // Capture files and request handles in the drop event, before its data store closes.
  const requests = Array.from(data.items).filter(item => item.kind === "file").map(item => {
    const file = item.getAsFile();
    const entry = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<BrowserFileHandle | { kind: "directory" } | null> };
    const handle = entry.getAsFileSystemHandle?.().catch(() => null);
    return { file, handle };
  });
  if (!requests.length) return Array.from(data.files, file => ({ file }));
  const files = await Promise.all(requests.map(async entry => {
    const handle = await entry.handle;
    return entry.file ? { file: entry.file, ...(handle?.kind === "file" ? { handle } : {}) } : null;
  }));
  return files.filter((entry): entry is BrowserMediaFile => entry !== null);
}
