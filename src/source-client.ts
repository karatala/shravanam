import { sourceFailure, type SourceBridge, type SourceCommand, type SourceState } from "./sources";

export function sourceErrorText(error: unknown): string {
  const messages = sourceFailure(error).split(" / ");
  return document.documentElement.lang === "ru" ? messages[1] ?? messages[0] : messages[0];
}

export function sourceBridge(): SourceBridge | undefined {
  if (window.shravanamSources) return window.shravanamSources;
  const token = window.shravanamBunHost?.token;
  if (!token) return undefined;
  async function request(command?: SourceCommand): Promise<SourceState> {
    let response: Response;
    try { response = await fetch("/__sources", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(command ? { method: "command", command } : { method: "state" }), cache: "no-store" }); }
    catch { throw new Error("Cannot connect to sources. Restart bun run dev and reload the page. / Нет связи с источниками. Перезапустите bun run dev и обновите страницу."); }
    const body = await response.json().catch(() => ({ error: "Cannot import this script. Use a UTF-8 .js file under 128 KiB, for example cleanup.user.js. / Не удалось импортировать скрипт. Используйте UTF-8 файл .js размером до 128 КиБ, например cleanup.user.js." }));
    if (!response.ok) throw new Error(body.error ?? "Cannot open sources. Restart Shravanam and retry. / Не удалось открыть источники. Перезапустите Shravanam и повторите попытку.");
    return body;
  }
  return { getState: () => request(), command: command => request(command) };
}
