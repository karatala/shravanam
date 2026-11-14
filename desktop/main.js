import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export async function runDesktop(assets) {
  const { Application } = await import("@webviewjs/webview");
  const origin = "http://127.0.0.1:47870";
  const userRoot = process.platform === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : process.platform === "darwin" ? join(homedir(), "Library", "Application Support") : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const profile = join(userRoot, "Shravanam", "webview");
  let server;
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: 47870, async fetch(request) {
      const url = new URL(request.url);
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
    throw new Error("Cannot start Shravanam on port 47870. Close another Shravanam window or the app using this port, then try again.", { cause: error });
  }
  try {
    await mkdir(profile, { recursive: true });
    const app = new Application();
    const window = app.createBrowserWindow({ title: "Shravanam", width: 900, height: 700, decorations: false, resizable: true });
    const icon = await Bun.file(assets["/icons/icon-512.png"]).arrayBuffer();
    if (process.platform === "darwin") app.setDockIcon(Buffer.from(icon));
    else window.setWindowIcon(Buffer.from(icon));
    const webContext = app.createWebContext({ dataDirectory: profile });
    const webview = window.createWebview({ url: origin, webContext, navigationHandler: url => new URL(url).origin === origin, newWindowHandler: () => false });
    webview.expose("shravanamDesktop", {
      minimizeWindow() { window.setMinimized(true); return null; },
      toggleMaximized() { window.setMaximized(!window.isMaximized()); return null; },
      requestWindowClose() { window.dispose(); return null; },
    });
    app.on("application-close-requested", () => server.stop(true));
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
