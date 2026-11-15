import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { desktopProfile } from "./profile.js";
import { createMediaPlayer } from "./media.js";
import { chooseSystemMedia } from "./system-file-picker.js";
import { validPlaybackCommand } from "../src/playback.ts";
import { validSourceCommand, sourceFailure } from "../src/sources.ts";
import { createSourceBrowser } from "./source-browser.js";

export function createBrowserHost(origin) {
  const token = randomBytes(32).toString("hex");
  const profile = desktopProfile("Shravanam-dev");
  const mediaReady = mkdir(profile, { recursive: true, mode: 0o700 }).then(() => createMediaPlayer(profile));
  let mediaInstance;
  let application;
  let sourcesInstance;
  const sourcesReady = mediaReady.then(media => createSourceBrowser({ profile, origin, media, async getApplication() {
    if (!application) { const { Application } = await import("@webviewjs/webview"); application = new Application(); application.run(); }
    return application;
  } }));
  void sourcesReady.then(sources => { sourcesInstance = sources; }).catch(() => {});
  void mediaReady.then(media => { mediaInstance = media; return media.restoreLast(); }).catch(error => console.error("Cannot restore local player", error));
  const pickerAbort = new AbortController();
  let choosing = false;
  let closing = false;
  const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return {
    token,
    async handle(request) {
      if (closing) return json({ error: "host" }, 503);
      if (request.method !== "POST") return json({ error: "host" }, 405);
      if (new URL(request.url).origin !== origin || request.headers.get("host") !== new URL(origin).host || request.headers.get("origin") !== origin || request.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "host" }, 403);
      if (request.headers.get("content-type") !== "application/json") return json({ error: "host" }, 415);
      let body;
      try { body = await request.json(); } catch { return json({ error: "host" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "host" }, 400);
      if (new URL(request.url).pathname === "/__sources") {
        if (body.method !== "state" && !(body.method === "command" && validSourceCommand(body.command))) return json({ error: "Cannot use this source action. Reload the page and retry. For scripts, use a .js file under 128 KiB, for example cleanup.user.js. / Не удалось выполнить действие с источником. Обновите страницу и повторите попытку. Для скрипта используйте файл .js размером до 128 КиБ, например cleanup.user.js." }, 400);
        try { const sources = await sourcesReady; return json(await (body.method === "state" ? sources.bridge.getState() : sources.bridge.command(body.command))); }
        catch (error) { if (body.method === "command") console.error("Source command failed", error); return json({ error: sourceFailure(error) }, 500); }
      }
      try {
        const media = await mediaReady;
        if (body.method === "state") return json(media.snapshot());
        if (body.method === "command" && validPlaybackCommand(body.command)) return json(await media.command(body.command));
        if (body.method === "choose") {
          if (choosing) return json({ error: "picker" }, 409);
          choosing = true;
          try {
            const paths = await chooseSystemMedia(pickerAbort.signal);
            if (closing) return json({ error: "host" }, 503);
            return json(paths.length ? await media.openPaths(paths) : media.snapshot());
          } catch (error) { console.error("System file selection failed", error); return json({ error: "picker" }, 500); }
          finally { choosing = false; }
        }
        return json({ error: "host" }, 400);
      } catch (error) { console.error("Local player request failed", error); return json({ error: "host" }, 500); }
    },
    async close() {
      closing = true; pickerAbort.abort();
      try { await (await sourcesReady).close(); } finally { application?.exit(); await (await mediaReady).close(); }
    },
    terminate() { pickerAbort.abort(); sourcesInstance?.terminate(); mediaInstance?.terminate(); },
  };
}
