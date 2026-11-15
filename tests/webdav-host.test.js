import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { decodeArchive } from "../src/data/archive.ts";
import { canonical } from "../src/data/model.ts";

const address = "https://fixture.test/dav/books/";
const collection = "/dav/books/shravanam-v1/";
const password = "test-session-password";
const source = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

function streamed(text, headers = {}, status = 200) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let idx = 0; idx < bytes.length; idx += 173) controller.enqueue(bytes.slice(idx, idx + 173)); controller.close(); } }), { headers, status });
}

async function withDav(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(join(resolve("tmp"), "webdav-host-"));
  const clients = [];
  const fixture = { files: new Map(), calls: [], denied: false, rejectWrite: false, holdListing: null, onListing: null };
  let collectionExists = false;
  let revision = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const headers = Object.fromEntries(request.headers.entries());
    fixture.calls.push({ method, path: url.pathname, headers });
    if (fixture.denied || request.headers.get("authorization") !== `Basic ${Buffer.from(`listener:${password}`).toString("base64")}`) return new Response(null, { status: 401 });
    if (!url.pathname.startsWith(collection)) return new Response(null, { status: 404 });
    if (method === "MKCOL") { const status = collectionExists ? 405 : 201; collectionExists = true; return new Response(null, { status }); }
    if (method === "PROPFIND") {
      fixture.onListing?.();
      if (fixture.holdListing) await fixture.holdListing;
      const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[...fixture.files.keys()].map(name => `<d:response><d:href>${collection}${name}</d:href></d:response>`).join("")}</d:multistatus>`;
      return streamed(xml, { "Content-Type": "application/xml" }, 207);
    }
    const name = url.pathname.slice(collection.length);
    const saved = fixture.files.get(name);
    if (method === "GET") return saved ? streamed(saved.body, { ETag: saved.etag, "Content-Type": "application/json" }) : new Response(null, { status: 404 });
    if (method === "PUT") {
      const match = request.headers.get("if-match");
      if (fixture.rejectWrite || match && match !== saved?.etag || request.headers.get("if-none-match") === "*" && saved) return new Response(null, { status: 412 });
      fixture.files.set(name, { body: await request.text(), etag: `"revision-${++revision}"` });
      return new Response(null, { status: saved ? 204 : 201 });
    }
    return new Response(null, { status: 405 });
  } });
  async function client() {
    const profile = join(directory, `device-${clients.length}`);
    await mkdir(profile);
    const path = join(profile, "book.wav");
    await writeFile(path, "local fixture");
    let engine;
    class Player {
      constructor() { engine = this; this.state = { time: 0, duration: 300, paused: true, speed: 1, loading: false, volume: 100 }; this.loaded = false; this.ended = false; this.audioOnly = true; this.loads = []; }
      async load(path, speed, position, autoplay) { this.loads.push({ path, position }); this.loaded = true; this.ended = false; Object.assign(this.state, { time: position, speed, paused: !autoplay }); }
      async request(command) { if (command[0] === "get_property") return command[1] === "chapter-list" ? [] : undefined; if (command[0] === "set_property") this.state[command[1] === "pause" ? "paused" : command[1]] = command[2]; if (command[0] === "seek") this.state.time = command[1]; }
      async setAudioOnly(value) { this.audioOnly = value; }
      async close() {}
    }
    const media = await createMediaPlayer(profile, { Player, fetch(input, options) { const url = new URL(input); if (url.origin !== "https://fixture.test") throw new Error("Unexpected test destination"); return fetch(new URL(url.pathname, server.url), options); } });
    clients.push(media);
    await media.libraryRequest({ type: "sync-configure", url: address, username: "listener", password });
    return { media, engine, path, profile };
  }
  try { await check({ fixture, client }); }
  finally { for (const media of clients) await media.close(); server.stop(true); }
}

async function synchronize(media, preferIncoming = false) {
  const preview = await media.libraryRequest({ type: "sync-preview" });
  return media.libraryRequest({ type: "sync-apply", preferIncoming, token: preview.webdav.preview.token });
}
const save = (media, kind, value, id) => media.libraryRequest({ type: "command", command: { type: "save", kind, value, ...(id ? { id } : {}) } });

test("native hosts synchronize streamed WebDAV records, conflicts, and separate rewind positions over HTTP", () => withDav(async ({ fixture, client }) => {
  const first = await client();
  await first.media.openDownloaded(first.path, source, true, "Shared book");
  const mediaId = first.media.snapshot().libraryMediaId;
  let state = await save(first.media, "note", { targetId: mediaId, text: "Original note", time: 12 });
  const note = state.library.records.find(record => record.kind === "note");
  state = await save(first.media, "playlist", { title: "Listening", mediaIds: [mediaId] });
  const playlist = state.library.records.find(record => record.kind === "playlist");
  await save(first.media, "text", { targetId: mediaId, role: "subtitle", language: "ru", original: "00:00:01.000 --> 00:00:03.000\nИсходный текст", edited: null, cues: [{ start: 1, end: 3, text: "Исходный текст" }] });
  await first.media.command({ type: "seek", time: 100 });
  await synchronize(first.media);
  const second = await client();
  await synchronize(second.media);
  await second.media.openDownloaded(second.path, source, true, "Shared book");
  expect(second.media.snapshot().libraryMediaId).toBe(mediaId);
  expect(second.media.snapshot().time).toBe(0);
  await second.media.command({ type: "seek", time: 20 });
  await save(second.media, "note", { ...note.value, text: "Second device edit" }, note.id);
  await save(first.media, "note", { ...note.value, text: "First device edit" }, note.id);
  await synchronize(second.media);
  state = await synchronize(first.media);
  expect(state.library.records.filter(record => record.id === note.id).map(record => record.value.text)).toEqual(expect.arrayContaining(["First device edit", "Second device edit"]));
  expect(state.library.records.find(record => record.id === playlist.id).value.mediaIds).toEqual([mediaId]);
  expect(state.library.records.find(record => record.kind === "text").value.cues).toEqual([{ start: 1, end: 3, text: "Исходный текст" }]);
  const positions = state.library.records.filter(record => record.kind === "progress").map(record => record.value.position);
  expect(positions).toContain(100);
  expect(positions).toContain(20);
  const before = canonical(state.library);
  expect(canonical((await synchronize(first.media)).library)).toBe(before);
  await first.media.openDownloaded(first.path, source, true, "Shared book");
  await second.media.openDownloaded(second.path, source, true, "Shared book");
  expect(first.media.snapshot().time).toBe(100);
  expect(second.media.snapshot().time).toBe(20);
  const exported = await first.media.libraryRequest({ type: "export" });
  expect(exported.archive).not.toContain(first.profile);
  expect(exported.archive).not.toContain(password);
  expect((await decodeArchive(exported.archive)).payload.records.find(record => record.id === playlist.id).value.mediaIds).toEqual([mediaId]);
  expect(fixture.files.size).toBe(2);
  expect(fixture.calls.filter(call => call.method === "PROPFIND").every(call => call.headers.depth === "1")).toBe(true);
  expect(fixture.calls.filter(call => call.method === "PUT").every(call => call.headers["if-match"] || call.headers["if-none-match"] === "*")).toBe(true);
  expect(fixture.calls.some(call => call.method === "GET")).toBe(true);
}));

test("native WebDAV authentication and conditional-write failures retain local records and recovery", () => withDav(async ({ fixture, client }) => {
  const first = await client();
  await first.media.openDownloaded(first.path, source, true, "Shared book");
  await synchronize(first.media);
  await first.media.openDownloaded(first.path, source, true, "Shared book");
  await first.media.command({ type: "seek", time: 37 });
  const before = await first.media.libraryRequest({ type: "state" });
  fixture.denied = true;
  await expect(first.media.libraryRequest({ type: "sync-preview" })).rejects.toThrow("denied access");
  expect(canonical((await first.media.libraryRequest({ type: "state" })).library)).toBe(canonical(before.library));
  expect(first.media.snapshot().time).toBe(37);
  fixture.denied = false;
  const preview = await first.media.libraryRequest({ type: "sync-preview" });
  fixture.rejectWrite = true;
  await expect(first.media.libraryRequest({ type: "sync-apply", token: preview.webdav.preview.token })).rejects.toThrow("Local data is unchanged");
  const after = await first.media.libraryRequest({ type: "state" });
  expect(canonical(after.library)).toBe(canonical(before.library));
  expect(after.recovery).toEqual(before.recovery);
  expect(after.webdav.preview).toBeNull();
  fixture.rejectWrite = false;
  await first.media.openDownloaded(first.path, source, true, "Shared book");
  expect(first.media.snapshot().time).toBe(37);
}));

test("a slow WebDAV preview leaves native playback commands and sleep countdown responsive", () => withDav(async ({ fixture, client }) => {
  const current = await client();
  await current.media.openDownloaded(current.path, source, true, "Shared book");
  await current.media.sleepCommand({ type: "start" });
  let release;
  let listingReached;
  fixture.holdListing = new Promise(resolveListing => { release = resolveListing; });
  const reached = new Promise(resolveReached => { listingReached = resolveReached; });
  fixture.onListing = () => listingReached();
  const pending = current.media.libraryRequest({ type: "sync-preview" });
  try {
    await reached;
    let commandDeadline;
    try { await Promise.race([current.media.command({ type: "seek", time: 77 }), new Promise((resolveDeadline, rejectDeadline) => { commandDeadline = setTimeout(() => rejectDeadline(new Error("WebDAV preview blocked playback controls")), 1000); })]); }
    finally { clearTimeout(commandDeadline); }
    expect(current.media.snapshot().time).toBe(77);
    expect((await current.media.libraryRequest({ type: "state" })).webdav.busy).toBe(true);
    await new Promise(resolveTick => setTimeout(resolveTick, 750));
    expect(current.media.snapshot().sleep.remainingSeconds).toBeLessThan(900);
    await current.media.command({ type: "toggle" });
    expect(current.media.snapshot().paused).toBe(true);
  } finally { release(); await pending; }
}));
