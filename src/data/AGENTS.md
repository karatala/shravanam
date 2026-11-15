# Library Data

## Purpose

- Own the shared logical library model, portable archive codec, and browser persistence adapter. Desktop uses this format through its host-owned adapter; Android migration remains pending.

## Ownership

- `model.ts` defines and validates versioned records and references. Imported variants with the same logical ID are preserved; array order selects the current version.
- `archive.ts` owns bounded JSON archives, canonical SHA-256 integrity checks, and non-destructive merge previews.
- `browser-store.ts` owns IndexedDB transactions, legacy browser migration, local file bindings, recent-file handles, and one recoverable pre-import snapshot.
- `../../desktop/library-store.js` owns desktop `library.json`, stable device identity, local bindings, legacy playback migration, atomic writes, and recovery under `desktop/AGENTS.md`. `../../desktop/webdav.js` owns the first manual synchronization transport.
- `FORMAT.md` documents archive v1, record fields, merge priority, limits, and remaining platform work.

## Local Contracts

- Archives contain data only, without media bytes, file-system paths, permission grants, credentials, website sessions, download indexes, userscripts, device-local timer/voice settings, or search caches. SHA-256 detects damage; it does not authenticate or encrypt an archive.
- Reject unsupported versions, unknown fields, invalid references, and oversized input before changing storage. Do not silently discard unfamiliar data.
- A repeated import must not duplicate identical records. Keep conflicting variants; using an archive version changes priority, not retention.
- Save the previous library in the same transaction as import/restore. A failed transaction must keep the current library and recovery snapshot intact.
- Keep import previews as plain data, outside deep reactive proxies, so IndexedDB can clone their records.
- Browser playback writes update one record, not a whole library snapshot. Use transaction-owned identity counters and local bindings. Preserve legacy localStorage after migration.
- Increment the storage generation on import/restore. Reject writes from players opened against an older generation so another tab cannot overwrite restored progress.
- Keep the bounded recent list and file handles in local metadata, outside portable archives and recovery snapshots. Filter recent entries against active media records after import/restore. Never persist browser File objects or media blobs for this feature.
- Desktop migrates `playback.json` without clearing the original. Its library is authoritative for logical records and progress; recent paths and playback mode stay local. Do not merge browser and desktop profiles automatically or describe browser exports as backups of another adapter's store.
- Desktop online and downloaded copies share a canonical source identity. Local file relinking requires one matching filename/size/modification-time tuple; this is metadata matching, not content verification. Renamed/changed-file relinking and Android migration remain pending.
- Desktop progress IDs identify device and media. Preserve other device positions and intentional rewinds; a new device must not select a resume position by maximum time or wall-clock order.
- The Bun host caches stable player progress and saves it after engine disconnect. Export/import/restore and synchronization must flush progress first. A failed flush blocks the data action and keeps active progress ownership.
- Manual desktop WebDAV publishes separate device archives with conditional ETag writes and preserves record variants. It does not implement causal revisions, deletion markers, a durable outgoing queue, or automatic scheduling. Session passwords stay outside the library and exports.

## Work Guidance

## Verification

- `bun test tests/library-store.test.js tests/webdav.test.js tests/media-library.test.js tests/media-library-review.test.js` checks desktop data migration, archive privacy, conflicts, recovery, per-device progress, manual synchronization, and playback snapshot boundaries.

## Child DOX Index
