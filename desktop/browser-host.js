import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { desktopProfile } from "./profile.js";
import { createMediaPlayer } from "./media.js";
import { chooseSystemMedia } from "./system-file-picker.js";
import { validPlaybackCommand } from "../src/playback.ts";

export function createBrowserHost(origin) {
  const token = randomBytes(32).toString("hex");
  const profile = desktopProfile("Shravanam-dev");
  const mediaReady = mkdir(profile, { recursive: true, mode: 0o700 }).then(() => createMediaPlayer(profile));
  let mediaInstance;
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
    async close() { closing = true; pickerAbort.abort(); await (await mediaReady).close(); },
    terminate() { pickerAbort.abort(); mediaInstance?.terminate(); },
  };
}
