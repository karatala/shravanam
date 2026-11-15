import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "./media.js";
import { mediaExtensions } from "../src/playback.ts";
import { desktopProfile } from "./profile.js";
import { createSourceBrowser } from "./source-browser.js";
import { createDesktopTray } from "./tray.js";
import { libraryFailure, validLibraryRequest } from "../src/library-client.ts";

export async function runDesktop(assets) {
  const origin = "http://127.0.0.1:47870";
  const profile = desktopProfile();
  const sessionPath = join(profile, "open-session.json");
  const launchPaths = Bun.argv.slice(2).filter(argument => argument !== "--").map(path => resolve(path));
  async function forwardToRunningInstance() {
    try {
      const session = JSON.parse(await readFile(sessionPath, "utf8"));
      const response = await fetch(`${origin}/__open-media`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify(launchPaths), signal: AbortSignal.timeout(500) });
      return response.ok;
    } catch { return false; }
  }
  if (await forwardToRunningInstance()) return;
  const token = randomBytes(32).toString("hex");
  const pendingBatches = [launchPaths];
  let acceptPaths = paths => { pendingBatches.push(paths); };
  let focusWindow = () => {};
  let server;
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: 47870, maxRequestBodySize: 65536, async fetch(request) {
      const url = new URL(request.url);
      if (url.origin === origin && url.pathname === "/__open-media" && request.method === "POST") {
        if (request.headers.has("Origin") || request.headers.get("Authorization") !== `Bearer ${token}`) return new Response(null, { status: 403 });
        try {
          const paths = await request.json();
          if (!Array.isArray(paths) || paths.length > 256 || paths.some(path => typeof path !== "string" || path.length > 32768 || path.includes("\0"))) return new Response(null, { status: 400 });
          acceptPaths(paths);
          focusWindow();
          return new Response(null, { status: 202 });
        } catch { return new Response(null, { status: 400 }); }
      }
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 403 });
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const asset = assets[pathname];
      if (!asset) return new Response("Not found", { status: 404 });
      const file = Bun.file(asset);
      if (pathname === "/index.html") {
        const html = (await file.text()).replace("<head>", `<head><script>window.shravanamDesktopHost=true;window.shravanamSourceTools=${url.searchParams.get("tool") === "sources"};</script>`);
        return new Response(request.method === "HEAD" ? null : html, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
      }
      return new Response(request.method === "HEAD" ? null : file, { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
    } });
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (await forwardToRunningInstance()) return;
      }
    }
    throw new Error("Cannot start Shravanam on port 47870. Close another Shravanam window or the app using this port, then try again.", { cause: error });
  }
  try {
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await writeFile(sessionPath, JSON.stringify({ token }), { mode: 0o600 });
    const { Application } = await import("@webviewjs/webview");
    const app = new Application();
    const window = app.createBrowserWindow({ title: "Shravanam", width: 900, height: 700, decorations: false, resizable: true });
    const icon = await Bun.file(assets["/icons/icon-512.png"]).arrayBuffer();
    if (process.platform === "darwin") app.setDockIcon(Buffer.from(icon));
    else window.setWindowIcon(Buffer.from(icon));
    const mediaReady = createMediaPlayer(profile);
    const sourcesReady = mediaReady.then(media => createSourceBrowser({ profile, origin, media, getApplication: async () => app }));
    void sourcesReady.catch(() => {});
    let closing = false;
    let content = null;
    let backgroundTimer;
    let tray;
    function disposeContent() {
      const previous = content;
      content = null;
      if (!previous) return;
      try { previous.webview.dispose(); }
      finally { previous.context.dispose(); }
    }
    async function requestWindowClose() {
      if (closing) return null;
      closing = true;
      clearImmediate(backgroundTimer);
      tray?.dispose();
      try { await (await sourcesReady).close(); }
      catch (error) { console.error("Could not close sources", error); }
      try { await (await mediaReady).close(); }
      catch (error) { console.error("Could not save playback on close", error); }
      finally {
        try { disposeContent(); } catch (error) { console.error("Could not close the interface", error); }
        window.dispose(); server.stop(true); app.exit();
      }
      return null;
    }
    async function backgroundWindow(language) {
      if ((language !== undefined && !["en", "ru"].includes(language)) || closing || !await tray.ready(language)) throw new Error("Cannot run in the background: the system tray is unavailable. Keep the player window open or minimize it. / Фоновый режим недоступен: не удалось создать значок в трее. Оставьте окно плеера открытым или сверните его.");
      clearImmediate(backgroundTimer);
      backgroundTimer = setImmediate(() => {
        if (closing) return;
        if (!tray.available()) { focusWindow(); return; }
        window.hide();
        try { disposeContent(); }
        catch (error) { console.error("Could not unload the interface", error); focusWindow(); }
      });
      return null;
    }
    const desktopBridge = {
      minimizeWindow() { window.setMinimized(true); return null; },
      toggleMaximized() { window.setMaximized(!window.isMaximized()); return null; },
      requestWindowClose,
      backgroundWindow,
      async chooseMedia() {
        const paths = window.openFileDialog({ multiple: true, title: "Open media / Открыть файлы", filters: [{ name: "Audio / Video", extensions: mediaExtensions }] });
        const media = await mediaReady;
        return paths.length ? await media.openPaths(paths) : media.snapshot();
      },
      async getPlaybackState() { return (await mediaReady).snapshot(); },
      async playbackCommand(command) { return (await mediaReady).command(command); },
      async sleepCommand(command) { return (await mediaReady).sleepCommand(command); },
      async libraryRequest(request) {
        if (!validLibraryRequest(request)) throw new Error(libraryFailure(null));
        try { return await (await mediaReady).libraryRequest(request); } catch (error) { throw new Error(libraryFailure(error)); }
      },
    };
    function createContent() {
      if (content || closing) return;
      const context = app.createWebContext({ dataDirectory: join(profile, "webview") });
      let webview;
      try {
        const size = window.getInnerSize(true);
        webview = window.createWebview({ url: origin, child: true, x: 0, y: 0, width: size.width, height: size.height, webContext: context, nativeFileDrop: true, navigationHandler: url => { try { return new URL(url).origin === origin; } catch { return false; } }, newWindowHandler: () => false });
        const selected = { webview, context };
        content = selected;
        const publishDrag = active => { if (content === selected) webview.evaluateScript(`window.dispatchEvent(new CustomEvent('shravanam-file-drag', { detail: ${active} }))`); };
        webview.on("drag-enter", () => publishDrag(true));
        webview.on("drag-leave", () => publishDrag(false));
        webview.on("drag-drop", event => { publishDrag(false); acceptPaths(event.paths); });
        webview.expose("shravanamDesktop", desktopBridge);
        webview.expose("shravanamSources", { async getState() { return (await sourcesReady).bridge.getState(); }, async command(command) { return (await sourcesReady).bridge.command(command); } });
      } catch (error) {
        content = null;
        try { webview?.dispose(); } finally { context.dispose(); }
        throw error;
      }
    }
    focusWindow = () => {
      if (closing) return;
      clearImmediate(backgroundTimer);
      createContent();
      window.setMinimized(false); window.show(); window.focus();
    };
    window.on("resize", () => {
      if (!content) return;
      const size = window.getInnerSize(true);
      content.webview.setBounds({ x: 0, y: 0, width: size.width, height: size.height });
    });
    window.on("close", event => { event.preventDefault(); void requestWindowClose(); });
    acceptPaths = paths => { void mediaReady.then(media => media.openPaths(paths)).catch(error => console.error("Could not open media", error)); };
    tray = createDesktopTray({ app, icon: Buffer.from(icon), getPlaybackState: async () => (await mediaReady).snapshot(), command: async command => (await mediaReady).command(command), openWindow: focusWindow, quit: requestWindowClose, onUnavailable: () => { if (!closing && !content) focusWindow(); } });
    createContent();
    for (const paths of pendingBatches) if (paths.length) acceptPaths(paths);
    if (!pendingBatches.some(paths => paths.length)) void mediaReady.then(media => media.restoreLast()).catch(error => console.error("Could not restore last media", error));
    app.on("application-close-requested", () => { void requestWindowClose(); });
    const media = await mediaReady;
    let sources;
    void sourcesReady.then(value => { sources = value; }).catch(() => {});
    process.once("exit", () => { sources?.terminate(); media.terminate(); });
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void requestWindowClose().finally(() => process.exit(0)); });
    app.run();
  } catch (error) {
    server.stop(true);
    throw error;
  }
}

if (import.meta.main) {
  const manifest = Bun.file("dist/asset-list.json");
  if (!await manifest.exists()) throw new Error("Cannot find the desktop web assets. Run bun run build, then bun run desktop.");
  const files = await manifest.json();
  await runDesktop(Object.fromEntries(files.map(filename => [`/${filename}`, resolve("dist", filename)])));
}
