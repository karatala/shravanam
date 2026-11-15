import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as profiles from "../desktop/profile.js";
import { createBrowserHost } from "../desktop/browser-host.js";

test("source control requires the same loopback credentials and never executes imported JavaScript in Bun", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "source-host-"));
  const location = spyOn(profiles, "desktopProfile").mockReturnValue(profile);
  const origin = "http://127.0.0.1:3000";
  const host = createBrowserHost(origin);
  const request = (body, extra = {}) => new Request(`${origin}/__sources`, { method: "POST", headers: { Host: "127.0.0.1:3000", Origin: origin, "Content-Type": "application/json", Authorization: `Bearer ${host.token}`, ...extra }, body: JSON.stringify(body) });
  try {
    for (const headers of [{ Authorization: "Bearer invalid" }, { Origin: "https://example.com" }, { Host: "example.com" }]) expect((await host.handle(request({ method: "state" }, headers))).status).toBe(403);
    const imported = await host.handle(request({ method: "command", command: { type: "import-script", name: "local.user.js", source: "// ==UserScript==\n// @name Local\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nglobalThis.sourceHostMustNotExecute = true;" } }));
    expect(imported.status).toBe(200);
    expect((await imported.json()).scripts).toHaveLength(1);
    expect(globalThis.sourceHostMustNotExecute).toBeUndefined();
    expect((await host.handle(request({ method: "command", command: { type: "open-download", id: "../../private" } }))).status).toBe(400);
  } finally { await host.close(); location.mockRestore(); }
});
