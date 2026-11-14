export type FileIdentity = { name: string; size: number; lastModified: number };
export type PlaybackSettings = { speed: number; backward: number; forward: number };
export type Values = {
  media: { title: string; mediaType: "audio" | "video"; file: FileIdentity | null; sourceId: string | null };
  source: { title: string; url: string; sourceType: "video" | "channel" | "playlist" | "site" };
  progress: { mediaId: string; position: number; duration: number; completed: boolean };
  history: { mediaId: string; startedAt: number; endedAt: number; from: number; to: number };
  note: { targetId: string; text: string; time: number | null };
  bookmark: { mediaId: string; time: number; label: string };
  text: { targetId: string; role: "description" | "comment" | "subtitle" | "transcript"; language: string; original: string; edited: string | null; cues: { start: number; end: number; text: string }[] };
  chapter: { mediaId: string; start: number; end: number; title: string };
  playlist: { title: string; mediaIds: string[] };
  settings: PlaybackSettings;
};
export type RecordKind = keyof Values;
export type LibraryRecord = { [Kind in RecordKind]: { id: string; kind: Kind; updatedAt: number; value: Values[Kind] } }[RecordKind];
export type Library = { schemaVersion: 1; records: LibraryRecord[] };
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_RECORDS = 20000;
export const defaultSettings: PlaybackSettings = { speed: 1, backward: 15, forward: 30 };
export class DataError extends Error {
  constructor(public code: "format" | "version" | "size" | "integrity" | "reference" | "identity" | "changed" | "storage") { super(code); }
}
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
function assert(condition: unknown, code: DataError["code"] = "format"): asserts condition { if (!condition) throw new DataError(code); }
function object(value: unknown, keys: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  const expected = keys.split(" ");
  assert(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)));
}
const string = (value: unknown, max = 1000000): value is string => typeof value === "string" && value.length <= max;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{0,95}$/.test(value);
export function validFile(value: unknown): value is FileIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as FileIdentity;
  return Object.keys(file).sort().join(",") === "lastModified,name,size" && string(file.name, 1024) && file.name.length > 0 && !/[\\/\0]/.test(file.name) && Number.isSafeInteger(file.size) && file.size >= 0 && Number.isSafeInteger(file.lastModified) && file.lastModified >= 0;
}
export function validSettings(value: unknown): value is PlaybackSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as PlaybackSettings;
  return Object.keys(settings).sort().join(",") === "backward,forward,speed" && number(settings.speed) && settings.speed >= 0.25 && settings.speed <= 3 && [settings.backward, settings.forward].every(interval => Number.isInteger(interval) && interval >= 1 && interval <= 600);
}
export function validateLibrary(input: unknown): Library {
  object(input, "schemaVersion records");
  assert(input.schemaVersion === 1, "version");
  assert(Array.isArray(input.records));
  assert(input.records.length <= MAX_RECORDS, "size");
  const kinds = new Map<string, RecordKind>();
  const variants = new Set<string>();
  const references: { target: string; allowed: RecordKind[] }[] = [];
  for (const record of input.records) {
    object(record, "id kind updatedAt value");
    assert(id(record.id) && Number.isSafeInteger(record.updatedAt) && number(record.updatedAt));
    assert(record.id !== "playback-settings" || record.kind === "settings", "identity");
    const value = record.value;
    const reference = (target: unknown, allowed: RecordKind[]) => { assert(id(target)); references.push({ target, allowed }); };
    switch (record.kind) {
      case "media":
        object(value, "title mediaType file sourceId");
        assert(string(value.title, 4096) && string(value.mediaType, 16) && ["audio", "video"].includes(value.mediaType) && (value.file === null || validFile(value.file)));
        if (value.sourceId !== null) reference(value.sourceId, ["source"]);
        break;
      case "source": {
        object(value, "title url sourceType");
        assert(string(value.title, 4096) && string(value.url, 8192) && string(value.sourceType, 16) && ["video", "channel", "playlist", "site"].includes(value.sourceType));
        let url: URL;
        try { url = new URL(value.url); } catch { throw new DataError("format"); }
        assert(["http:", "https:"].includes(url.protocol) && !url.username && !url.password);
        break;
      }
      case "progress":
        object(value, "mediaId position duration completed"); reference(value.mediaId, ["media"]);
        assert(number(value.position) && number(value.duration) && typeof value.completed === "boolean");
        break;
      case "history":
        object(value, "mediaId startedAt endedAt from to"); reference(value.mediaId, ["media"]);
        assert(number(value.startedAt) && Number.isSafeInteger(value.startedAt) && number(value.endedAt) && Number.isSafeInteger(value.endedAt) && value.endedAt >= value.startedAt && number(value.from) && number(value.to));
        break;
      case "note":
        object(value, "targetId text time"); reference(value.targetId, ["media", "source"]);
        assert(string(value.text) && (value.time === null || number(value.time)));
        break;
      case "bookmark":
        object(value, "mediaId time label"); reference(value.mediaId, ["media"]);
        assert(number(value.time) && string(value.label, 4096));
        break;
      case "text":
        object(value, "targetId role language original edited cues"); reference(value.targetId, ["media", "source"]);
        assert(string(value.role, 16) && ["description", "comment", "subtitle", "transcript"].includes(value.role) && string(value.language, 128) && string(value.original) && (value.edited === null || string(value.edited)) && Array.isArray(value.cues) && value.cues.length <= 100000);
        for (const cue of value.cues) { object(cue, "start end text"); assert(number(cue.start) && number(cue.end) && cue.end >= cue.start && string(cue.text)); }
        break;
      case "chapter":
        object(value, "mediaId start end title"); reference(value.mediaId, ["media"]);
        assert(number(value.start) && number(value.end) && value.end >= value.start && string(value.title, 4096));
        break;
      case "playlist":
        object(value, "title mediaIds"); assert(string(value.title, 4096) && Array.isArray(value.mediaIds) && value.mediaIds.length <= MAX_RECORDS);
        for (const mediaId of value.mediaIds) reference(mediaId, ["media"]);
        break;
      case "settings": assert(record.id === "playback-settings" && validSettings(value)); break;
      default: throw new DataError("format");
    }
    const kind = record.kind as RecordKind;
    assert(!kinds.has(record.id) || kinds.get(record.id) === kind, "identity");
    kinds.set(record.id, kind);
    const signature = canonical(record);
    assert(!variants.has(signature)); variants.add(signature);
  }
  for (const reference of references) assert(reference.allowed.includes(kinds.get(reference.target)!), "reference");
  assert(new TextEncoder().encode(JSON.stringify(input)).length <= MAX_BYTES, "size");
  return input as Library;
}
