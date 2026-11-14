import { resolve, sep } from "node:path";
import { watch } from "node:fs";
import { buildWeb } from "./build-web.js";

const preview = Bun.argv.includes("--preview");
const root = preview ? resolve("dist") : await buildWeb(true);
if (!await Bun.file(resolve(root, "index.html")).exists()) throw new Error("Cannot find the web app. Run bun run build, then bun run preview.");
const server = Bun.serve({ hostname: "127.0.0.1", port: preview ? 4173 : 3000, async fetch(request) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return new Response("Invalid address", { status: 400 }); }
  const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(root + sep)) return new Response(null, { status: 403 });
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : file, { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
} });
console.log(`Shravanam: ${server.url}`);
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
