import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { androidDevPort, androidDevUrls, resolveAndroidDevUrl } from "../scripts/android-dev.js";

test.each([
  ["http://192.168.1.20:3001", "http://192.168.1.20:3001"],
  ["http://10.0.2.2:3001/", "http://10.0.2.2:3001"],
  ["http://172.16.0.1:3001", "http://172.16.0.1:3001"],
  ["http://172.31.255.254:3001", "http://172.31.255.254:3001"],
  ["http://127.0.0.1:3001", "http://127.0.0.1:3001"],
  ["  HTTP://LOCALHOST:3001/  ", "http://localhost:3001"],
])("Android development accepts local URL %s", (value, expected) => {
  expect(resolveAndroidDevUrl(value)).toBe(expected);
});

test.each([
  "https://192.168.1.20:3001", "http://192.168.1.20:3000", "http://192.168.1.20", "http://8.8.8.8:3001",
  "http://172.15.0.1:3001", "http://172.32.0.1:3001", "http://example.com:3001", "http://0.0.0.0:3001",
  "http://user:password@192.168.1.20:3001", "http://192.168.1.20:3001/app", "http://192.168.1.20:3001/?debug",
  "http://192.168.1.20:3001/#debug", "http://192.168.999.1:3001", "http://[::1]:3001", "",
])("Android development rejects unsafe or unsupported URL %s", value => {
  expect(() => resolveAndroidDevUrl(value)).toThrow("Cannot use Android development URL");
});

async function waitFor(read, accepts, description) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { const value = await read(); if (accepts(value)) return value; } catch { }
    await Bun.sleep(30);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

test("Android LAN server serves only UI and publishes reload revisions after successful builds", async () => {
  const origin = `http://127.0.0.1:${androidDevPort}`;
  let occupied = false;
  try { await fetch(origin, { signal: AbortSignal.timeout(300) }); occupied = true; } catch { }
  if (occupied) throw new Error(`Stop the existing server on port ${androidDevPort} before running this test.`);
  await mkdir(resolve("tmp"), { recursive: true });
  const fixture = await mkdtemp(join(resolve("tmp"), "android-server-"));
  for (const directory of ["scripts", "desktop", "src", "public"]) await mkdir(join(fixture, directory));
  for (const filename of ["serve.js", "android-reload.js", "android-dev.js"]) await copyFile(resolve("scripts", filename), join(fixture, "scripts", filename));
  await Bun.write(join(fixture, "index.html"), "<head></head><body>fixture</body>");
  await Bun.write(join(fixture, "src/state.txt"), "ready");
  await Bun.write(join(fixture, "desktop/browser-host.js"), 'export function createBrowserHost() { throw new Error("Desktop playback must not start in Android LAN mode"); }');
  await Bun.write(join(fixture, "scripts/build-web.js"), `
    import { mkdir } from "node:fs/promises";
    import { resolve } from "node:path";
    export async function buildWeb(development, directory) {
      if ((await Bun.file("src/state.txt").text()).trim() === "fail") throw new Error("fixture build failure");
      const root = resolve(directory);
      await mkdir(root, { recursive: true });
      await Bun.write(resolve(root, "index.html"), "<head></head><body>fixture</body>");
      await Bun.write(resolve(root, "main.js.map"), JSON.stringify({ version: 3, sources: ["src/main.ts"], sourcesContent: ["export const ready = true;"], mappings: "" }));
      await Bun.write(resolve(root, "asset-list.json"), JSON.stringify(["index.html", "main.js.map"]));
      return root;
    }
  `);
  const child = Bun.spawn([process.execPath, "scripts/serve.js", "--android"], { cwd: fixture, stdout: "pipe", stderr: "pipe" });
  let output = "";
  const drain = async stream => { for await (const chunk of stream) output += new TextDecoder().decode(chunk); };
  const streams = Promise.all([drain(child.stdout), drain(child.stderr)]);
  const getRevision = async () => { const response = await fetch(`${origin}/__dev/revision`); if (!response.ok) throw new Error("Server is not ready"); return response.text(); };
  try {
    const initialRevision = await waitFor(getRevision, value => value.includes(":"), "Android server startup");
    const response = await fetch(origin);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain("/__dev/reload.js?revision=");
    expect(html).not.toContain("shravanamBunHost");
    expect(html).not.toContain("token");
    const lanUrl = androidDevUrls()[0];
    if (lanUrl) expect((await fetch(lanUrl)).status).toBe(200);
    const head = await fetch(origin, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await (await fetch(`${origin}/main.js.map`)).json()).sources).toEqual(["src/main.ts"]);
    const reload = await fetch(`${origin}/__dev/reload.js`);
    expect(reload.status).toBe(200);
    expect(reload.headers.get("content-type")).toContain("javascript");
    for (const path of ["/__player", "/__sources"]) expect((await fetch(`${origin}${path}`)).status).toBe(404);
    expect((await fetch(`${origin}/__dev/revision`, { method: "POST", body: "{}" })).status).toBe(405);
    expect((await fetch(origin, { headers: { Host: `foreign.example:${androidDevPort}` } })).status).toBe(403);

    await Bun.write(join(fixture, "src/state.txt"), "updated");
    const updatedRevision = await waitFor(getRevision, value => value !== initialRevision, "successful rebuild revision");
    await Bun.write(join(fixture, "src/state.txt"), "fail");
    await waitFor(() => output, value => value.includes("fixture build failure"), "failed rebuild report");
    expect(await getRevision()).toBe(updatedRevision);
    expect((await fetch(origin)).status).toBe(200);
    await Bun.write(join(fixture, "src/state.txt"), "recovered");
    await waitFor(getRevision, value => value !== updatedRevision, "recovery after failed rebuild");
  } finally {
    child.kill();
    await child.exited;
    await streams;
  }
}, 20000);
