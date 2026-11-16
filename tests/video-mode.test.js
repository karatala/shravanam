import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { MpvPlayer } from "../desktop/mpv.js";

function deferred() { let resolve; let reject; const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; }); return { promise, resolve, reject }; }
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

async function fixture(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "video-mode-"));
  const video = deferred();
  let signal;
  let engine;
  const resolutions = [];
  class Player {
    constructor() { engine = this; this.state = { time: 0, duration: 600, paused: true, speed: 1, loading: false, volume: 100 }; this.loaded = false; this.audioOnly = true; this.loads = []; this.videos = []; this.commands = []; }
    async load(path, speed, position, autoplay) { this.loads.push(path); this.loaded = true; Object.assign(this.state, { time: position, speed, paused: !autoplay }); }
    async setAudioOnly(value) { this.audioOnly = value; }
    async addVideo(stream) { this.videos.push(stream); }
    async request(command) { this.commands.push(command); if (command[0] === "set_property" && command[1] === "pause") this.state.paused = command[2]; }
    async close() {}
  }
  const media = await createMediaPlayer(profile, { Player, resolveYouTube: async (source, audioOnly) => { resolutions.push(audioOnly); return { url: "https://audio.example.test/track", headers: [], audio: null, title: "Long recording", chapters: [] }; }, resolveYouTubeVideo: (source, selectedSignal) => { signal = selectedSignal; return video.promise; } });
  try { await check({ profile, media, engine, video, resolutions, get signal() { return signal; } }); }
  finally { await media.close(); }
}

test("Watch loads audio once and keeps pause/speed commands responsive while video resolves", () => fixture(async ({ media, engine, video, resolutions }) => {
  const opening = await media.command({ type: "open-youtube", url: "https://youtu.be/dQw4w9WgXcQ", audioOnly: false });
  expect(resolutions).toEqual([true]);
  expect(opening.loading).toBe(false);
  expect(opening.videoLoading).toBe(true);
  engine.state.time = 42;
  await media.command({ type: "pause", value: true });
  await media.command({ type: "pause", value: true });
  await media.command({ type: "speed", value: 1.25 });
  video.resolve({ url: "https://video.example.test/track", headers: [] });
  await nextTurn();
  expect(engine.loads).toEqual(["https://audio.example.test/track"]);
  expect(engine.videos).toHaveLength(1);
  expect(media.snapshot().paused).toBe(true);
  expect(media.snapshot().time).toBe(42);
  expect(media.snapshot().speed).toBe(1.25);
  expect(media.snapshot().videoLoading).toBe(false);
}));

