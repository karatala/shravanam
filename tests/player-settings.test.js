import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { MpvPlayer } from "../desktop/mpv.js";
import { validPlaybackCommand } from "../src/playback.ts";

async function fixture(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "player-settings-"));
  const binary = join(profile, process.platform === "win32" ? "mpv custom.exe" : "mpv custom");
  await writeFile(binary, "executable fixture", { mode: 0o700 });
  let engine;
  class Player {
    constructor() { engine = this; this.state = { time: 0, duration: 120, paused: true, speed: 1, loading: false, volume: 100 }; this.loaded = false; this.audioOnly = true; }
    async close() {}
  }
  let media = await createMediaPlayer(profile, { Player });
  try {
    await check({ profile, binary, get media() { return media; }, get engine() { return engine; }, async restart() { await media.close(); media = await createMediaPlayer(profile, { Player }); } });
  } finally { await media.close(); }
}

test("mpv path persists locally, restores after restart, stays out of archives, and can be reset", () => fixture(async context => {
  const { binary, profile } = context;
  expect((await context.media.command({ type: "mpv-path", value: `  ${binary}  ` })).mpvPath).toBe(binary);
  expect(context.engine.executablePath).toBe(binary);
  expect(JSON.parse(await readFile(join(profile, "player.json"), "utf8")).mpvPath).toBe(binary);
  expect((await context.media.libraryRequest({ type: "export" })).archive).not.toContain(binary);
  await context.restart();
  expect(context.media.snapshot().mpvPath).toBe(binary);
  expect(context.engine.executablePath).toBe(binary);
  const reset = await context.media.command({ type: "mpv-path", value: "" });
  expect(reset.mpvPath).toBe("");
  expect(reset.error).toBeNull();
  expect(context.engine.executablePath).toBe("");
  await context.restart();
  expect(context.media.snapshot().mpvPath).toBe("");
}));

test("invalid executable paths leave the prior setting unchanged and report the rejected value", () => fixture(async ({ media, binary, profile, engine }) => {
  await media.command({ type: "mpv-path", value: binary });
  for (const invalid of ["mpv.exe", join(profile, "missing.exe"), profile, `${binary} --idle=yes`, `"${binary}"`]) {
    const state = await media.command({ type: "mpv-path", value: invalid });
    expect(state.error).toEqual({ code: "player-path", name: invalid });
    expect(state.mpvPath).toBe(binary);
    expect(engine.executablePath).toBe(binary);
  }
  expect(JSON.parse(await readFile(join(profile, "player.json"), "utf8")).mpvPath).toBe(binary);
}));

test("a failed settings write retains the previous path and a successful retry clears its error", () => fixture(async ({ media, binary, profile, engine }) => {
  await media.command({ type: "mpv-path", value: binary });
  await mkdir(join(profile, "player.json.pending"));
  const failed = await media.command({ type: "mpv-path", value: "" });
  expect(failed.error?.code).toBe("player-settings");
  expect(failed.mpvPath).toBe(binary);
  expect(engine.executablePath).toBe(binary);
  expect(JSON.parse(await readFile(join(profile, "player.json"), "utf8")).mpvPath).toBe(binary);
  await rename(join(profile, "player.json.pending"), join(profile, "blocked-pending"));
  const retry = await media.command({ type: "mpv-path", value: "" });
  expect(retry.error).toBeNull();
  expect(retry.mpvPath).toBe("");
}));

test("an unavailable explicit path reports its own error instead of falling back to another player", async () => {
  const player = new MpvPlayer("unused", () => {});
  player.executablePath = resolve("tmp/does-not-exist/mpv.exe");
  try { await expect(player.start()).rejects.toMatchObject({ code: "player-path", mediaName: player.executablePath }); }
  finally { await player.close(); }
});

test("path command rejects non-string, NUL, and excessive input before host access", () => {
  expect(validPlaybackCommand({ type: "mpv-path", value: "" })).toBe(true);
  for (const value of [null, 42, "mpv\0.exe", "x".repeat(32769)]) expect(validPlaybackCommand({ type: "mpv-path", value })).toBe(false);
});
