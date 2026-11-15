import { DataError, MAX_BYTES, type Library } from "./data/model";
import { validLibraryCommand, type LibraryCommand } from "./library";

export type LibraryRequest = { type: "state" | "export" | "import" | "restore" | "sync-preview" | "sync-apply" | "sync-disconnect"; preferIncoming?: boolean; expected?: string; token?: string } | { type: "preview-import"; archive: string } | { type: "sync-configure"; url: string; username: string; password: string } | { type: "command"; command: LibraryCommand };
export type NativeLibraryState = { library: Library; mediaId: string | null; recovery: { createdAt: number; library: Library } | null; playlistId: string | null; webdav: { url: string; username: string; lastSync: number | null; connected: boolean; busy: boolean; preview: { added: number; conflicts: number; duplicates: number; devices: number; token: string } | null } };
export function validLibraryRequest(input: unknown): input is LibraryRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const request = input as LibraryRequest;
  const fields = (...allowed: string[]) => Object.keys(request).every(key => ["type", ...allowed].includes(key));
  if (request.type === "preview-import") return fields("archive") && typeof request.archive === "string" && new TextEncoder().encode(request.archive).length <= MAX_BYTES;
  if (request.type === "sync-configure") return fields("url", "username", "password") && typeof request.url === "string" && request.url.length <= 8192 && typeof request.username === "string" && request.username.length <= 1024 && typeof request.password === "string" && request.password.length <= 4096;
  if (request.type === "command") return fields("command") && validLibraryCommand(request.command);
  if (request.type === "restore") return fields("expected") && typeof request.expected === "string" && new TextEncoder().encode(request.expected).length <= MAX_BYTES;
  if (["import", "sync-apply"].includes(request.type)) return fields("preferIncoming", "token") && typeof request.token === "string" && /^[a-f0-9]{64}$/.test(request.token) && (request.preferIncoming === undefined || typeof request.preferIncoming === "boolean");
  return ["state", "export", "sync-preview", "sync-disconnect"].includes(request.type) && fields();
}
export function libraryFailure(error: unknown): string {
  if (error instanceof DataError) {
    if (error.code === "size") return "Use a Shravanam archive below 16 MiB and 20,000 records. / Выберите архив Shravanam размером до 16 МиБ и 20 000 записей.";
    if (error.code === "integrity") return "This archive is damaged. Export it again from the source device. / Архив повреждён. Экспортируйте его снова на исходном устройстве.";
    if (error.code === "storage") return "Cannot save library data. Check free space and folder permissions, then retry. / Не удалось сохранить библиотеку. Проверьте свободное место и права на папку, затем повторите попытку.";
    if (error.code === "changed") return "Library data changed. Refresh the preview and retry. / Библиотека изменилась. Обновите предпросмотр и повторите попытку.";
    return "Cannot read these library records. Use an unmodified Shravanam .json archive from a compatible app version. / Не удалось прочитать записи библиотеки. Выберите неизменённый архив Shravanam .json из совместимой версии приложения.";
  }
  return error instanceof Error && error.message.includes(" / ") ? error.message : "Cannot read or save library data. Check the connection and free space, then retry. / Не удалось прочитать или сохранить библиотеку. Проверьте соединение и свободное место, затем повторите попытку.";
}
export async function requestLibrary(request: LibraryRequest): Promise<any> {
  if (window.shravanamDesktopHost && window.shravanamDesktop) return window.shravanamDesktop.libraryRequest(request);
  const token = window.shravanamBunHost?.token;
  if (!token) throw new Error("Native library is unavailable. / Native-библиотека недоступна.");
  let response: Response;
  try { response = await fetch("/__player", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ method: "library", request }), cache: "no-store" }); }
  catch { throw new Error("Cannot connect to the library. Start bun run dev and reload. / Нет связи с библиотекой. Запустите bun run dev и обновите страницу."); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