test("switching Listen to Watch does not reload, seek, or pause the current audio", () => fixture(async ({ media, engine, video }) => {
  await media.command({ type: "open-youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
  engine.state.time = 73;
  const previousCommands = engine.commands.length;
  const state = await media.command({ type: "audio-only", value: false });
  expect(state.loading).toBe(false);
  expect(state.videoLoading).toBe(true);
  expect(state.paused).toBe(false);
  expect(engine.commands.slice(previousCommands)).toEqual([]);
  video.resolve({ url: "https://video.example.test/track", headers: [] });
  await nextTurn();
  expect(engine.loads).toHaveLength(1);
  expect(media.snapshot().time).toBe(73);
  expect(media.snapshot().paused).toBe(false);
}));

test("Listen cancels pending video and a late resolver result cannot turn video back on", () => fixture(async context => {
  await context.media.command({ type: "open-youtube", url: "https://youtu.be/dQw4w9WgXcQ", audioOnly: false });
  await context.media.command({ type: "audio-only", value: true });
  expect(context.signal.aborted).toBe(true);
  context.video.resolve({ url: "https://video.example.test/track", headers: [] });
  await nextTurn();
  expect(context.engine.videos).toEqual([]);
  expect(context.media.snapshot().audioOnly).toBe(true);
  expect(context.media.snapshot().videoLoading).toBe(false);
  expect(context.engine.loads).toHaveLength(1);
}));

test("a video failure leaves audio loaded and reports a separate video error", () => fixture(async ({ media, engine, video }) => {
  await media.command({ type: "open-youtube", url: "https://youtu.be/dQw4w9WgXcQ", audioOnly: false });
  video.reject(new Error("Video unavailable"));
  await nextTurn();
  expect(engine.loaded).toBe(true);
  expect(media.snapshot().paused).toBe(false);
  expect(media.snapshot().error).toBeNull();
  expect(media.snapshot().videoError).toEqual({ code: "video" });
}));

test("late video errors do not replace the state after opening a different local file", () => fixture(async ({ profile, media, video }) => {
  await media.command({ type: "open-youtube", url: "https://youtu.be/dQw4w9WgXcQ", audioOnly: false });
  const local = join(profile, "different.wav");
  await writeFile(local, "fixture");
  await media.openPaths([local]);
  video.reject(new Error("Old source video failed"));
  await nextTurn();
  expect(media.snapshot().videoError).toBeNull();
  expect(media.snapshot().error).toBeNull();
  expect(media.snapshot().items.find(item => item.id === media.snapshot().currentId).name).toBe("different.wav");
}));

function videoPlayer() {
  const player = new MpvPlayer("unused", () => {});
  const commands = [];
  const addition = deferred();
  let attached = false;
  player.loaded = true;
  player.audioOnly = false;
  player.socket = { destroyed: false };
  player.audioHeaders = ["User-Agent: audio-client"];
  player.state.time = 90;
  player.state.paused = false;
  player.request = async (command, timeout, asynchronous) => { commands.push({ command, asynchronous }); if (command[0] === "video-add") { await addition.promise; attached = true; } if (command[0] === "get_property" && command[1] === "track-list") return attached ? [{ id: 3, type: "video", external: true, "external-filename": "https://video.example.test/track" }, { id: 4, type: "audio", external: true, "external-filename": "https://video.example.test/track" }] : []; };
  return { player, commands, addition };
}

test("mpv video attachment uses asynchronous IPC, restores audio headers, and leaves the audio clock alone", async () => {
  const { player, commands, addition } = videoPlayer();
  const pending = player.addVideo({ url: "https://video.example.test/track", headers: ["User-Agent: video-client"] });
  await nextTurn();
  expect(commands.find(item => item.command[0] === "video-add").asynchronous).toBe(true);
  addition.resolve();
  expect(await pending).toBe(true);
  expect(commands.at(-1).command).toEqual(["set_property", "http-header-fields", player.audioHeaders]);
  expect(commands.some(item => ["loadfile", "seek", "audio-add"].includes(item.command[0]) || ["pause", "mute", "aid"].includes(item.command[1]))).toBe(false);
  expect(player.state.time).toBe(90);
  expect(player.state.paused).toBe(false);
  expect(player.videoTrackId).toBe(3);
});

test("disabling video removes a late-added external track without selecting it", async () => {
  const { player, commands, addition } = videoPlayer();
  const pending = player.addVideo({ url: "https://video.example.test/track", headers: [] });
  await nextTurn();
  await player.setAudioOnly(true);
  addition.resolve();
  expect(await pending).toBe(false);
  expect(commands.some(item => item.command[0] === "video-remove" && item.command[1] === 3)).toBe(true);
  expect(commands.some(item => item.command[0] === "audio-remove" && item.command[1] === 4)).toBe(true);
  expect(commands.some(item => item.command[1] === "vid" && item.command[2] === 3)).toBe(false);
  expect(player.audioOnly).toBe(true);
});

test("IPC marks only long asynchronous track commands as asynchronous", async () => {
  const player = new MpvPlayer("unused", () => {});
  let message;
  player.socket = { destroyed: false, write(value) { message = JSON.parse(value); } };
  const result = player.request(["video-add", "https://video.example.test/track", "auto"], 30000, true);
  expect(message.async).toBe(true);
  player.receive({ request_id: message.request_id, error: "success", data: true });
  expect(await result).toBe(true);
});

test("mpv audio and video tracks can share the same numeric ID", async () => {
  const player = new MpvPlayer("unused", () => {});
  player.loaded = true; player.audioOnly = false; player.socket = { destroyed: false };
  let attached = false;
  player.request = async command => {
    if (command[0] === "video-add") attached = true;
    if (command[1] === "track-list") return [{ id: 1, type: "audio" }, ...(attached ? [{ id: 1, type: "video", external: true, "external-filename": "https://video.example.test/track" }] : [])];
  };
  expect(await player.addVideo({ url: "https://video.example.test/track", headers: [] })).toBe(true);
  expect(player.videoTrackId).toBe(1);
});

test("a source switch during header setup cannot attach the old source's video", async () => {
  const player = new MpvPlayer("unused", () => {});
  const headers = deferred();
  const commands = [];
  player.loaded = true; player.audioOnly = false; player.socket = { destroyed: false };
  player.request = async command => { commands.push(command); if (command[1] === "track-list") return []; if (command[1] === "http-header-fields") await headers.promise; };
  const pending = player.addVideo({ url: "https://video.example.test/old", headers: ["User-Agent: old-video"] });
  await nextTurn();
  player.mediaGeneration++;
  player.audioHeaders = ["User-Agent: new-audio"];
  headers.resolve();
  expect(await pending).toBe(false);
  expect(commands.some(command => command[0] === "video-add")).toBe(false);
  expect(commands.filter(command => command[1] === "http-header-fields")).toHaveLength(1);
});

test("failed video activation removes sibling tracks and clears owned activation IDs", async () => {
  const { player, commands, addition } = videoPlayer();
  const request = player.request;
  player.request = async (...args) => { if (args[0][1] === "video-sync") throw new Error("Video setup failed"); return request(...args); };
  const pending = player.addVideo({ url: "https://video.example.test/track", headers: [] });
  addition.resolve();
  await expect(pending).rejects.toThrow("Video setup failed");
  expect(player.videoTrackId).toBeNull();
  expect(player.videoTracks).toEqual([]);
  expect(commands.some(item => item.command[0] === "video-remove")).toBe(true);
  expect(commands.some(item => item.command[0] === "audio-remove")).toBe(true);
  expect(player.loaded).toBe(true);
  expect(player.state.paused).toBe(false);
});
