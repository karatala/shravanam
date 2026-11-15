# Library archive v1

The implemented archive is a UTF-8 JSON file. It contains library data only. Media bytes, local file paths, Android URI grants, credentials, website sessions, download indexes, userscripts, device-local timer/voice settings, and derived indexes are not part of this format. User text and public source links remain user data; this is not a text-redaction format. Archives are unencrypted. Browser and desktop adapters export this format from their own stores. Android native playback migration and archive tools remain pending.

## Envelope

| Field | Value |
| --- | --- |
| `format` | `shravanam-library` |
| `version` | `1` |
| `createdAt` | Nonnegative integer Unix milliseconds |
| `mediaIncluded` | `false` |
| `payload` | `{ "schemaVersion": 1, "records": [...] }` |
| `sha256` | Lowercase SHA-256 of the canonical envelope with `sha256` omitted |

Canonical encoding recursively sorts object keys with JavaScript string ordering, preserves array order, uses JSON string/number encoding, and adds no whitespace. SHA-256 uses its UTF-8 bytes. The checksum detects altered content; it is not a signature. Object-field order and formatting outside strings do not affect validation.

The archive limit is 16 MiB; the payload allows at most 20,000 record variants. String and collection limits are enforced by `model.ts`. Unknown fields and versions are rejected rather than discarded. References must resolve within the archive. A record ID cannot be shared by different kinds.

## Records

Each record has exactly `id`, `kind`, `updatedAt`, and `value`. IDs match `[a-z][a-z0-9_-]{0,95}`. `updatedAt` is nonnegative integer Unix milliseconds; it is not used to pick a winner during import. Browser and desktop local records use installation-local random prefixes and transaction-owned counters. Imports keep IDs and advance the local counter when needed to avoid reuse. Playback settings use the reserved ID `playback-settings`.

Desktop source and media IDs are `s-` and `m-` followed by the SHA-256 of the canonical source URL. This links known online and downloaded copies without comparing titles. Desktop progress IDs are `p-` followed by the SHA-256 of device ID, `:`, and media ID. A different device therefore has a separate progress record. A new device starts at zero until the user selects an imported saved position. A local rewind is not replaced by another device's larger position.

| Kind | Value fields | References |
| --- | --- | --- |
| `media` | `title`, `mediaType` (audio/video), `file` (name/size/lastModified or null), `sourceId` (ID or null) | Source |
| `source` | `title`, `url`, `sourceType` (video/channel/playlist/site) | None; HTTP(S) URLs without embedded username/password |
| `progress` | `mediaId`, `position`, `duration`, `completed` | Media |
| `history` | `mediaId`, `startedAt`, `endedAt`, `from`, `to` | Media |
| `note` | `targetId`, `text`, `time` (seconds or null) | Media or source |
| `bookmark` | `mediaId`, `time`, `label` | Media |
| `text` | `targetId`, `role` (description/comment/subtitle/transcript), `language`, `original`, `edited` (text or null), `cues` | Media or source; each cue has start/end/text |
| `chapter` | `mediaId`, `start`, `end`, `title` | Media |
| `playlist` | `title`, ordered `mediaIds` | Media |
| `settings` | `speed`, `backward`, `forward` | None |

Playback and cue positions are nonnegative seconds, including fractional values. History dates use integer Unix milliseconds. Settings keep the player's speed bounds of 0.25 to 3 and seek intervals of 1 to 600 seconds. Original retrieved text and its local edited copy remain separate. Desktop tools support playlists, chapters, notes, and local SRT/VTT subtitle import/editing. Automatic subtitle retrieval, history recording, and full editing support on Android/PWA remain separate work; archives already retain those record kinds.

## Merge and recovery

Different variants may have the same ID and kind. The first variant is active. Exact canonical duplicates are rejected inside an archive and skipped when merging two valid libraries. Import keeps both local and incoming variants. The user may explicitly put archive variants first; the default keeps local variants first. Timestamp order does not resolve conflicts and maximum playback position does not override an intentional rewind.

