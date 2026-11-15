import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { canonical, DataError, defaultSettings, MAX_BYTES, validFile, validSettings, validateLibrary } from "../src/data/model.ts";
import { decodeArchive, encodeArchive, mergeLibraries } from "../src/data/archive.ts";

const clone = value => structuredClone(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const primary = library => [...new Map([...library.records].reverse().map(record => [record.id, record])).values()];
const keyValid = key => typeof key === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(key) && !["__proto__", "constructor", "prototype"].includes(key);
const pathValid = path => typeof path === "string" && isAbsolute(path) && !path.includes("\0");

function validateStore(value) {
  if (!value || Object.keys(value).sort().join(",") !== "bindings,identity,library,migrated,previous,version" || value.version !== 1 || typeof value.migrated !== "boolean") throw new DataError("format");
  const identity = value.identity;
  if (!identity || Object.keys(identity).sort().join(",") !== "counter,generation,prefix,revision" || !/^d[a-f0-9]{32}$/.test(identity.prefix) || ![identity.counter, identity.generation, identity.revision].every(number => Number.isSafeInteger(number) && number >= 0)) throw new DataError("format");
  validateLibrary(value.library);
  if (value.previous !== null) {
    if (!value.previous || Object.keys(value.previous).sort().join(",") !== "createdAt,library" || !Number.isSafeInteger(value.previous.createdAt) || value.previous.createdAt < 0) throw new DataError("format");
    validateLibrary(value.previous.library);
  }
  if (!value.bindings || typeof value.bindings !== "object" || Array.isArray(value.bindings) || Object.keys(value.bindings).length > 20000) throw new DataError("format");
  for (const [key, binding] of Object.entries(value.bindings)) {
    if (!keyValid(key) || !binding || Object.keys(binding).some(field => !["mediaId", "progressId", "path", "source"].includes(field)) || typeof binding.mediaId !== "string" || typeof binding.progressId !== "string" || (binding.path !== undefined && !pathValid(binding.path))) throw new DataError("format");
    if (binding.source !== undefined) {
      let source;
      try { source = new URL(binding.source); } catch { throw new DataError("format"); }
      if (typeof binding.source !== "string" || binding.source.length > 8192 || !["http:", "https:"].includes(source.protocol) || source.username || source.password) throw new DataError("format");
    }
  }
  return value;
}

function nextId(store) {
  if (!Number.isSafeInteger(store.identity.counter + 1)) throw new DataError("storage");
  return `${store.identity.prefix}-${(++store.identity.counter).toString(36)}`;
}

function putRecord(store, kind, value, id = kind === "settings" ? "playback-settings" : nextId(store)) {
  const variants = store.library.records.filter(record => record.id === id);
  if (variants.length && variants[0].kind !== kind) throw new DataError("identity");
  if (variants.length && canonical(variants[0].value) === canonical(value)) return variants[0];
  const updatedAt = Math.max(Date.now(), ...variants.map(record => record.updatedAt + 1));
  if (!Number.isSafeInteger(updatedAt)) throw new DataError("storage");
  const record = { id, kind, updatedAt, value: clone(value) };
  const idx = store.library.records.findIndex(saved => saved.id === id);
  if (idx < 0) store.library.records.push(record);
  else store.library.records[idx] = record;
  return record;
}

function activeBinding(store, key) {
  const binding = Object.hasOwn(store.bindings, key) ? store.bindings[key] : undefined;
  if (!binding) return undefined;
  const media = store.library.records.find(record => record.id === binding.mediaId);
  const progress = store.library.records.find(record => record.id === binding.progressId);
  return media?.kind === "media" && progress?.kind === "progress" && progress.value.mediaId === media.id ? { ...binding, generation: store.identity.generation } : undefined;
}

function bindMedia(store, key, mediaId, access = {}) {
  if (!keyValid(key)) throw new DataError("format");
  const progressId = `p-${hash(`${store.identity.prefix}:${mediaId}`)}`;
  const progress = primary(store.library).find(record => record.id === progressId && record.kind === "progress" && record.value.mediaId === mediaId);
  if (!progress) putRecord(store, "progress", { mediaId, position: 0, duration: 0, completed: false }, progressId);
  store.bindings[key] = { mediaId, progressId, ...access };
  return { mediaId, progressId, generation: store.identity.generation };
}

function bindLocal(store, entry) {
  if (!keyValid(entry.key) || (entry.file !== null && !validFile(entry.file)) || (entry.path !== undefined && !pathValid(entry.path))) throw new DataError("format");
  const existing = activeBinding(store, entry.key);
  if (existing) {
    if (entry.path) store.bindings[entry.key].path = entry.path;
    const media = store.library.records.find(record => record.id === existing.mediaId);
    if (!media.value.file && entry.file && media.value.sourceId === null) putRecord(store, "media", { ...media.value, file: entry.file }, media.id);
    return { mediaId: existing.mediaId, progressId: existing.progressId, generation: store.identity.generation };
  }
  const matches = entry.file ? primary(store.library).filter(record => record.kind === "media" && record.value.file && canonical(record.value.file) === canonical(entry.file)) : [];
  const mediaId = matches.length === 1 ? matches[0].id : putRecord(store, "media", { title: entry.name, mediaType: entry.kind, file: entry.file, sourceId: null }).id;
  return bindMedia(store, entry.key, mediaId, entry.path ? { path: entry.path } : {});
}

function bindSource(store, entry) {
  if (!keyValid(entry.key)) throw new DataError("format");
  const matching = primary(store.library).find(record => record.kind === "source" && record.value.url === entry.url);
  const sourceId = matching?.id ?? `s-${hash(entry.url)}`;
  putRecord(store, "source", { title: entry.title, url: entry.url, sourceType: "video" }, sourceId);
  const matchingMedia = primary(store.library).find(record => record.kind === "media" && record.value.sourceId === sourceId);
  const mediaId = matchingMedia?.id ?? `m-${hash(entry.url)}`;
  const previous = matchingMedia?.value;
  putRecord(store, "media", { title: entry.title, mediaType: entry.kind ?? "video", file: previous?.file ?? null, sourceId }, mediaId);
  const existing = Object.hasOwn(store.bindings, entry.key) ? store.bindings[entry.key] : {};
  return bindMedia(store, entry.key, mediaId, { ...(existing.path ? { path: existing.path } : {}), source: entry.url });
}

function advanceGeneration(store) {
  store.identity.generation++;
  for (const record of store.library.records) {
    if (!record.id.startsWith(store.identity.prefix + "-")) continue;
    const counter = Number.parseInt(record.id.slice(store.identity.prefix.length + 1), 36);
    if (Number.isSafeInteger(counter) && record.id === `${store.identity.prefix}-${counter.toString(36)}`) store.identity.counter = Math.max(store.identity.counter, counter);
  }
}

export async function createLibraryStore(profile) {
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const filename = join(profile, "library.json");
  let store;
  let created = false;
  try {
    if ((await stat(filename)).size > MAX_BYTES * 3) throw new DataError("size");
    store = validateStore(JSON.parse(await readFile(filename, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    store = { version: 1, identity: { prefix: `d${randomBytes(16).toString("hex")}`, counter: 0, generation: 0, revision: 0 }, library: { schemaVersion: 1, records: [] }, bindings: {}, previous: null, migrated: false };
    putRecord(store, "settings", defaultSettings);
    created = true;
  }
  if (created) {
    await writeFile(`${filename}.pending`, JSON.stringify(store), { mode: 0o600 });
    await rename(`${filename}.pending`, filename);
  }
  let serial = Promise.resolve();
  function transaction(action) {
    const result = serial.then(async () => {
      const draft = clone(store);
      const value = await action(draft);
      validateStore(draft);
      if (canonical(draft) !== canonical(store)) {
        draft.identity.revision++;
        validateStore(draft);
        try {
          await writeFile(`${filename}.pending`, JSON.stringify(draft), { mode: 0o600 });
          await rename(`${filename}.pending`, filename);
        } catch (error) { throw Object.assign(new DataError("storage"), { cause: error }); }
        store = draft;
      }
      return clone(value);
    });
    serial = result.catch(() => {});
    return result;
  }
  const api = {
    snapshot: () => clone(store.library),
    generation: () => store.identity.generation,
    deviceId: () => store.identity.prefix,
    revision: () => store.identity.revision,
    recovery: () => clone(store.previous),
    binding: key => { const binding = activeBinding(store, key); return binding ? { mediaId: binding.mediaId, progressId: binding.progressId, generation: binding.generation } : undefined; },
    resolve(mediaId) {
      const entries = Object.entries(store.bindings).filter(([key]) => activeBinding(store, key)?.mediaId === mediaId);
      const entry = entries.find(([, binding]) => binding.path) ?? entries[0];
      return entry ? clone({ key: entry[0], ...entry[1] }) : undefined;
    },
    bindLocal: entry => transaction(draft => bindLocal(draft, entry)),
    bindSource: entry => transaction(draft => bindSource(draft, entry)),
    bindAlias(key, mediaId, path) {
      return transaction(draft => {
        if (!draft.library.records.some(record => record.id === mediaId && record.kind === "media") || (path !== undefined && !pathValid(path))) throw new DataError("reference");
        return bindMedia(draft, key, mediaId, path ? { path } : {});
      });
    },
    put: (kind, value, id) => transaction(draft => putRecord(draft, kind, value, id)),
    position(binding) {
      if (binding.generation !== store.identity.generation) throw new DataError("changed");
      const progress = store.library.records.find(record => record.id === binding.progressId && record.kind === "progress" && record.value.mediaId === binding.mediaId);
      if (!progress) throw new DataError("changed");
      return progress.value.completed ? 0 : progress.value.position;
    },
    saveProgress(binding, position, duration, completed) {
      return transaction(draft => {
        if (binding.generation !== draft.identity.generation) throw new DataError("changed");
        const progress = draft.library.records.find(record => record.id === binding.progressId && record.kind === "progress" && record.value.mediaId === binding.mediaId);
        if (!progress) throw new DataError("changed");
        return putRecord(draft, "progress", { mediaId: binding.mediaId, position: completed ? 0 : position, duration, completed }, binding.progressId);
      });
    },
    importLibrary(incoming, preferIncoming = false) {
      const checked = clone(validateLibrary(incoming));
      return transaction(draft => {
        const merged = mergeLibraries(draft.library, checked, preferIncoming);
        if (merged.changed) {
          draft.previous = { createdAt: Date.now(), library: clone(draft.library) };
          draft.library = merged.library;
          advanceGeneration(draft);
        }
        return merged;
      });
    },
    restorePrevious(expected) {
      return transaction(draft => {
        if (!draft.previous) throw new DataError("storage");
        if (expected !== undefined && canonical(draft.previous) !== expected) throw new DataError("changed");
        const previous = draft.previous.library;
        draft.previous = { createdAt: Date.now(), library: clone(draft.library) };
        draft.library = previous;
        advanceGeneration(draft);
      });
    },
    exportArchive: async () => { await serial; return encodeArchive(store.library); },
    importArchive: async (text, preferIncoming = false) => api.importLibrary((await decodeArchive(text)).payload, preferIncoming),
    migrateLegacy(legacy) {
      return transaction(async draft => {
        if (draft.migrated) return false;
        const settings = { speed: legacy.speed, backward: legacy.backward, forward: legacy.forward };
        if (validSettings(settings)) putRecord(draft, "settings", settings);
        for (const source of legacy.links ?? []) {
          const binding = bindSource(draft, { key: source.id, title: source.name, url: source.url, kind: source.kind });
          const position = legacy.positions?.[source.id];
          if (Number.isFinite(position) && position >= 0) putRecord(draft, "progress", { mediaId: binding.mediaId, position, duration: 0, completed: false }, binding.progressId);
        }
        for (const entry of legacy.recent ?? []) {
          let file = null;
          try { const metadata = await stat(entry.path); if (metadata.isFile()) file = { name: entry.name, size: metadata.size, lastModified: Math.trunc(metadata.mtimeMs) }; } catch { /* Keep unavailable files for later relinking. */ }
          const sourceKey = legacy.sourceBindings?.[entry.id];
          const source = sourceKey ? activeBinding(draft, sourceKey) : undefined;
          const binding = source ? bindMedia(draft, entry.id, source.mediaId, { path: entry.path }) : bindLocal(draft, { key: entry.id, name: entry.title ?? entry.name, kind: entry.kind, file, path: entry.path });
          const position = legacy.positions?.[sourceKey ?? entry.id];
          if (Number.isFinite(position) && position >= 0) putRecord(draft, "progress", { mediaId: binding.mediaId, position, duration: 0, completed: false }, binding.progressId);
        }
        draft.migrated = true;
        return true;
      });
    },
  };
  return api;
}
