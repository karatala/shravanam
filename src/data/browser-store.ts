import { canonical, DataError, defaultSettings, validFile, validSettings, validateLibrary, type FileIdentity, type Library, type LibraryRecord, type PlaybackSettings, type Values } from "./model";
import { mergeLibraries } from "./archive";

type Row = { key?: number; record: LibraryRecord };
type Identity = { prefix: string; counter: number; generation: number; skippedLegacy: number };
export type Binding = { mediaId: string; progressId: string; generation: number };
type Recovery = { createdAt: number; library: Library };
const fileKey = (file: FileIdentity) => JSON.stringify([file.name, file.size, file.lastModified]);
const documentFrom = (rows: Row[]): Library => validateLibrary({ schemaVersion: 1, records: rows.map(row => row.record) });

function transaction<Result>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction, read: <Value>(request: IDBRequest<Value>, handler: (value: Value) => void) => void, finish: (result: Result) => void) => void): Promise<Result> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: Result;
    let failure: unknown;
    const fail = (error: unknown) => { failure = error; tx.abort(); };
    const read = <Value>(request: IDBRequest<Value>, handler: (value: Value) => void) => {
      request.onsuccess = () => { try { handler(request.result); } catch (error) { fail(error); } };
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new DataError("storage"));
    try { body(tx, read, value => { result = value; }); } catch (error) { fail(error); }
  });
}
function nextId(identity: Identity) {
  if (!Number.isSafeInteger(identity.counter + 1)) throw new DataError("storage");
  return `${identity.prefix}-${(++identity.counter).toString(36)}`;
}
function advanceIdentity(identity: Identity, library: Library): Identity {
  const next = { ...identity, generation: identity.generation + 1 };
  for (const record of library.records) {
    if (!record.id.startsWith(identity.prefix + "-")) continue;
    const counter = Number.parseInt(record.id.slice(identity.prefix.length + 1), 36);
    if (Number.isSafeInteger(counter) && record.id === `${identity.prefix}-${counter.toString(36)}`) next.counter = Math.max(next.counter, counter);
  }
  if (next.counter >= Number.MAX_SAFE_INTEGER - 2) {
    next.prefix = "b" + Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
    next.counter = 0;
  }
  return next;
}
function makeRecord<Kind extends keyof Values>(id: string, kind: Kind, value: Values[Kind]): LibraryRecord {
  return { id, kind, updatedAt: Date.now(), value } as LibraryRecord;
}
function legacyData() {
  const positions: { file: FileIdentity; position: number }[] = [];
  let settings = { ...defaultSettings };
  let skipped = 0;
  const savedSettings = localStorage.getItem("shravanam.playback.settings");
  if (savedSettings !== null) {
    try { const value = JSON.parse(savedSettings); if (!validSettings(value)) throw new Error(); settings = value; }
    catch { skipped++; }
  }
  for (let idx = 0; idx < localStorage.length; idx++) {
    const key = localStorage.key(idx);
    if (!key?.startsWith("shravanam.position.")) continue;
    try {
      const tuple = JSON.parse(key.slice("shravanam.position.".length));
      if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error();
      const file = { name: tuple[0], size: tuple[1], lastModified: tuple[2] };
      const raw = localStorage.getItem(key);
      const position = Number(raw);
      if (!validFile(file) || raw === null || raw.trim() === "" || !Number.isFinite(position) || position < 0 || position > Number.MAX_SAFE_INTEGER) throw new Error();
      positions.push({ file, position });
    } catch { skipped++; }
  }
  return { positions, settings, skipped };
}

