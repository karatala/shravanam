import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "./media.js";
import { mediaExtensions } from "../src/playback.ts";

export async function runDesktop(assets) {
  const origin = "http://127.0.0.1:47870";
  const userRoot = process.platform === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : process.platform === "darwin" ? join(homedir(), "Library", "Application Support") : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const profile = join(userRoot, "Shravanam");
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
        const html = (await file.text()).replace("<head>", "<head><script>window.shravanamDesktopHost=true;</script>");
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
    focusWindow = () => { window.setMinimized(false); window.focus(); };
    const webContext = app.createWebContext({ dataDirectory: join(profile, "webview") });
    const webview = window.createWebview({ url: origin, webContext, nativeFileDrop: true, navigationHandler: url => new URL(url).origin === origin, newWindowHandler: () => false });
    const mediaReady = createMediaPlayer(profile);
    let closing = false;
    async function requestWindowClose() {
      if (closing) return null;
      closing = true;
      try { await (await mediaReady).close(); }
      catch (error) { console.error("Could not save playback on close", error); }
      finally { window.dispose(); server.stop(true); app.exit(); }
      return null;
    }
    window.on("close", event => { event.preventDefault(); void requestWindowClose(); });
    acceptPaths = paths => { void mediaReady.then(media => media.openPaths(paths)).catch(error => console.error("Could not open media", error)); };
    const publishDrag = active => webview.evaluateScript(`window.dispatchEvent(new CustomEvent('shravanam-file-drag', { detail: ${active} }))`);
    webview.on("drag-enter", () => publishDrag(true));
    webview.on("drag-leave", () => publishDrag(false));
    webview.on("drag-drop", event => { publishDrag(false); acceptPaths(event.paths); });
    webview.expose("shravanamDesktop", {
      minimizeWindow() { window.setMinimized(true); return null; },
      toggleMaximized() { window.setMaximized(!window.isMaximized()); return null; },
      requestWindowClose,
      async chooseMedia() {
        const paths = window.openFileDialog({ multiple: true, title: "Open media / Открыть файлы", filters: [{ name: "Audio / Video", extensions: mediaExtensions }] });
        const media = await mediaReady;
        return paths.length ? await media.openPaths(paths) : media.snapshot();
      },
      async getPlaybackState() { return (await mediaReady).snapshot(); },
      async playbackCommand(command) { return (await mediaReady).command(command); },
    });
    for (const paths of pendingBatches) if (paths.length) acceptPaths(paths);
    if (!pendingBatches.some(paths => paths.length)) void mediaReady.then(media => media.restoreLast()).catch(error => console.error("Could not restore last media", error));
    app.on("application-close-requested", () => { void requestWindowClose(); });
    const media = await mediaReady;
    process.once("exit", () => media.terminate());
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
