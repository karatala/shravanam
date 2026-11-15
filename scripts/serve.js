import { resolve, sep } from "node:path";
import { watch } from "node:fs";
import { buildWeb } from "./build-web.js";
import { createBrowserHost } from "../desktop/browser-host.js";

const preview = Bun.argv.includes("--preview");
const nativePlayback = !preview && !Bun.argv.includes("--web");
const origin = `http://127.0.0.1:${preview ? 4173 : 3000}`;
const root = preview ? resolve("dist") : await buildWeb(true);
if (!await Bun.file(resolve(root, "index.html")).exists()) throw new Error("Cannot find the web app. Run bun run build, then bun run preview.");
let host;
const server = Bun.serve({ hostname: "127.0.0.1", port: preview ? 4173 : 3000, maxRequestBodySize: 34 * 1024 * 1024, async fetch(request) {
  if (new URL(request.url).origin !== origin || request.headers.get("host") !== new URL(origin).host) return new Response(null, { status: 403 });
  if (["/__player", "/__sources"].includes(new URL(request.url).pathname) && host) return host.handle(request);
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response("Invalid address", { status: 400 }); }
  const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(root + sep)) return new Response(null, { status: 403 });
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Not found", { status: 404 });
  const body = host && path === resolve(root, "index.html") ? (await file.text()).replace("<head>", `<head><script>window.shravanamBunHost=${JSON.stringify({ token: host.token })};window.shravanamSourceTools=${new URL(request.url).searchParams.get("tool") === "sources"};</script>`) : file;
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
console.log(nativePlayback ? "Bun controls mpv or installed IINA on macOS. Browser reload keeps audio running. Stop this terminal to stop the player." : "Web/PWA playback. Files and permissions are managed by the browser.");
if (!preview) {
  let pendingBuild = Promise.resolve();
  let rebuildTimer;
  const rebuild = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      pendingBuild = pendingBuild.then(() => buildWeb(true)).then(() => { console.log("Application updated. Reload the browser."); }).catch(error => console.error(error));
    }, 80);
  };
  for (const directory of ["src", "public"]) watch(directory, { recursive: true }, rebuild);
  watch("index.html", rebuild);
}
