import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLibraryStore } from "../desktop/library-store.js";
import { canonical } from "../src/data/model.ts";

async function profile() {
  await mkdir(resolve("tmp"), { recursive: true });
  return mkdtemp(join(resolve("tmp"), "library-store-"));
}
const online = { key: "source-a", title: "Shared video", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", kind: "video" };
const local = { key: "file-a", name: "Book.mp3", kind: "audio", file: { name: "Book.mp3", size: 512, lastModified: 1000 } };

test("native migration retains originals, shares online/offline identity, and excludes access paths from archives", async () => {
  const directory = await profile();
  const mediaPath = join(directory, "download.mp3");
  await writeFile(mediaPath, "media");
  const legacy = { speed: 1.25, backward: 10, forward: 25, recent: [{ id: "download-a", name: "download.mp3", title: "Shared video", kind: "audio", path: mediaPath }], links: [{ id: online.key, name: online.title, url: online.url, kind: online.kind }], sourceBindings: { "download-a": online.key }, positions: { [online.key]: 42 } };
  const original = JSON.stringify(legacy);
  await writeFile(join(directory, "playback.json"), original);
  const library = await createLibraryStore(directory);
  const deviceId = library.deviceId();
  expect(await library.migrateLegacy(legacy)).toBe(true);
  const sourceBinding = library.binding(online.key);
  expect(library.binding("download-a")).toEqual(sourceBinding);
  expect(library.position(sourceBinding)).toBe(42);
  expect(library.resolve(sourceBinding.mediaId).path).toBe(mediaPath);
  const archive = await library.exportArchive();
  expect(archive).not.toContain(directory);
  expect(archive).not.toContain("download-a");
  expect(archive).toContain(online.url);
  expect(await readFile(join(directory, "playback.json"), "utf8")).toBe(original);
  const before = canonical(library.snapshot());
  expect(await library.migrateLegacy(legacy)).toBe(false);
  expect(canonical(library.snapshot())).toBe(before);
  const reopened = await createLibraryStore(directory);
  expect(reopened.deviceId()).toBe(deviceId);
  expect(reopened.binding(online.key)).toEqual(sourceBinding);
  expect(reopened.position(sourceBinding)).toBe(42);
});

test("native imports preserve text variants, repeat safely, and restore with stale-player protection", async () => {
  const library = await createLibraryStore(await profile());
  const binding = await library.bindLocal(local);
  const note = await library.put("note", { targetId: binding.mediaId, text: "Local note", time: 12 });
  await library.put("playlist", { title: "My list", mediaIds: [binding.mediaId] });
  const incoming = library.snapshot();
  incoming.records.find(record => record.id === note.id).value.text = "Other device note";
  const result = await library.importLibrary(incoming);
  expect(result.conflicts).toBe(1);
  expect(library.snapshot().records.filter(record => record.id === note.id).map(record => record.value.text)).toEqual(["Local note", "Other device note"]);
  await expect(library.saveProgress(binding, 99, 100, false)).rejects.toMatchObject({ code: "changed" });
  expect((await library.importLibrary(incoming)).changed).toBe(false);
  const recovery = canonical(library.recovery());
  await library.restorePrevious(recovery);
  expect(library.snapshot().records.filter(record => record.id === note.id).length).toBe(1);
  expect(library.binding(local.key).generation).toBe(2);
  await library.restorePrevious(canonical(library.recovery()));
  expect(library.snapshot().records.filter(record => record.id === note.id).length).toBe(2);
});

test("each device retains its own progress for a shared source, including an intentional rewind", async () => {
  const first = await createLibraryStore(await profile());
  const second = await createLibraryStore(await profile());
  const firstBinding = await first.bindSource(online);
  await first.saveProgress(firstBinding, 100, 200, false);
  await second.importArchive(await first.exportArchive());
  const secondBinding = await second.bindSource(online);
  expect(secondBinding.mediaId).toBe(firstBinding.mediaId);
  expect(secondBinding.progressId).not.toBe(firstBinding.progressId);
  expect(second.position(secondBinding)).toBe(0);
  await second.saveProgress(secondBinding, 20, 200, false);
  await first.importArchive(await second.exportArchive());
  expect(first.position(first.binding(online.key))).toBe(100);
  const progress = first.snapshot().records.filter(record => record.kind === "progress");
  expect(progress.some(record => record.value.position === 20)).toBe(true);
  expect(progress.some(record => record.value.position === 100)).toBe(true);
  expect(second.position(second.binding(online.key))).toBe(20);
});

test("native file matching uses complete metadata and never titles alone", async () => {
  const first = await createLibraryStore(await profile());
  const firstBinding = await first.bindLocal(local);
  const second = await createLibraryStore(await profile());
  await second.importArchive(await first.exportArchive());
  const relocated = await second.bindLocal({ ...local, key: "relocated-file", path: join(await profile(), local.name) });
  expect(relocated.mediaId).toBe(firstBinding.mediaId);
  const changed = await second.bindLocal({ ...local, key: "changed-file", file: { ...local.file, size: 1024 } });
  expect(changed.mediaId).not.toBe(firstBinding.mediaId);
});

test("invalid native edits and damaged archives leave current and recovery data intact", async () => {
  const directory = await profile();
  const library = await createLibraryStore(directory);
  await library.bindLocal(local);
  const before = await readFile(join(directory, "library.json"), "utf8");
  await expect(library.put("note", { targetId: "missing-record", text: "Unbound", time: null })).rejects.toMatchObject({ code: "reference" });
  const archive = JSON.parse(await library.exportArchive());
  archive.payload.records.find(record => record.kind === "media").value.title = "Tampered";
  await expect(library.importArchive(JSON.stringify(archive))).rejects.toMatchObject({ code: "integrity" });
  expect(await readFile(join(directory, "library.json"), "utf8")).toBe(before);
  expect(library.recovery()).toBeNull();
});

const permissionTest = process.platform === "win32" || process.getuid?.() === 0 ? test.skip : test;
permissionTest("failed atomic native writes do not change memory or saved recovery", async () => {
  const directory = await profile();
  const library = await createLibraryStore(directory);
  const binding = await library.bindLocal(local);
  const before = canonical(library.snapshot());
  const saved = await readFile(join(directory, "library.json"), "utf8");
  await chmod(directory, 0o500);
  try {
    await expect(library.saveProgress(binding, 30, 60, false)).rejects.toMatchObject({ code: "storage" });
    expect(canonical(library.snapshot())).toBe(before);
    expect(await readFile(join(directory, "library.json"), "utf8")).toBe(saved);
  } finally { await chmod(directory, 0o700); }
  await library.saveProgress(binding, 30, 60, false);
  expect(library.position(binding)).toBe(30);
});
