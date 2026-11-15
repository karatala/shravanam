import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createWindowState } from "../desktop/window-state.js";

const primary = { name: "Retina", position: { x: 0, y: 0 }, size: { width: 2880, height: 1800 }, scaleFactor: 2 };
const left = { name: "External", position: { x: -1920, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
async function profile() { await mkdir(resolve("tmp"), { recursive: true }); return mkdtemp(join(resolve("tmp"), "window-state-")); }
function fakeWindow(bounds = { x: 1000, y: 400, width: 900, height: 700 }) {
  return {
    bounds: { ...bounds }, monitors: [primary, left], primary, visible: true, minimized: false, maximized: false, fullscreen: null, simple: false, disposed: false, calls: [],
    isDisposed() { return this.disposed; }, isVisible() { return this.visible; }, isMinimized() { return this.minimized; }, isMaximized() { return this.maximized; }, simpleFullscreen() { return this.simple; },
    getPosition(logical) { expect(logical).toBe(false); return { x: this.bounds.x, y: this.bounds.y }; },
    getInnerSize(logical) { expect(logical).toBe(true); return { width: this.bounds.width, height: this.bounds.height }; },
    getAvailableMonitors() { return this.monitors; }, getPrimaryMonitor() { return this.primary; },
    setSize(width, height, logical) { this.calls.push(["size", width, height, logical]); this.bounds.width = width; this.bounds.height = height; },
    setPosition(physicalX, physicalY, logical) { this.calls.push(["position", physicalX, physicalY, logical]); this.bounds.x = physicalX; this.bounds.y = physicalY; },
    setMaximized(value) { this.calls.push(["maximized", value]); this.maximized = value; },
  };
}

test("window geometry survives restart with physical position and logical size, without Space IDs", async () => {
  const directory = await profile();
  const store = await createWindowState(directory);
  const window = fakeWindow();
  expect(await store.flush(window)).toBe(true);
  const saved = JSON.parse(await readFile(join(directory, "window.json"), "utf8"));
  expect(saved).toEqual({ version: 1, normal: window.bounds, maximized: false });
  const reopened = fakeWindow({ x: 0, y: 0, width: 100, height: 100 });
  reopened.visible = false;
  expect((await createWindowState(directory)).restore(reopened)).toBe(true);
  expect(reopened.bounds).toEqual(window.bounds);
  expect(reopened.calls).toEqual([["size", 900, 700, true], ["position", 1000, 400, false]]);
});

test("negative monitor positions are retained and a removed monitor falls back to the primary display", async () => {
  const directory = await profile();
  const store = await createWindowState(directory);
  const window = fakeWindow({ x: -1800, y: 50, width: 900, height: 700 });
  await store.flush(window);
  const present = fakeWindow();
  store.restore(present);
  expect(present.bounds).toEqual(window.bounds);
  const removed = fakeWindow();
  removed.monitors = [primary];
  store.restore(removed);
  expect(removed.bounds).toEqual({ x: 0, y: 50, width: 900, height: 700 });
});

test("oversized and off-screen saved windows fit the available physical monitor at its scale", async () => {
  const directory = await profile();
  await writeFile(join(directory, "window.json"), JSON.stringify({ version: 1, normal: { x: 9000, y: 5000, width: 4000, height: 3000 }, maximized: false }));
  const window = fakeWindow();
  window.monitors = [primary];
  expect((await createWindowState(directory)).restore(window)).toBe(true);
  expect(window.bounds).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
});

test("maximized state preserves normal bounds; hidden, minimized, and fullscreen changes cannot replace them", async () => {
  const directory = await profile();
  const store = await createWindowState(directory);
  const window = fakeWindow();
  const normal = { ...window.bounds };
  await store.flush(window);
  window.maximized = true;
  window.bounds = { x: 0, y: 0, width: 1440, height: 900 };
  await store.flush(window);
  const maximized = await readFile(join(directory, "window.json"), "utf8");
  window.maximized = false;
  window.bounds = { x: 0, y: 0, width: 1, height: 1 };
  for (const state of [{ visible: false }, { minimized: true }, { fullscreen: 0 }, { simple: true }]) {
    Object.assign(window, { visible: true, minimized: false, fullscreen: null, simple: false }, state);
    await store.flush(window);
    expect(await readFile(join(directory, "window.json"), "utf8")).toBe(maximized);
  }
  const reopened = fakeWindow();
  (await createWindowState(directory)).restore(reopened);
  expect(reopened.bounds).toEqual(normal);
  expect(reopened.maximized).toBe(true);
});

test("window capture is deferred outside native dispatch and hidden background flush keeps the last bounds", async () => {
  const directory = await profile();
  const store = await createWindowState(directory);
  const window = fakeWindow();
  let nativeDispatch = true;
  const original = window.getPosition;
  window.getPosition = function(logical) { expect(nativeDispatch).toBe(false); return original.call(this, logical); };
  store.schedule(window);
  const flushing = store.flush(window);
  nativeDispatch = false;
  await flushing;
  window.visible = false;
  window.bounds = { x: 0, y: 0, width: 0, height: 0 };
  await store.flush(window);
  const reopened = fakeWindow();
  store.restore(reopened);
  expect(reopened.bounds).toEqual({ x: 1000, y: 400, width: 900, height: 700 });
});

const permissionTest = process.platform === "win32" || process.getuid?.() === 0 ? test.skip : test;
permissionTest("a failed atomic window save keeps the old file and the latest in-memory bounds for retry", async () => {
  const directory = await profile();
  const store = await createWindowState(directory);
  const window = fakeWindow();
  await store.flush(window);
  const previous = await readFile(join(directory, "window.json"), "utf8");
  window.bounds.x = 700;
  await chmod(directory, 0o500);
  try {
    expect(await store.flush(window)).toBe(false);
    expect(await readFile(join(directory, "window.json"), "utf8")).toBe(previous);
    const retry = fakeWindow();
    store.restore(retry);
    expect(retry.bounds.x).toBe(700);
  } finally { await chmod(directory, 0o700); }
  expect(await store.flush(window)).toBe(true);
  expect(JSON.parse(await readFile(join(directory, "window.json"), "utf8")).normal.x).toBe(700);
});
