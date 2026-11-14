# Library Data

## Purpose

- Own the shared logical library model, portable archive codec, and the first browser persistence adapter.

## Ownership

- `model.ts` defines and validates versioned records and references. Imported variants with the same logical ID are preserved; array order selects the current version.
- `archive.ts` owns bounded JSON archives, canonical SHA-256 integrity checks, and non-destructive merge previews.
- `browser-store.ts` owns IndexedDB transactions, legacy browser migration, local file bindings, recent-file handles, and one recoverable pre-import snapshot.
- `FORMAT.md` documents archive v1, record fields, merge priority, limits, and remaining platform work.

## Local Contracts

- Archives contain data only, without media bytes, file-system paths, permission grants, credentials, or search caches. SHA-256 detects damage; it does not authenticate or encrypt an archive.
- Reject unsupported versions, unknown fields, invalid references, and oversized input before changing storage. Do not silently discard unfamiliar data.
- A repeated import must not duplicate identical records. Keep conflicting variants; using an archive version changes priority, not retention.
- Save the previous library in the same transaction as import/restore. A failed transaction must keep the current library and recovery snapshot intact.
- Keep import previews as plain data, outside deep reactive proxies, so IndexedDB can clone their records.
- Browser playback writes update one record, not a whole library snapshot. Use transaction-owned identity counters and local bindings. Preserve legacy localStorage after migration.
- Increment the storage generation on import/restore. Reject writes from players opened against an older generation so another tab cannot overwrite restored progress.
- Keep the bounded recent list and file handles in local metadata, outside portable archives and recovery snapshots. Filter recent entries against active media records after import/restore. Never persist browser File objects or media blobs for this feature.
- Native storage migration and cross-platform file relinking remain separate work. Do not describe browser archives as backups of desktop or Android playback stores.

## Work Guidance

## Verification

## Child DOX Index
