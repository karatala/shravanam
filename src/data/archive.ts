import { canonical, DataError, MAX_BYTES, validateLibrary, type Library } from "./model";

export type Archive = { format: "shravanam-library"; version: 1; createdAt: number; mediaIncluded: false; payload: Library; sha256: string };
async function digest(value: unknown) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, "0")).join("");
}
export async function encodeArchive(library: Library): Promise<string> {
  const body = { format: "shravanam-library" as const, version: 1 as const, createdAt: Date.now(), mediaIncluded: false as const, payload: validateLibrary(library) };
  const result = JSON.stringify({ ...body, sha256: await digest(body) });
  if (new TextEncoder().encode(result).length > MAX_BYTES) throw new DataError("size");
  return result;
}
export async function decodeArchive(source: string): Promise<Archive> {
  if (new TextEncoder().encode(source).length > MAX_BYTES) throw new DataError("size");
  let archive: Archive;
  try { archive = JSON.parse(source); } catch { throw new DataError("format"); }
  if (!archive || typeof archive !== "object" || Object.keys(archive).sort().join(",") !== "createdAt,format,mediaIncluded,payload,sha256,version" || archive.format !== "shravanam-library" || archive.mediaIncluded !== false) throw new DataError("format");
  if (archive.version !== 1) throw new DataError("version");
  if (!Number.isSafeInteger(archive.createdAt) || archive.createdAt < 0 || archive.createdAt > 8640000000000000 || typeof archive.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(archive.sha256)) throw new DataError("format");
  validateLibrary(archive.payload);
  const { sha256, ...body } = archive;
  if (await digest(body) !== sha256) throw new DataError("integrity");
  return archive;
}
export function mergeLibraries(local: Library, incoming: Library, preferIncoming = false) {
  validateLibrary(local); validateLibrary(incoming);
  const current = new Map(local.records.map(record => [record.id, record.kind]));
  const known = new Set(local.records.map(canonical));
  const conflicts = new Set<string>();
  const added = new Set<string>();
  let duplicates = 0;
  for (const record of incoming.records) {
    if (current.has(record.id) && current.get(record.id) !== record.kind) throw new DataError("identity");
    if (known.has(canonical(record))) duplicates++;
    else if (current.has(record.id)) conflicts.add(record.id);
    else added.add(record.id);
  }
  const seen = new Set<string>();
  const records = (preferIncoming ? [...incoming.records, ...local.records] : [...local.records, ...incoming.records]).filter(record => {
    const signature = canonical(record);
    if (seen.has(signature)) return false;
    seen.add(signature); return true;
  });
  const library = validateLibrary({ schemaVersion: 1, records });
  return { library, added: added.size, conflicts: conflicts.size, duplicates, changed: canonical(library) !== canonical(local) };
}
