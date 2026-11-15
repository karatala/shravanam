import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { decodeArchive, encodeArchive } from "../src/data/archive.ts";

async function fixture(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "media-library-"));
  let engine;
  class Player {
    constructor() { engine = this; this.state = { time: 0, duration: 120, paused: true, speed: 1, loading: false, volume: 80 }; this.loaded = false; this.ended = false; this.audioOnly = true; this.loads = []; }
    async load(path, speed, position, autoplay) { this.loads.push(path); this.loaded = true; this.ended = false; Object.assign(this.state, { time: position, speed, paused: !autoplay, duration: 120 }); }
    async request(command) { if (command[0] === "get_property") return command[1] === "chapter-list" ? [{ time: 0, title: "First" }, { time: 60, title: "Second" }] : undefined; if (command[0] === "set_property") this.state[command[1] === "pause" ? "paused" : command[1]] = command[2]; if (command[0] === "seek") this.state.time = command[1]; }
    async setAudioOnly(value) { this.audioOnly = value; }
    async close() {}
  }
  const paths = [join(profile, "one.wav"), join(profile, "two.wav")];
  for (const path of paths) await writeFile(path, "fixture");
  const media = await createMediaPlayer(profile, { Player });
  try { await check({ profile, paths, media, engine }); }
  finally { await media.close(); }
}

test("native chapters and playlist order survive data export and advance once on EOF", () => fixture(async ({ media, paths, engine }) => {
  await media.openPaths(paths);
  let state = await media.libraryRequest({ type: "state" });
  const firstId = media.snapshot().libraryMediaId;
  expect(state.library.records.filter(record => record.kind === "chapter")).toHaveLength(2);
  const mediaIds = state.library.records.filter(record => record.kind === "media").map(record => record.id);
  state = await media.libraryRequest({ type: "command", command: { type: "save", kind: "playlist", value: { title: "Book", mediaIds } } });
  const playlistId = state.library.records.find(record => record.kind === "playlist").id;
  await media.libraryRequest({ type: "command", command: { type: "play", mediaId: firstId, playlistId } });
  const count = engine.loads.length;
  engine.ended = true;
  engine.state.time = 120;
  engine.state.paused = true;
  for (let idx = 0; idx < 30 && engine.loads.length === count; idx++) await new Promise(done => setTimeout(done, 25));
  expect(engine.loads).toHaveLength(count + 1);
  expect(engine.loads.at(-1)).toBe(paths[1]);
  expect(media.snapshot().libraryMediaId).toBe(mediaIds[1]);
  const exported = await media.libraryRequest({ type: "export" });
  expect(exported.archive).not.toContain(paths[0]);
  const archive = await decodeArchive(exported.archive);
  expect(archive.payload.records.find(record => record.kind === "playlist").value.mediaIds).toEqual(mediaIds);
}));

test("native data replacement pauses playback and cannot overwrite imported progress or settings", () => fixture(async ({ media, paths, engine }) => {
  await media.openPaths(paths);
  await media.command({ type: "seek", time: 40 });
  const exported = await media.libraryRequest({ type: "export" });
  const archive = await decodeArchive(exported.archive);
  const incoming = structuredClone(archive.payload);
  const progress = incoming.records.find(record => record.kind === "progress" && record.value.mediaId === media.snapshot().libraryMediaId);
  progress.value.position = 10;
  progress.updatedAt++;
  const settings = incoming.records.find(record => record.kind === "settings");
  settings.value.speed = 1.5;
  settings.updatedAt++;
  const preview = await media.libraryRequest({ type: "preview-import", archive: await encodeArchive(incoming) });
  await media.libraryRequest({ type: "import", preferIncoming: true, token: preview.token });
  expect(engine.state.paused).toBe(true);
  expect(media.snapshot().currentId).toBeNull();
  expect(media.snapshot().speed).toBe(1.5);
  await media.libraryRequest({ type: "export" });
  const state = await media.libraryRequest({ type: "state" });
  expect(state.library.records.find(record => record.id === progress.id).value.position).toBe(10);
  expect(state.recovery).not.toBeNull();
  await media.command({ type: "select", id: media.snapshot().items[0].id });
  expect(engine.state.time).toBe(10);
}));

test("a different window cannot replace an archive that is already being reviewed", () => fixture(async ({ media, paths }) => {
  await media.openPaths(paths);
  const exported = await media.libraryRequest({ type: "export" });
  const first = await media.libraryRequest({ type: "preview-import", archive: exported.archive });
  const secondLibrary = (await decodeArchive(exported.archive)).payload;
  secondLibrary.records.find(record => record.kind === "settings").value.speed = 2;
  const second = await media.libraryRequest({ type: "preview-import", archive: await encodeArchive(secondLibrary) });
  const currentId = media.snapshot().currentId;
  await expect(media.libraryRequest({ type: "import", preferIncoming: true, token: first.token })).rejects.toMatchObject({ code: "changed" });
  expect(media.snapshot().currentId).toBe(currentId);
  await media.libraryRequest({ type: "import", preferIncoming: true, token: second.token });
  expect(media.snapshot().speed).toBe(2);
}));
