import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { encodeArchive } from "../src/data/archive.ts";

async function fixture(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "media-library-review-"));
  let engine;
  class Player {
    constructor(directory, onChange) { engine = this; this.onChange = onChange; this.state = { time: 0, duration: 120, paused: true, speed: 1, loading: false, volume: 80 }; this.loaded = false; this.ended = false; this.audioOnly = true; this.loads = []; }
    async load(path, speed, position, autoplay) { this.loads.push({ path, position }); this.loaded = true; this.ended = false; Object.assign(this.state, { time: position, speed, paused: !autoplay, duration: 120 }); }
    async request(command) { if (command[0] === "get_property") return command[1] === "chapter-list" ? [] : undefined; if (command[0] === "set_property") this.state[command[1] === "pause" ? "paused" : command[1]] = command[2]; if (command[0] === "seek") this.state.time = command[1]; }
    async setAudioOnly(value) { this.audioOnly = value; }
    async close() {}
  }
  const paths = [join(profile, "first.wav"), join(profile, "second.wav"), join(profile, "download.wav")];
  for (const path of paths) await writeFile(path, "fixture");
  const media = await createMediaPlayer(profile, { Player });
  try { await check({ profile, paths, media, engine }); }
  finally { await media.close(); }
}

test("opening a download leaves the previous playlist before handling its EOF", () => fixture(async ({ media, paths, engine }) => {
  await media.openPaths(paths.slice(0, 2));
  let state = await media.libraryRequest({ type: "state" });
  const mediaIds = state.library.records.filter(record => record.kind === "media").map(record => record.id);
  state = await media.libraryRequest({ type: "command", command: { type: "save", kind: "playlist", value: { title: "Original queue", mediaIds } } });
  const playlistId = state.library.records.find(record => record.kind === "playlist").id;
  await media.libraryRequest({ type: "command", command: { type: "play", mediaId: mediaIds[0], playlistId } });
  await media.openDownloaded(paths[2], "https://www.youtube.com/watch?v=jNQXAC9IVRw", true, "Download");
  expect((await media.libraryRequest({ type: "state" })).playlistId).toBeNull();
  const count = engine.loads.length;
  engine.ended = true;
  engine.state.time = engine.state.duration;
  engine.state.paused = true;
  await new Promise(done => setTimeout(done, 400));
  await media.libraryRequest({ type: "state" });
  expect(engine.loads).toHaveLength(count);
  expect(engine.loads.at(-1).path).toBe(paths[2]);
}));

test("closing the native engine saves its latest stable time to the authoritative library before reopening", () => fixture(async ({ media, paths, engine }) => {
  await media.openPaths(paths.slice(0, 1));
  const mediaId = media.snapshot().libraryMediaId;
  engine.state.time = 37;
  engine.onChange();
  engine.loaded = false;
  engine.state.paused = true;
  engine.onChange("player-closed");
  const state = await media.libraryRequest({ type: "state" });
  const progress = state.library.records.find(record => record.kind === "progress" && record.value.mediaId === mediaId);
  expect(progress.value.position).toBe(37);
  await media.command({ type: "toggle" });
  expect(engine.loads.at(-1).position).toBe(37);
}));

const permissionTest = process.platform === "win32" || process.getuid?.() === 0 ? test.skip : test;
permissionTest("a failed progress flush blocks export and data replacement without losing the active binding", () => fixture(async ({ profile, media, paths, engine }) => {
  await media.openPaths(paths.slice(0, 1));
  const currentId = media.snapshot().currentId;
  const state = await media.libraryRequest({ type: "state" });
  const incoming = structuredClone(state.library);
  incoming.records.find(record => record.kind === "progress").value.position = 10;
  const preview = await media.libraryRequest({ type: "preview-import", archive: await encodeArchive(incoming) });
  engine.state.time = 37;
  engine.onChange();
  await chmod(profile, 0o500);
  try {
    await expect(media.libraryRequest({ type: "export" })).rejects.toMatchObject({ code: "storage" });
    await expect(media.libraryRequest({ type: "import", preferIncoming: true, token: preview.token })).rejects.toMatchObject({ code: "storage" });
    expect(media.snapshot().currentId).toBe(currentId);
  } finally { await chmod(profile, 0o700); }
  await media.command({ type: "seek", time: 37 });
  const saved = await media.libraryRequest({ type: "state" });
  expect(saved.library.records.find(record => record.kind === "progress").value.position).toBe(37);
  engine.loaded = false;
  engine.onChange("player-closed");
  await media.command({ type: "toggle" });
  expect(engine.loads.at(-1).position).toBe(37);
}));
