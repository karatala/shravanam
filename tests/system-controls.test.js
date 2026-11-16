import { expect, test } from "bun:test";
import { systemActionCommand, systemShortcut } from "../desktop/system-controls.js";

const state = { currentId: "book", loading: false, paused: false, time: 25, duration: 60, backward: 17, forward: 43 };

test("system media Play, Pause, and Stop use idempotent commands", () => {
  expect(systemActionCommand("play", state)).toEqual({ type: "pause", value: false });
  expect(systemActionCommand("pause", state)).toEqual({ type: "pause", value: true });
  expect(systemActionCommand("stop", state)).toEqual({ type: "pause", value: true });
  expect(systemActionCommand("toggle", state)).toEqual({ type: "toggle" });
  expect(systemActionCommand("play", { ...state, currentId: null })).toBeNull();
  expect(systemActionCommand("next", { ...state, loading: true })).toBeNull();
});

test("system next/previous and transport seeking use configured intervals and media limits", () => {
  expect(systemActionCommand("previous", state)).toEqual({ type: "seek", time: 8 });
  expect(systemActionCommand("next", state)).toEqual({ type: "seek", time: 60 });
  expect(systemActionCommand("back", { ...state, time: 5 })).toEqual({ type: "seek", time: 0 });
  expect(systemActionCommand({ action: "seek", position: 80 }, state)).toEqual({ type: "seek", time: 60 });
  expect(systemActionCommand({ action: "seek", position: -1 }, state)).toBeNull();
  expect(systemActionCommand({ action: "speed", value: 1.25 }, state)).toEqual({ type: "speed", value: 1.25 });
  expect(systemActionCommand({ action: "speed", value: 20 }, state)).toBeNull();
});

test("global shortcuts require explicit modifiers, known keys, and supported actions", () => {
  expect(systemShortcut({ action: "toggle", key: "Ctrl+Alt+Space" })).toEqual({ action: "toggle", key: "Ctrl+Alt+Space", modifiers: 3, virtualKey: 32 });
  expect(systemShortcut({ action: "open", key: "Ctrl+Alt+Home" }).virtualKey).toBe(36);
  expect(systemShortcut({ action: "back", key: "Ctrl+Alt+Left" }).virtualKey).toBe(37);
  expect(systemShortcut({ action: "forward", key: "Ctrl+Alt+F24" }).virtualKey).toBe(135);
  for (const key of ["Space", "A", "Shift+A", "Ctrl+Ctrl+A", "Ctrl+MediaPlayPause", "Ctrl+F25", "Ctrl+", "Ctrl+toString", "toString+A"]) expect(systemShortcut({ action: "toggle", key })).toBeNull();
  expect(systemShortcut({ action: "quit", key: "Ctrl+Alt+Q" })).toBeNull();
});
