import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createSourceScripts, parseSourceScript } from "../desktop/source-scripts.js";

const script = (code, extra = "") => `// ==UserScript==\n// @name Cleanup\n// @namespace shravanam-tests\n// @match https://*.youtube.com/*\n// @grant none\n${extra}// ==/UserScript==\n${code}`;
async function store() { await mkdir(resolve("tmp"), { recursive: true }); const profile = await mkdtemp(join(resolve("tmp"), "source-scripts-")); return { profile, scripts: await createSourceScripts(profile) }; }
function page(url) {
  const window = {};
  window.top = window; window.self = window;
  const listeners = {};
  const context = { window, location: new URL(url), document: { readyState: "loading", addEventListener(name, callback) { listeners[name] = callback; } }, console, setTimeout };
  return { context, ready() { context.document.readyState = "interactive"; listeners.DOMContentLoaded?.(); } };
}

test("userscripts match host boundaries and exclusions and wait for document readiness", async () => {
  const { scripts } = await store();
  await scripts.import([{ name: "cleanup.user.js", source: script("window.executed = (window.executed || 0) + 1;", "// @exclude-match https://www.youtube.com/shorts/*\n") }]);
  const accepted = page("https://www.youtube.com/watch?v=example");
  runInNewContext(scripts.preload(), accepted.context);
  expect(accepted.context.window.executed).toBeUndefined();
  accepted.ready();
  expect(accepted.context.window.executed).toBe(1);
  for (const url of ["https://www.youtube.com/shorts/example", "https://www.youtube.com.evil.test/watch", "http://www.youtube.com/watch"]) {
    const rejected = page(url);
    runInNewContext(scripts.preload(), rejected.context); rejected.ready();
    expect(rejected.context.window.executed).toBeUndefined();
  }
});

test("script updates replace the same namespace and name; disabled scripts stay out of preload", async () => {
  const { scripts } = await store();
  await scripts.import([{ name: "cleanup.user.js", source: script("window.version = 1;", "// @run-at document-start\n") }]);
  const id = scripts.snapshot()[0].id;
  await scripts.import([{ name: "cleanup.user.js", source: script("window.version = 2;", "// @run-at document-start\n") }]);
  expect(scripts.snapshot()).toHaveLength(1);
  expect(scripts.snapshot()[0].id).toBe(id);
  const selected = page("https://youtube.com/");
  runInNewContext(scripts.preload(), selected.context);
  expect(selected.context.window.version).toBe(2);
  await scripts.toggle(id, false);
  expect(scripts.preload()).toBe("");
});

test("invalid or privileged scripts are rejected before they execute or replace saved scripts", async () => {
  const { scripts, profile } = await store();
  await scripts.import([{ name: "cleanup.user.js", source: script("window.valid = true;") }]);
  const original = scripts.read(scripts.snapshot()[0].id).source;
  const saved = await readFile(join(profile, "source-scripts.json"), "utf8");
  for (const source of ["globalThis.shouldNotRun = true;", script("(") , script("globalThis.shouldNotRun = true;", "// @grant GM_xmlhttpRequest\n"), script("", "// @require https://example.com/code.js\n")]) {
    await expect(scripts.import([{ name: "bad.user.js", source }])).rejects.toThrow();
  }
  expect(globalThis.shouldNotRun).toBeUndefined();
  expect(scripts.read(scripts.snapshot()[0].id).source).toBe(original);
  expect(await readFile(join(profile, "source-scripts.json"), "utf8")).toBe(saved);
  expect(() => parseSourceScript(script("", "// @run-at invalid\n"), "bad.user.js")).toThrow("@run-at");
});
