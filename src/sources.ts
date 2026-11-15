export type SourceScript = { id: string; name: string; matches: string[]; enabled: boolean };
export type DownloadItem = { id: string; url: string; name: string; audioOnly: boolean; quality: number; status: "downloading" | "ready" | "interrupted" | "failed"; percent: number; error?: string };
export type SourceState = { browser: { open: boolean; url: string; title: string }; scripts: SourceScript[]; downloads: DownloadItem[]; script?: { id: string; name: string; source: string } };
export type SourceCommand = { type: "open-browser" | "close-browser" | "back" | "forward" | "reload" } | { type: "navigate"; address: string } | { type: "play"; audioOnly: boolean } | { type: "download"; url: string; audioOnly: boolean; quality: number } | { type: "open-download" | "cancel-download" | "retry-download" | "read-script"; id: string } | { type: "import-script"; name: string; source: string; id?: string } | { type: "toggle-script"; id: string; enabled: boolean };
export type SourceBridge = { getState: () => Promise<SourceState>; command: (command: SourceCommand) => Promise<SourceState> };

export function validSourceCommand(command: SourceCommand): boolean {
  if (!command || typeof command !== "object" || Array.isArray(command)) return false;
  if (["open-browser", "close-browser", "back", "forward", "reload"].includes(command.type)) return true;
  if (command.type === "navigate") return typeof command.address === "string" && command.address.length > 0 && command.address.length <= 2048;
  if (command.type === "play") return typeof command.audioOnly === "boolean";
  if (command.type === "import-script") return typeof command.name === "string" && command.name.length <= 256 && command.name.endsWith(".js") && typeof command.source === "string" && command.source.length <= 128 * 1024 && (command.id === undefined || typeof command.id === "string" && /^[a-f0-9]{64}$/.test(command.id));
  if (command.type === "download") return typeof command.url === "string" && command.url.length <= 2048 && typeof command.audioOnly === "boolean" && [480, 720, 1080].includes(command.quality);
  if (["open-download", "cancel-download", "retry-download", "toggle-script", "read-script"].includes(command.type)) {
    if (!("id" in command) || typeof command.id !== "string" || !/^[a-f0-9]{64}$/.test(command.id)) return false;
    return command.type !== "toggle-script" || typeof command.enabled === "boolean";
  }
  return false;
}

export class SourceError extends Error {}

export function sourceFailure(error: unknown): string {
  if (error instanceof Error && error.message.includes(" / ")) return error.message;
  if (error && typeof error === "object" && "code" in error && error.code === "youtube-link") return "Cannot use this link. Select one YouTube video, for example https://www.youtube.com/watch?v=dQw4w9WgXcQ. / Не удалось использовать ссылку. Выберите отдельный ролик YouTube, например https://www.youtube.com/watch?v=dQw4w9WgXcQ.";
  if (error && typeof error === "object" && "code" in error && error.code === "missing-downloader") return "Cannot open YouTube: yt-dlp is missing. Install yt-dlp or update IINA, then retry. / Не удалось открыть YouTube: yt-dlp не найден. Установите yt-dlp или обновите IINA и повторите попытку.";
  if (error && typeof error === "object" && "code" in error && error.code === "youtube-live") return "This live stream is not supported yet. Select a recorded video. / Прямой эфир пока не поддерживается. Выберите записанный ролик.";
  return "Cannot use sources. Check the connection, free space and profile access, then restart Shravanam and retry. / Не удалось открыть источники. Проверьте подключение, свободное место и доступ к профилю, затем перезапустите Shravanam и повторите попытку.";
}

export function sourceAddress(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048) throw new SourceError('Enter a search or an HTTPS address, for example https://www.youtube.com/. / Введите запрос или HTTPS-адрес, например https://www.youtube.com/.');
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return `https://www.youtube.com/results?search_query=${encodeURIComponent(value)}`;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Show one actionable address error below. */ }
  throw new SourceError(`Cannot open «${value}». Use an HTTPS address, for example https://www.youtube.com/. / Не удалось открыть «${value}». Используйте HTTPS-адрес, например https://www.youtube.com/.`);
}
