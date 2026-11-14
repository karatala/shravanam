# [ ] Data, synchronization, and recovery

This plan separates implemented source from remaining design and verification. The first shared record model and JSON archive codec are implemented, with browser IndexedDB persistence, legacy browser migration, import/export, and local pre-import recovery. Native adapters and remote synchronization remain pending. Self-hosting, WebDAV, and cloud services are requested options; no remote provider or native database engine is selected. See `src/data/FORMAT.md` for archive v1. Browser behavior still needs runtime verification.

## Confirmed scope

- ✅ Keep the user's library data portable: watched/listened history, positions, completion, media/source metadata, descriptions, imported comments, subtitles, transcripts, chapters, bookmarks, personal notes, playlists, and relevant settings.
- ✅ Support synchronization across devices, export, import, backup, and restore. Keep local use available without an account or network connection.
- ✅ Evaluate a self-hosted service, WebDAV, and cloud storage. Keep the data format independent of any one provider.
- [ ] Decide whether media bytes, covers, attachments, and recorded sleep signals sync by default, on request, or only through backups. A library-data backup must clearly say when media is excluded.

## [ ] Local storage and identity

- ✅ Define versioned records for media, sources, progress, history, notes, bookmarks, text/captions, chapters, playlists, and playback settings. Use IndexedDB for the first browser adapter; native storage remains to be selected.
- ✅ Allocate opaque browser record IDs with a local random prefix and a transaction-owned counter. Archives retain IDs and references; local bindings and permissions are excluded.
- [ ] Define stable synchronization device identity and native record allocation. Never use a local path or access token as a shared identity.
- [ ] Link online and offline copies to the same logical item using source identifiers and verified file metadata/content identity. Do not merge books only because their titles match.
- ✅ Model original and edited text separately, with target, role, language, and timed cues. Preserve conflicting record variants on archive merge. Source refresh and text editing remain separate features.
- ✅ Migrate valid browser positions/settings from localStorage in one transaction and retain the originals. Report invalid legacy entries excluded from migration/export.
- [ ] Migrate desktop `playback.json` and Android SharedPreferences through native adapters without clearing originals. Preserve local bindings and native background progress ownership.
- [ ] Let the native playback owner persist progress while the WebView is absent. Define a consistent snapshot boundary shared by playback, synchronization, export, and backup.
- [ ] Separate primary records and attachments from rebuildable search indexes, caches, logs, and downloaded-media caches.

## [ ] Synchronization protocol

Proposed direction: local writes first, a durable outgoing change queue, and independent storage/service adapters. Synchronize records and revisions rather than letting two devices overwrite a live database file.

- [ ] Record stable change IDs, record revisions, device identity, and deletion markers. Make retries and repeated downloads safe; do not rely only on device wall clocks for ordering.
- [ ] Support offline edits, reconnect, interrupted transfer, and resuming without duplicate records. Publish attachments completely before referencing them as available.
- [ ] Detect concurrent edits. Preserve both note/text versions until a defined merge or user choice; do not silently discard text.
- [ ] Define progress conflict rules separately from text edits. Keep each device's recent progress so an intentional rewind or reread is not replaced simply by the furthest position.
- [ ] Define deletion/restore behavior, disconnected-device return, retention of deletion markers, and recovery of accidentally deleted records. Sync deletion is not a substitute for backup.
- [ ] Show pending changes, last successful sync, offline state, errors, and conflicts. Provide manual sync, pause, disconnect, and retry actions; decide automatic scheduling later.
- [ ] Keep one active destination in the first implementation unless a concrete multi-destination policy is selected. Switching destinations must preview whether data is merged, uploaded, or restored; it must not clear local data.

## [ ] Destination evaluation

| Candidate | Intended use | Questions before selection |
| --- | --- | --- |
| Self-hosted API | User-operated service with revision-aware writes | Authentication, deployment, storage, concurrency, migrations, and server backup |
| WebDAV | User-operated or hosted file storage | Conditional writes/ETags, safe publication, concurrent devices, listing cost, and browser CORS |
| Object storage, including S3-compatible services | Hosted or self-hosted buckets | Scoped credentials, conditional writes, revision retention, transfer costs, and browser access |
| Cloud-drive APIs | Existing cloud accounts | Provider choice, OAuth on desktop/Android/PWA, app-scoped access, quotas, and conflict handling |
| Local folder | Portable archives or use with an existing file-sync tool | Atomic snapshots, incomplete files, lock behavior, and changes from another device |

