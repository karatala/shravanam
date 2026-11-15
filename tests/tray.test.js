import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createDesktopTray } from "../desktop/tray.js";

function setup(fail = false) {
  const app = new EventEmitter();
  const nativeTray = { disposed: false, menu: null, tooltip: "", failMenu: false, isDisposed() { return this.disposed; }, dispose() { this.disposed = true; }, setTooltip(value) { this.tooltip = value; }, setMenu(value) { if (this.failMenu) throw new Error("Tray unavailable"); this.menu = value; } };
  const state = { items: [{ id: "book-one", name: "Book" }], currentId: "book-one", paused: true, loading: false, time: 50, duration: 60, backward: 17, forward: 43, error: null };
  const calls = { commands: [], open: 0, quit: 0, unavailable: 0 };
  app.whenReady = () => Promise.resolve();
  app.createTrayIcon = () => { if (fail) throw new Error("Tray unavailable"); return nativeTray; };
  const tray = createDesktopTray({ app, icon: Buffer.from([]), getPlaybackState: async () => state, command: async command => { calls.commands.push(command); if (command.type === "toggle") state.paused = !state.paused; if (command.type === "seek") state.time = command.time; return state; }, openWindow() { calls.open++; }, quit() { calls.quit++; }, onUnavailable() { calls.unavailable++; } });
  const click = async id => { app.emit("custom-menu-click", { customMenuEvent: { id } }); await new Promise(resolve => setImmediate(resolve)); };
  return { app, nativeTray, state, calls, tray, click };
}

test("desktop tray uses native commands and configured time jumps without a WebView", async () => {
  const { nativeTray, state, calls, tray, click } = setup();
  try {
    expect(await tray.ready("ru")).toBe(true);
    expect(tray.available()).toBe(true);
    expect(nativeTray.menu.items.find(item => item.id === "shravanam-toggle").label).toBe("Воспроизвести");
    expect(nativeTray.menu.items.find(item => item.id === "shravanam-back").label).toBe("Назад 17 сек");
    await click("shravanam-toggle");
    expect(state.paused).toBe(false);
    expect(nativeTray.menu.items.find(item => item.id === "shravanam-toggle").label).toBe("Пауза");
    await click("shravanam-back");
    await click("shravanam-forward");
    expect(calls.commands).toEqual([{ type: "toggle" }, { type: "seek", time: 33 }, { type: "seek", time: 60 }]);
    await click("shravanam-open");
    await click("other-app-quit");
    await click("shravanam-quit");
    expect(calls.open).toBe(1);
    expect(calls.quit).toBe(1);
  } finally { tray.dispose(); }
});

test("desktop background entry fails when tray creation fails and restores the window after tray failure", async () => {
  const unsupported = setup(true);
  try {
    expect(await unsupported.tray.ready()).toBe(false);
    expect(unsupported.tray.available()).toBe(false);
    expect(unsupported.calls.unavailable).toBe(1);
  } finally { unsupported.tray.dispose(); }
  const running = setup();
  try {
    expect(await running.tray.ready("en")).toBe(true);
    running.nativeTray.failMenu = true;
    expect(await running.tray.ready("ru")).toBe(false);
    expect(running.tray.available()).toBe(false);
    expect(running.nativeTray.disposed).toBe(true);
    expect(running.calls.unavailable).toBe(1);
  } finally { running.tray.dispose(); }
});

test("tray disposal removes native menu handlers and blocks late actions", async () => {
  const { app, nativeTray, calls, tray, click } = setup();
  await tray.ready(); tray.dispose(); tray.dispose();
  expect(app.listenerCount("custom-menu-click")).toBe(0);
  expect(nativeTray.disposed).toBe(true);
  expect(await tray.ready()).toBe(false);
  await click("shravanam-toggle");
  expect(calls.commands).toEqual([]);
});
