import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLibraryStore } from "../desktop/library-store.js";
import { createWebDav } from "../desktop/webdav.js";
import { canonical } from "../src/data/model.ts";

const address = "https://cloud.example.test/dav/books/";
const base = `${address}shravanam-v1/`;
const source = { key: "source-check", title: "Shared book", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", kind: "video" };
async function profile() {
  await mkdir(resolve("tmp"), { recursive: true });
  return mkdtemp(join(resolve("tmp"), "webdav-"));
}
function server() {
  const files = new Map();
  const calls = [];
  let serial = 0;
  const fixture = { files, calls, extraHrefs: [], listing: null, rejectWrite: false, readEtag: null, holdListing: null };
  fixture.fetcher = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? "GET";
    calls.push({ url: url.href, ...options, method });
    if (!url.href.startsWith(base)) throw new Error("Unexpected WebDAV destination");
    if (method === "MKCOL") return new Response(null, { status: 201 });
    if (method === "PROPFIND") {
      if (fixture.holdListing) await fixture.holdListing;
      const hrefs = [...files.keys()].map(name => `${base}${name}`).concat(fixture.extraHrefs);
      const xml = fixture.listing ?? `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs.map(href => `<d:response><d:href>${href}</d:href></d:response>`).join("")}</d:multistatus>`;
      return new Response(xml, { status: 207 });
    }
    const name = url.pathname.slice(new URL(base).pathname.length);
    const saved = files.get(name);
    if (method === "GET") return saved ? new Response(saved.body, { headers: { ETag: fixture.readEtag ?? saved.etag } }) : new Response(null, { status: 404 });
    if (method === "PUT") {
      if (fixture.rejectWrite || (options.headers["If-Match"] && options.headers["If-Match"] !== saved?.etag) || (options.headers["If-None-Match"] === "*" && saved)) return new Response(null, { status: 412 });
      files.set(name, { body: options.body, etag: `"revision-${++serial}"` });
      return new Response(null, { status: saved ? 204 : 201 });
    }
    throw new Error(`Unexpected method ${method}`);
  };
  return fixture;
}
async function client(fixture) {
  const directory = await profile();
  const library = await createLibraryStore(directory);
  const dav = await createWebDav(directory, library, fixture.fetcher);
  await dav.configure({ url: address, username: "listener", password: "private-check-password" });
  return { directory, library, dav };
}
async function synchronize(dav) { await dav.inspect(); return dav.apply(); }

test("manual WebDAV sync retains concurrent note variants and per-device rewinds without duplicates", async () => {
  const fixture = server();
  const first = await client(fixture);
  const firstBinding = await first.library.bindSource(source);
  const note = await first.library.put("note", { targetId: firstBinding.mediaId, text: "Original", time: 12 });
  await first.library.saveProgress(firstBinding, 100, 200, false);
  expect((await synchronize(first.dav)).busy).toBe(false);
  const second = await client(fixture);
  await synchronize(second.dav);
  const secondBinding = await second.library.bindSource(source);
  expect(secondBinding.mediaId).toBe(firstBinding.mediaId);
  expect(second.library.position(secondBinding)).toBe(0);
  await second.library.put("note", { ...note.value, text: "Second device edit" }, note.id);
  await second.library.saveProgress(secondBinding, 20, 200, false);
  await first.library.put("note", { ...note.value, text: "First device edit" }, note.id);
  await synchronize(second.dav);
  expect((await first.dav.inspect()).preview.conflicts).toBeGreaterThan(0);
  await first.dav.apply();
  const notes = first.library.snapshot().records.filter(record => record.id === note.id).map(record => record.value.text);
  expect(notes).toContain("First device edit");
  expect(notes).toContain("Second device edit");
  expect(first.library.position(first.library.binding(source.key))).toBe(100);
  const progress = first.library.snapshot().records.filter(record => record.kind === "progress");
  expect(progress.some(record => record.id === secondBinding.progressId && record.value.position === 20)).toBe(true);
  const before = canonical(first.library.snapshot());
  await synchronize(first.dav);
  expect(canonical(first.library.snapshot())).toBe(before);
  expect(fixture.calls.filter(call => call.method === "PUT").every(call => call.headers["If-Match"] || call.headers["If-None-Match"] === "*")).toBe(true);
});

test("WebDAV conditional-write conflict leaves local records and recovery unchanged", async () => {
  const fixture = server();
  const first = await client(fixture);
  await first.library.bindSource(source);
  await synchronize(first.dav);
  const second = await client(fixture);
  await second.dav.inspect();
  const before = canonical(second.library.snapshot());
  const recovery = second.library.recovery();
  fixture.rejectWrite = true;
  await expect(second.dav.apply()).rejects.toThrow("Local data is unchanged");
  expect(canonical(second.library.snapshot())).toBe(before);
  expect(second.library.recovery()).toEqual(recovery);
  expect(second.dav.state()).toMatchObject({ preview: null, busy: false, lastSync: null });
  fixture.rejectWrite = false;
  await synchronize(second.dav);
  expect(second.library.snapshot().records.some(record => record.kind === "media")).toBe(true);
});