- [ ] Choose the first adapter after the common data model and offline export/restore work. Keep unsupported provider capabilities explicit rather than implying parity.
- [ ] Select authentication and credential storage per platform. Keep tokens/passwords in protected local storage and outside logs and ordinary exports.
- [ ] Decide whether synchronized data and backups need client-side encryption, how devices are paired, and how recovery keys are stored. Explain the effect of losing a recovery key before enabling encryption.

## [ ] Portable export and import

- ✅ Implement documented JSON archive v1 with schema/version, creation time, structured records, and canonical SHA-256 integrity checks. The current archive excludes media and attachments and needs no provider.
- [ ] Add optional attachments/media with explicit size and storage policies.
- [ ] Offer complete and selected-item exports. Include references between books, notes, subtitles, chapters, playlists, and sources; preserve original text and local edits.
- [ ] Evaluate JSON for structured data and interoperable text exports such as Markdown notes and SRT/VTT subtitles. These convenience exports do not replace a complete restore archive.
- ✅ Validate schema, checksum, exact fields, record identity and references, and the 16 MiB/20,000-variant limits before browser import. Reject unsupported or invalid input without changing storage.
- ✅ Show import counts and version conflicts. Keep both variants; local versions stay active unless the user chooses archive versions. Repeated imports skip identical records.
- ✅ Apply browser merges and pre-import snapshots in one IndexedDB transaction. Restore swaps the previous copy with the current library; stale players cannot overwrite restored records.
- [ ] Add transactional native import and explicit relinking for renamed/changed files. Browser matching currently uses a unique filename/size/modification-time match, not content hashing. Do not import another device's local permissions as usable access.
- [ ] Exclude credentials, active sessions, device grants, and machine-specific paths by default. Include only portable settings; local device preferences need separate treatment.

## [ ] Backup and restore

- ✅ Export a browser library snapshot after flushing the active player. Keep one local recovery snapshot before changed imports and swap it on restore. Downloaded JSON files are the independent manual backups.
- [ ] Add snapshots from native background playback owners. Do not copy an actively changing database file as if it were a complete backup.
- [ ] Define optional scheduled backups, destinations, retention count/age, storage limits, and behavior while offline. Rotate old backups only after a new complete backup is verified.
- [ ] Keep recoverable historical snapshots independent of ongoing synchronization so a bad edit or deletion does not replace every recovery copy.
- [ ] Show backup date, schema version, contents, media inclusion, encryption state, and integrity status. Define recovery for interrupted writes and insufficient space.
- [ ] Verify an archive in isolation before restoring. Preserve current data until restore commits successfully.

## [ ] Implementation order and acceptance

Completed source: shared records, archive validation/merge, browser persistence/migration, and browser data tools. Editing notes/playlists/text, native adapters, and remote synchronization are not implied by schema support.

Browser verification: reopen a file at its migrated position; export/import an archive; repeat import without duplicates; choose a different archive version and retain both variants; restore the previous copy; verify malformed/checksum-invalid input leaves current data intact; verify a second tab cannot overwrite restored progress. Also check cancelled import, quota failure, and file reselection after restore.

1. [ ] Define the shared model, stable identity, migrations, and progress ownership across desktop, Android, and browser.
2. [ ] Implement local persistence plus portable export/import and manual backup/restore.
3. [ ] Specify conflict rules and the change protocol; choose and implement one sync destination.
4. [ ] Add automatic sync/backups and additional adapters after recovery and concurrent edits work.

Acceptance: export on desktop and import on Android without losing notes, subtitle timing, playlists, history, or progress; repeat import without duplication; edit the same note on two offline devices and retain both changes; preserve intentional rewinds; retry interrupted transfers; restore after deletion; reject a corrupt archive without changing the current library; keep media and access credentials within the chosen export scope.