async function connect() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("shravanam-library", 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore("records", { keyPath: "key", autoIncrement: true });
      records.createIndex("id", "record.id");
      records.createIndex("kind", "record.kind");
      request.result.createObjectStore("meta");
      request.result.createObjectStore("bindings");
      request.result.createObjectStore("recovery");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new DataError("storage"));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
  await transaction<void>(db, ["meta", "records", "bindings"], "readwrite", (tx, read, finish) => {
    read(tx.objectStore("meta").get("identity"), (existing: Identity | undefined) => {
      if (existing) { finish(); return; }
      const legacy = legacyData();
      const identity: Identity = { prefix: "b" + Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join(""), counter: 0, generation: 0, skippedLegacy: legacy.skipped };
      const records: LibraryRecord[] = [makeRecord("playback-settings", "settings", legacy.settings)];
      for (const entry of legacy.positions) {
        const mediaId = nextId(identity);
        const progressId = nextId(identity);
        const mediaType = /\.(mp4|m4v|webm|mkv|mov)$/i.test(entry.file.name) ? "video" : "audio";
        records.push(makeRecord(mediaId, "media", { title: entry.file.name, mediaType, file: entry.file, sourceId: null }));
        records.push(makeRecord(progressId, "progress", { mediaId, position: entry.position, duration: 0, completed: false }));
        tx.objectStore("bindings").put({ mediaId, progressId }, fileKey(entry.file));
      }
      validateLibrary({ schemaVersion: 1, records });
      for (const record of records) tx.objectStore("records").add({ record });
      tx.objectStore("meta").put(identity, "identity");
      finish();
    });
  });

  function writePrimary(id: string, record: LibraryRecord, generation?: number) {
    return transaction<void>(db, ["records", "meta"], "readwrite", (tx, read, finish) => {
      read(tx.objectStore("meta").get("identity"), (identity: Identity) => {
        if (generation !== undefined && generation !== identity.generation) throw new DataError("changed");
        const records = tx.objectStore("records");
        read(records.index("id").getAll(id), (rows: Row[]) => {
          if (!rows.length && record.kind !== "settings") throw new DataError("changed");
          if (rows.length && canonical(rows[0].record.value) === canonical(record.value)) { finish(); return; }
          record.updatedAt = Math.max(Date.now(), ...rows.map(row => row.record.updatedAt + 1));
          if (!Number.isSafeInteger(record.updatedAt)) throw new DataError("storage");
          records.put(rows.length ? { key: rows[0].key, record } : { record });
          finish();
        });
      });
    });
  }

  return {
    snapshot: () => transaction<Library>(db, ["records"], "readonly", (tx, read, finish) => read(tx.objectStore("records").getAll(), rows => finish(documentFrom(rows)))),
    recovery: () => transaction<Recovery | undefined>(db, ["recovery"], "readonly", (tx, read, finish) => read(tx.objectStore("recovery").get("previous"), finish)),
    migrationWarnings: () => transaction<number>(db, ["meta"], "readonly", (tx, read, finish) => read(tx.objectStore("meta").get("identity"), (identity: Identity) => finish(identity.skippedLegacy))),
    playbackDefaults: () => transaction<{ settings: PlaybackSettings; generation: number }>(db, ["records", "meta"], "readonly", (tx, read, finish) => read(tx.objectStore("records").index("id").get("playback-settings"), (row: Row | undefined) => {
      if (row && (row.record.kind !== "settings" || !validSettings(row.record.value))) throw new DataError("storage");
      const settings = row?.record.value as PlaybackSettings ?? { ...defaultSettings };
      read(tx.objectStore("meta").get("identity"), (identity: Identity) => finish({ settings, generation: identity.generation }));
    })),
    saveSettings(settings: PlaybackSettings, generation: number) {
      if (!validSettings(settings)) return Promise.reject(new DataError("format"));
      return writePrimary("playback-settings", makeRecord("playback-settings", "settings", settings), generation);
    },
    openMedia(file: FileIdentity, mediaType: "audio" | "video", generation: number) {
      if (!validFile(file)) return Promise.reject(new DataError("format"));
      return transaction<Binding>(db, ["records", "bindings", "meta"], "readwrite", (tx, read, finish) => {
        const records = tx.objectStore("records");
        read(tx.objectStore("meta").get("identity"), (identity: Identity) => {
          if (identity.generation !== generation) throw new DataError("changed");
          const bind = (mediaId: string, progressId: string) => {
            tx.objectStore("bindings").put({ mediaId, progressId }, fileKey(file));
            tx.objectStore("meta").put(identity, "identity");
            finish({ mediaId, progressId, generation: identity.generation });
          };
          const locate = () => read(records.index("kind").getAll("media"), (rows: Row[]) => {
            const primary = new Map<string, LibraryRecord>();
            for (const row of rows) if (!primary.has(row.record.id)) primary.set(row.record.id, row.record);
            const matches = [...primary.values()].filter(record => record.kind === "media" && record.value.file && fileKey(record.value.file) === fileKey(file));
            const mediaId = matches.length === 1 ? matches[0].id : nextId(identity);
            if (matches.length !== 1) records.add({ record: makeRecord(mediaId, "media", { title: file.name, mediaType, file, sourceId: null }) });
            read(records.index("kind").getAll("progress"), (progress: Row[]) => {
              const primaryProgress = new Map<string, Row>();
              for (const row of progress) if (!primaryProgress.has(row.record.id)) primaryProgress.set(row.record.id, row);
              const existing = [...primaryProgress.values()].find(row => row.record.kind === "progress" && row.record.value.mediaId === mediaId);
              const progressId = existing?.record.id ?? nextId(identity);
              if (!existing) records.add({ record: makeRecord(progressId, "progress", { mediaId, position: 0, duration: 0, completed: false }) });
              bind(mediaId, progressId);
            });
          });
          read(tx.objectStore("bindings").get(fileKey(file)), (binding: Binding | undefined) => {
            if (!binding) { locate(); return; }
            read(records.index("id").get(binding.progressId), (row: Row | undefined) => {
              if (row?.record.kind === "progress" && row.record.value.mediaId === binding.mediaId) bind(binding.mediaId, binding.progressId);
              else locate();
            });
          });
        });
      });
    },
    position: (binding: Binding) => transaction<number>(db, ["records", "meta"], "readonly", (tx, read, finish) => {
      read(tx.objectStore("meta").get("identity"), (identity: Identity) => {
        if (identity.generation !== binding.generation) throw new DataError("changed");
        read(tx.objectStore("records").index("id").get(binding.progressId), (row: Row | undefined) => {
          if (row?.record.kind !== "progress") throw new DataError("changed");
          finish(row.record.value.completed ? 0 : row.record.value.position);
        });
      });
    }),
    saveProgress(binding: Binding, position: number, duration: number, completed: boolean) {
      if (![position, duration].every(value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)) return Promise.reject(new DataError("format"));
      return writePrimary(binding.progressId, makeRecord(binding.progressId, "progress", { mediaId: binding.mediaId, position: completed ? 0 : position, duration, completed }), binding.generation);
    },
    importLibrary(incoming: Library, preferIncoming: boolean) {
      validateLibrary(incoming);
      return transaction<boolean>(db, ["records", "meta", "recovery"], "readwrite", (tx, read, finish) => {
        read(tx.objectStore("records").getAll(), (rows: Row[]) => {
          const local = documentFrom(rows);
          const merged = mergeLibraries(local, incoming, preferIncoming);
          if (!merged.changed) { finish(false); return; }
          read(tx.objectStore("meta").get("identity"), (identity: Identity) => {
            tx.objectStore("recovery").put({ createdAt: Date.now(), library: local }, "previous");
            tx.objectStore("records").clear();
            for (const record of merged.library.records) tx.objectStore("records").add({ record });
            tx.objectStore("meta").put(advanceIdentity(identity, merged.library), "identity");
            finish(true);
          });
        });
      });
    },
    restorePrevious(expected: string) {
      return transaction<void>(db, ["records", "meta", "recovery"], "readwrite", (tx, read, finish) => {
        read(tx.objectStore("recovery").get("previous"), (recovery: Recovery | undefined) => {
          if (!recovery) throw new DataError("storage");
          if (canonical(recovery) !== expected) throw new DataError("changed");
          validateLibrary(recovery.library);
          read(tx.objectStore("records").getAll(), (rows: Row[]) => {
            const local = documentFrom(rows);
            read(tx.objectStore("meta").get("identity"), (identity: Identity) => {
              tx.objectStore("recovery").put({ createdAt: Date.now(), library: local }, "previous");
              tx.objectStore("records").clear();
              for (const record of recovery.library.records) tx.objectStore("records").add({ record });
              tx.objectStore("meta").put(advanceIdentity(identity, recovery.library), "identity");
              finish();
            });
          });
        });
      });
    },
  };
}
let connection: ReturnType<typeof connect> | undefined;
export function browserLibrary() {
  if (!connection) connection = connect().catch(error => { connection = undefined; throw error; });
  return connection;
}
