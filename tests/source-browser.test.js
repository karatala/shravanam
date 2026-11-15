import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSourceBrowser } from "../desktop/source-browser.js";
import { sourceAddress, validSourceCommand } from "../src/sources.ts";

test("source address and command validation rejects privileged or oversized input", () => {
  expect(sourceAddress("music for sleep")).toBe("https://www.youtube.com/results?search_query=music%20for%20sleep");
  for (const address of ["http://localhost/", "file:///etc/passwd", "javascript:alert(1)", "https://user:pass@example.com/"]) expect(() => sourceAddress(address)).toThrow();
  expect(validSourceCommand({ type: "download", url: "https://youtu.be/dQw4w9WgXcQ", audioOnly: true, quality: 720 })).toBe(true);
  expect(validSourceCommand({ type: "download", url: "x", audioOnly: true, quality: 9999 })).toBe(false);
  expect(validSourceCommand({ type: "import-script", name: "script.js", source: "x".repeat(128 * 1024 + 1) })).toBe(false);
  expect(validSourceCommand({ type: "open-download", id: "../../private" })).toBe(false);
});

test("source pages use a separate context and receive no application bridge", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "source-browser-"));
  const views = [];
  const contexts = [];
  let disposed = false;
  let created = 0;
  let hidden = false;
  const window = { setMinSize() {}, setMinimized() {}, focus() {}, hide() { hidden = true; }, show() { hidden = false; }, getInnerSize: () => ({ width: 1000, height: 800 }), on() {}, dispose() { disposed = true; }, createWebview(options) {
    const view = { options, exposed: [], disposed: false, expose(name) { this.exposed.push(name); }, on() {}, url: () => options.url, loadUrl(url) { options.url = url; }, evaluateScript() {}, dispose() { this.disposed = true; } };
    views.push(view); return view;
  } };
  const app = { createBrowserWindow() { created++; return window; }, createWebContext(options) { const context = { ...options, disposed: false, dispose() { this.disposed = true; } }; contexts.push(context); return context; } };
  const commands = [];
  const sources = await createSourceBrowser({ profile, origin: "http://127.0.0.1:47870", media: { async command(command) { commands.push(command); return { error: null }; } }, getApplication: async () => app });
  try {
    await sources.bridge.command({ type: "open-browser" });
    expect(views).toHaveLength(2);
    expect(views[0].exposed).toEqual(["shravanamSources", "shravanamDesktop"]);
    expect(views[1].exposed).toEqual([]);
    expect(views[1].options.webContext).toBe(contexts[0]);
    expect(views[0].options.webContext).toBeUndefined();
    expect(views[0].options.navigationHandler("https://example.com")).toBe(false);
    expect(views[1].options.navigationHandler("file:///etc/passwd")).toBe(false);
    expect(views[1].options.navigationHandler("http://127.0.0.1:3000")).toBe(false);
    expect(views[1].options.newWindowHandler()).toBe(false);
    await sources.bridge.command({ type: "navigate", address: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42" });
    await sources.bridge.command({ type: "play", audioOnly: false });
    expect(commands).toEqual([{ type: "open-youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", audioOnly: false }]);
    await sources.bridge.command({ type: "close-browser" });
    expect(disposed).toBe(false);
    expect(hidden).toBe(true);
    expect(views.every(view => view.disposed)).toBe(true);
    expect(contexts[0].disposed).toBe(true);
    expect((await sources.bridge.getState()).browser.open).toBe(false);
    await sources.bridge.command({ type: "open-browser" });
    expect(created).toBe(1);
    expect(hidden).toBe(false);
    expect(views).toHaveLength(4);
  } finally { await sources.close(); }
});
