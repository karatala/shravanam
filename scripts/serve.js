import { resolve, sep } from "node:path";
import { watch } from "node:fs";
import { buildWeb } from "./build-web.js";
import { createBrowserHost } from "../desktop/browser-host.js";
import { androidDevPort, androidDevUrls } from "./android-dev.js";

const preview = Bun.argv.includes("--preview");
const android = Bun.argv.includes("--android");
if (android && (preview || Bun.argv.includes("--web"))) throw new Error("Cannot combine Android LAN mode with --web or --preview. Run bun run dev:android.");
const nativePlayback = !android && !preview && !Bun.argv.includes("--web");
const port = android ? androidDevPort : preview ? 4173 : 3000;
const origin = `http://127.0.0.1:${port}`;
const lanUrls = android ? androidDevUrls() : [];
const origins = new Set(android ? [origin, `http://localhost:${port}`, `http://10.0.2.2:${port}`, ...lanUrls] : [origin]);
const developmentDirectory = android ? "tmp/android-web" : "tmp/web";
const root = preview ? resolve("dist") : await buildWeb(true, developmentDirectory);
if (!await Bun.file(resolve(root, "index.html")).exists()) throw new Error("Cannot find the web app. Run bun run build, then bun run preview.");
const generation = Date.now();
let revision = 0;
const currentRevision = () => `${generation}:${revision}`;
let host;
const server = Bun.serve({ hostname: android ? "0.0.0.0" : "127.0.0.1", port, maxRequestBodySize: 34 * 1024 * 1024, async fetch(request) {
  const url = new URL(request.url);
  if (!origins.has(url.origin) || request.headers.get("host") !== url.host) return new Response(null, { status: 403 });
  if (["/__player", "/__sources"].includes(new URL(request.url).pathname) && host) return host.handle(request);
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  if (android && url.pathname === "/__dev/revision") return new Response(request.method === "HEAD" ? null : currentRevision(), { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  if (android && url.pathname === "/__dev/reload.js") return new Response(request.method === "HEAD" ? null : Bun.file(resolve("scripts/android-reload.js")), { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response("Invalid address", { status: 400 }); }
  const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(root + sep)) return new Response(null, { status: 403 });
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Not found", { status: 404 });
  let body = file;
  if (path === resolve(root, "index.html")) {
    const reloadRevision = currentRevision();
    if (host) body = (await file.text()).replace("<head>", `<head><script>window.shravanamBunHost=${JSON.stringify({ token: host.token })};window.shravanamSourceTools=${url.searchParams.get("tool") === "sources"};</script>`);
    else if (android) body = (await file.text()).replace("</head>", `<script type="module" src="/__dev/reload.js?revision=${encodeURIComponent(reloadRevision)}"></script></head>`);
  }
  return new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": file.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" } });
} });
if (nativePlayback) host = createBrowserHost(origin);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try { await host?.close(); }
  catch (error) { console.error("Cannot save local playback on shutdown", error); }
  finally { server.stop(true); process.exit(0); }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void shutdown(); });
process.once("exit", () => host?.terminate());
console.log(`Shravanam: ${server.url}`);
if (android) {
  console.log("Android LAN development. The installed Capacitor app owns playback. UI changes reload automatically after a successful build.");
  for (const url of lanUrls) console.log(`Phone URL: ${url}\nPrepare once: bun run prepare:android:dev --url ${url}`);
  if (!lanUrls.length) console.log("No private LAN IPv4 address found. Connect this computer and the phone to the same Wi-Fi, then restart this command.");
  console.log("Allow Bun through the firewall on your private network. Keep this terminal running while using the debug app.");
} else console.log(nativePlayback ? `Bun controls ${process.platform === "darwin" ? "mpv or installed IINA" : "mpv"}. Browser reload keeps audio running. Stop this terminal to stop the player.` : "Web/PWA playback. Files and permissions are managed by the browser.");
if (!preview) {
  let pendingBuild = Promise.resolve();
  let rebuildTimer;
  const rebuild = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      pendingBuild = pendingBuild.then(() => buildWeb(true, developmentDirectory)).then(() => { revision += 1; console.log(android ? "Application updated. Reloading connected Android interfaces." : "Application updated. Reload the browser."); }).catch(error => console.error(error));
    }, 80);
  };
  for (const directory of ["src", "public"]) watch(directory, { recursive: true }, rebuild);
  watch("index.html", rebuild);
}