test("WebDAV refuses corrupted archives and weak own ETags before changing local data", async () => {
  const fixture = server();
  const first = await client(fixture);
  await first.library.bindSource(source);
  await synchronize(first.dav);
  const second = await client(fixture);
  const before = canonical(second.library.snapshot());
  const damaged = JSON.parse(await first.library.exportArchive());
  damaged.payload.records.find(record => record.kind === "media").value.title = "Damaged";
  fixture.files.set(`d${"f".repeat(32)}.json`, { body: JSON.stringify(damaged), etag: '"damaged"' });
  await expect(second.dav.inspect()).rejects.toMatchObject({ code: "integrity" });
  expect(canonical(second.library.snapshot())).toBe(before);
  expect(second.dav.state()).toMatchObject({ busy: false, preview: null });
  fixture.files.delete(`d${"f".repeat(32)}.json`);
  fixture.readEtag = 'W/"weak-version"';
  await expect(first.dav.inspect()).rejects.toThrow("strong file version");
  expect(first.dav.state()).toMatchObject({ busy: false, preview: null });
});

test("WebDAV keeps the password in memory, blocks redirects, and fetches only owned same-origin filenames", async () => {
  const fixture = server();
  const current = await client(fixture);
  fixture.extraHrefs = [`https://other.example.test/d${"a".repeat(32)}.json`, `${address}d${"b".repeat(32)}.json`, `${base}nested/d${"c".repeat(32)}.json`, `${base}d${"d".repeat(32)}.json?secret=invalid`, `${base}unknown.json`];
  await synchronize(current.dav);
  expect(fixture.calls.every(call => call.redirect === "error")).toBe(true);
  expect(fixture.calls.some(call => call.method === "GET")).toBe(false);
  expect(fixture.calls.every(call => call.headers.Authorization === `Basic ${Buffer.from("listener:private-check-password").toString("base64")}`)).toBe(true);
  const settings = await readFile(join(current.directory, "webdav.json"), "utf8");
  expect(settings).not.toContain("private-check-password");
  expect(await current.library.exportArchive()).not.toContain("private-check-password");
  expect(JSON.stringify(current.dav.state())).not.toContain("private-check-password");
  const reopened = await createWebDav(current.directory, current.library, fixture.fetcher);
  expect(reopened.state().connected).toBe(false);
  await expect(reopened.inspect()).rejects.toThrow("password");
});

test("WebDAV bounds device listings and rejects malformed XML before any upload", async () => {
  const fixture = server();
  const current = await client(fixture);
  fixture.extraHrefs = Array.from({ length: 129 }, (_, idx) => `${base}d${idx.toString(16).padStart(32, "0")}.json`);
  await expect(current.dav.inspect()).rejects.toThrow("128 devices");
  fixture.extraHrefs = [];
  fixture.listing = "not a WebDAV listing";
  await expect(current.dav.inspect()).rejects.toThrow("Cannot synchronize");
  fixture.listing = `<!DOCTYPE multistatus [<!ENTITY external SYSTEM "file:///private">]><multistatus>&external;</multistatus>`;
  await expect(current.dav.inspect()).rejects.toThrow("Cannot synchronize");
  fixture.listing = " ".repeat(1024 * 1024 + 1);
  await expect(current.dav.inspect()).rejects.toThrow("Cannot synchronize");
  expect(fixture.calls.some(call => call.method === "PUT")).toBe(false);
});

test("WebDAV cannot change destinations or credentials while a transfer is active", async () => {
  const fixture = server();
  const current = await client(fixture);
  let release;
  fixture.holdListing = new Promise(resolveListing => { release = resolveListing; });
  const inspection = current.dav.inspect();
  await Promise.resolve();
  await expect(current.dav.configure({ url: "https://other.example.test/books/", username: "other", password: "other-password" })).rejects.toThrow("Wait for WebDAV");
  expect(() => current.dav.disconnect()).toThrow("Wait for WebDAV");
  release();
  expect((await inspection).busy).toBe(false);
  expect(current.dav.state().url).toBe(address);
});

const permissionTest = process.platform === "win32" || process.getuid?.() === 0 ? test.skip : test;
permissionTest("failed WebDAV settings writes keep the old connection and give a repair action", async () => {
  const fixture = server();
  const current = await client(fixture);
  const before = current.dav.state();
  const saved = await readFile(join(current.directory, "webdav.json"), "utf8");
  await chmod(current.directory, 0o500);
  try {
    await expect(current.dav.configure({ url: "https://other.example.test/books/", username: "other", password: "other-password" })).rejects.toThrow("Check free disk space and write permission");
    expect(current.dav.state()).toEqual(before);
    expect(await readFile(join(current.directory, "webdav.json"), "utf8")).toBe(saved);
  } finally { await chmod(current.directory, 0o700); }
});
