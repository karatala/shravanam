import { validateLibrary, type Library, type LibraryRecord, type Values } from "./data/model";

export type EditableKind = "note" | "chapter" | "playlist" | "text" | "bookmark";
export type LibraryCommand = { [Kind in EditableKind]: { type: "save"; kind: Kind; id?: string; value: Values[Kind] } }[EditableKind] | { type: "play"; mediaId: string; playlistId?: string };

export function primaryRecords(library: Library): LibraryRecord[] {
  const seen = new Set<string>();
  return library.records.filter(record => { if (seen.has(record.id)) return false; seen.add(record.id); return true; });
}

export function validLibraryCommand(input: unknown): input is LibraryCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const command = input as LibraryCommand;
  const validId = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9_-]{0,95}$/.test(value);
  if (command.type === "play") return Object.keys(command).every(key => ["type", "mediaId", "playlistId"].includes(key)) && validId(command.mediaId) && (command.playlistId === undefined || validId(command.playlistId));
  if (command.type !== "save" || !["note", "chapter", "playlist", "text", "bookmark"].includes(command.kind)) return false;
  if (!Object.keys(command).every(key => ["type", "kind", "id", "value"].includes(key)) || (command.id !== undefined && !validId(command.id))) return false;
  try {
    const references = command.kind === "playlist" ? command.value.mediaIds : [command.kind === "note" || command.kind === "text" ? command.value.targetId : command.value.mediaId];
    let nextId = "edited-record";
    let counter = 0;
    while (references.includes(nextId)) nextId = `edited-record-${++counter}`;
    const record = { id: command.id ?? nextId, kind: command.kind, updatedAt: 0, value: command.value } as LibraryRecord;
    const records = [record, ...[...new Set(references)].map(mediaId => ({ id: mediaId, kind: "media", updatedAt: 0, value: { title: "", mediaType: "audio", file: null, sourceId: null } }))];
    validateLibrary({ schemaVersion: 1, records });
    return true;
  } catch { return false; }
}
