# Library archive v1

The implemented archive is a UTF-8 JSON file. It contains library data only. Media bytes, local file paths, Android URI grants, credentials, and derived indexes are not part of this format. User text and public source links remain user data; this is not a text-redaction format. Archives are unencrypted. This first implementation has a browser adapter; it does not capture desktop or Android native playback stores.

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

Each record has exactly `id`, `kind`, `updatedAt`, and `value`. IDs match `[a-z][a-z0-9_-]{0,95}`. `updatedAt` is nonnegative integer Unix milliseconds; it is not used to pick a winner during import. The browser allocates IDs with an installation-local random prefix and a transaction-owned counter. Imports keep existing IDs and advance the local counter when needed to avoid reuse. Playback settings use the reserved ID `playback-settings`.

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

Playback and cue positions are nonnegative seconds, including fractional values. History dates use integer Unix milliseconds. Settings keep the player's 0.25–3× speed and 1–600 second seek-interval bounds. Original retrieved text and its local edited copy remain separate. Editing UI, subtitle extraction, history recording, and playlists are later work; the schema can already retain their records during archive import/export.

## Merge and recovery

Different variants may have the same ID and kind. The first variant is active. Exact canonical duplicates are rejected inside an archive and skipped when merging two valid libraries. Import keeps both local and incoming variants. The user may explicitly put archive variants first; the default keeps local variants first. Timestamp order does not resolve conflicts and maximum playback position does not override an intentional rewind.

Browser records are separate IndexedDB rows. Playback updates the active progress row, retaining other imported variants. Import re-reads the current library and merges in one transaction, storing a pre-import snapshot in that transaction. No-change imports do not replace the recovery copy. Restoring the local copy swaps it with the current library in one transaction, allowing the replaced data to be recovered. This is one local recovery slot, not an external or scheduled backup; export a file to keep a durable independent copy.

Import/restore increments a generation counter. Players opened with an older generation cannot save progress, settings, or new bindings. They pause on the next failed progress checkpoint and ask for a page reload. The initiating player is stopped before applying an import; reselect the media file afterward.

## Browser migration and file matching

The adapter migrates valid `shravanam.position.*` and `shravanam.playback.settings` localStorage entries once. It retains the original entries. Invalid legacy entries are counted and reported; they remain in the old storage but are absent from the new archive. A failed migration transaction does not mark migration complete.

File bindings are local and are not exported. On reopening a file without a valid binding, the browser can reuse exactly one media record with matching filename, size, and modification time. This is a metadata match, not content verification. If several distinct records match, a new record is created rather than silently merging them. Renamed or changed files need future explicit relinking support. Reopening an already bound file uses its existing logical media ID.

Native adapters, per-device synchronization revisions, deletion markers, explicit conflict editing, media attachments, encryption, selected-item export, and cloud destinations are not part of v1's current implementation.