Browser records are separate IndexedDB rows. Playback updates the active progress row, retaining other imported variants. Import re-reads the current library and merges in one transaction, storing a pre-import snapshot in that transaction. No-change imports do not replace the recovery copy. Restoring the local copy swaps it with the current library in one transaction, allowing the replaced data to be recovered. This is one local recovery slot, not an external or scheduled backup; export a file to keep a durable independent copy.

Import/restore increments a generation counter. Browser players opened with an older generation cannot save progress, settings, or new bindings. They pause on the next failed progress checkpoint and ask for a page reload. The initiating browser player is stopped before applying an import; reselect the media file afterward. Desktop pauses playback, flushes progress, and releases the active binding before data replacement. A failed flush blocks replacement without discarding the active binding or its cached progress.

## Desktop persistence and snapshot boundary

`desktop/library-store.js` stores records, device identity/counters, local bindings, generation, and one previous library in `library.json`. Writes replace one private file atomically. Memory changes only after the replacement succeeds. Import and recovery swaps commit their records and previous copy together. The local revision counter records store changes; it is not a causal synchronization revision.

Migration reads valid `playback.json` recent files, canonical sources, positions, source aliases, and speed/seek settings once. It keeps the original file. Missing local files remain logical records with local paths for later access checks. Canonical source bindings map downloaded copies to the same media record and device progress. Native path hashes are private binding keys, not portable record IDs. Reopening an imported local file can reuse one unique filename/size/modification-time match; renamed or changed files still need explicit relinking work.

The Bun playback owner saves stable progress while the WebView is absent. It caches the last valid position before a player stop or disconnect; loading and bootstrap events cannot replace it. Export and synchronization use a serialized host snapshot after progress is saved. A failed save must block export or data replacement instead of producing a successful backup with stale progress.

Desktop archives do not copy the native profile. `playback.json`, downloaded files and indexes, userscripts, website profiles, WebDAV login settings, and timer/voice preferences stay outside the archive. Development and native application profiles remain separate. Android SharedPreferences and URI grants are not migrated by either desktop or browser exports.

## Manual WebDAV synchronization

WebDAV is the first selected synchronization adapter, implemented on desktop. The host creates `shravanam-v1/` under an HTTPS folder and uses `<deviceId>.json` for each device's archive. Preview reads at most 128 owned device filenames from a listing no larger than 1 MiB. Archive and record limits still apply. Only same-origin files in that folder are read; redirects are rejected.

Apply uploads the merged library to this device's file before importing incoming records locally. Existing files require a strong ETag and `If-Match`; a new file uses `If-None-Match: *`. A conditional-write conflict leaves local records unchanged and requires a new preview. Reads and checksum/schema validation must complete before any incoming records are imported. Repeating the same merge does not duplicate exact records. Both text variants and separate device progress remain available; this is a snapshot union, not causal conflict detection or deletion synchronization.

The password stays in host memory for the current run and must be entered again after restart. Private `webdav.json` stores only folder address, username, and last successful sync time. Disconnect clears the session password and preview without clearing library records. HTTPS protects transport; the app does not encrypt archive contents on the server. Real server permissions, strong ETags, and multi-device behavior still require a device check.

## Browser migration and file matching

The adapter migrates valid `shravanam.position.*` and `shravanam.playback.settings` localStorage entries once. It retains the original entries. Invalid legacy entries are counted and reported; they remain in the old storage but are absent from the new archive. A failed migration transaction does not mark migration complete.

File bindings are local and are not exported. On reopening a file without a valid binding, the browser can reuse exactly one media record with matching filename, size, and modification time. This is a metadata match, not content verification. If several distinct records match, a new record is created rather than silently merging them. Renamed or changed files need future explicit relinking support. Reopening an already bound file uses its existing logical media ID.

The local metadata store also keeps up to 20 recent files and optional read-only File System Access handles. Neither handles nor this device-local order are exported or included in recovery snapshots. Recent entries whose media records no longer match the active library are hidden. Startup restores the last file paused only when its handle remains readable and its metadata matches. A click can request read permission again; unsupported browsers and ordinary file-input selections require reselection. Media bytes are never copied into IndexedDB by this feature.

Android native migration, causal synchronization revisions, a durable outgoing queue, deletion markers, automatic sync/backup, full per-record conflict resolution, media attachments, encryption, selected-item export, and additional storage destinations remain pending.
