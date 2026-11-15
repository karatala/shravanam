# [ ] Data, synchronization, and recovery

This plan separates implemented source from remaining design and verification. Shared records, archive v1, browser IndexedDB, and the desktop native library adapter are implemented. Both adapters support migration, import/export, and one pre-import recovery copy. WebDAV is the selected first synchronization adapter, with manual desktop synchronization. Android migration and library tools remain pending. See `src/data/FORMAT.md` for archive v1 and adapter details.

Default `dev` uses the desktop adapter in `Shravanam-dev`; the native application uses its separate `Shravanam` profile. `library.json` owns logical records and progress. The Bun host owns writes while the interface is absent. `playback.json` is retained for legacy data, device-local recent files, paths, source aliases, and playback mode. The IndexedDB adapter and browser archive tools remain available through `dev:web` and standalone PWA output. These stores and profiles stay separate; switching modes does not migrate or erase them.

Desktop migration maps canonical YouTube sources and their downloaded copies to one logical media record. Stable source/media IDs use the canonical source URL; local files use generated IDs and local bindings. Native archives include logical records, notes, subtitles, playlists, chapters, and progress. They exclude media files, paths, URI grants, download indexes, userscripts, website sessions, credentials, and device-local timer/voice settings. Signed stream URLs and headers stay transient.

## Confirmed scope

- ✅ Keep the user's library data portable: watched/listened history, positions, completion, media/source metadata, descriptions, imported comments, subtitles, transcripts, chapters, bookmarks, personal notes, playlists, and relevant settings.
- ✅ Support synchronization across devices, export, import, backup, and restore. Keep local use available without an account or network connection.
- ✅ Evaluate a self-hosted service, WebDAV, and cloud storage. Keep the data format independent of any one provider.
- [ ] Decide whether media bytes, covers, attachments, and recorded sleep signals sync by default, on request, or only through backups. A library-data backup must clearly say when media is excluded.

## [ ] Local storage and identity

- ✅ Define versioned records for media, sources, progress, history, notes, bookmarks, text/captions, chapters, playlists, and playback settings. Use IndexedDB in the browser and an atomically replaced JSON store on desktop. Schema support does not imply history recording or every editing tool.
- ✅ Allocate opaque browser record IDs with a local random prefix and a transaction-owned counter. Archives retain IDs and references; local bindings and permissions are excluded.
- ✅ Persist a desktop device ID and native record counter. Never use a local path or access token as a shared identity. Device-local bindings stay outside archives.
- ✅ Link desktop online and downloaded copies by canonical source identity. Reuse one imported local media record only when filename, size, and modification time match uniquely; never merge by title alone.
- [ ] Add content verification and explicit relinking for renamed or changed files. Metadata matching is not a content hash.
- ✅ Model original and edited text separately, with target, role, language, and timed cues. Preserve conflicting record variants on archive merge. Source refresh and text editing remain separate features.
- ✅ Migrate valid browser positions/settings from localStorage in one transaction and retain the originals. Report invalid legacy entries excluded from migration/export.
- ✅ Keep a 20-file device-local recent list with native paths/content URIs or optional browser handles. Restore the last accessible local file paused. Access references and device-local order stay outside portable archives.
- ✅ Migrate desktop `playback.json` once without clearing it. Retain local bindings and map online/downloaded aliases to the shared library.
- [ ] Migrate Android SharedPreferences through a native adapter without clearing originals. Preserve service-owned background progress and URI access.
- ✅ Let the Bun playback owner persist progress without the WebView. Cache the last stable player position and save it after engine disconnect. Flush before export, import/restore, and synchronization; a failed flush must keep active progress ownership and block the data action.
- ✅ Keep logical records separate from downloaded media, website profiles, logs, and caches.
- [ ] Define attachment storage separately from logical records and rebuildable indexes.

## [ ] Synchronization protocol

Current desktop synchronization publishes one archive file per device under `shravanam-v1/` in an HTTPS WebDAV folder. A manual preview reads device snapshots; apply writes only this device's snapshot with a strong ETag condition, then merges the incoming records locally. A new file uses `If-None-Match: *`. Failed conditional writes leave local records unchanged and require another preview. This does not mirror a live database file or implement a causal change protocol.

- ✅ Keep stable device identity, independent device files, conditional writes, and canonical duplicate removal for manual retries. The native store's local revision counter is not a causal synchronization revision.
- [ ] Add stable change IDs, causal record revisions, a durable outgoing change queue, and deletion markers. Do not use wall clocks alone to order edits.
- ✅ Retain offline library edits and merge manual reconnects without duplicating exact records. Failed reads or invalid archives do not import a partial result.
- [ ] Add resumable attachment transfer and publish complete attachments before referencing them as available.
- ✅ Preserve different note/text variants with the same ID. Local variants stay active unless the user selects incoming versions in the preview. Personal note alternatives are visible; preservation does not identify causal versus concurrent changes.
- [ ] Add causal conflict detection and explicit per-record resolution for all editable record kinds.
- ✅ Keep desktop progress records separate by device and media. Existing device progress stays active after synchronization, including deliberate rewinds. A newly bound device starts at zero until the user chooses an imported saved position; do not select by maximum position or wall-clock order.
- [ ] Define deletion/restore behavior, disconnected-device return, retention of deletion markers, and recovery of accidentally deleted records. Sync deletion is not a substitute for backup.
- ✅ Show connection state, last successful sync, errors, device counts, and added/conflicting/duplicate record counts. Provide manual preview/apply, disconnect, and retry through a new preview.
- [ ] Add pending-change counts, explicit offline state, automatic scheduling, and pause controls for scheduled work.
- ✅ Keep one active WebDAV destination. Changing it retains local records and requires preview before publishing or importing data.

## [ ] Destination evaluation

| Candidate | Intended use | Questions before selection |
| --- | --- | --- |
| Self-hosted API | User-operated service with revision-aware writes | Authentication, deployment, storage, concurrency, migrations, and server backup |
| WebDAV | Selected first adapter for manual desktop library synchronization | Verify a real server's strong ETags, conditional writes, folder permissions, and multi-device behavior; Android/PWA transport remains pending |
| Object storage, including S3-compatible services | Hosted or self-hosted buckets | Scoped credentials, conditional writes, revision retention, transfer costs, and browser access |
| Cloud-drive APIs | Existing cloud accounts | Provider choice, OAuth on desktop/Android/PWA, app-scoped access, quotas, and conflict handling |
| Local folder | Portable archives or use with an existing file-sync tool | Atomic snapshots, incomplete files, lock behavior, and changes from another device |

- ✅ Choose WebDAV as the first adapter. Do not imply support for the other destinations or for Android/PWA synchronization.
- ✅ Use HTTPS and session-only Basic authentication on desktop. Keep the password in host memory; clear the form after connection and require the password again after restart. Persist only the address, username, and last-sync time in private `webdav.json`. Do not follow redirects or put credentials in archives or state snapshots.
- [ ] Select protected credential storage and authentication for Android/PWA and any future persistent desktop login.
- [ ] Decide whether synchronized data and backups need client-side encryption, how devices are paired, and how recovery keys are stored. Explain the effect of losing a recovery key before enabling encryption.

## [ ] Portable export and import

- ✅ Implement documented JSON archive v1 with schema/version, creation time, structured records, and canonical SHA-256 integrity checks. The current archive excludes media and attachments and needs no provider.
- [ ] Add optional attachments/media with explicit size and storage policies.
- ✅ Offer complete browser and desktop library-data exports with references between media, sources, notes, subtitles, chapters, playlists, and progress. Preserve original text and local edits.
- [ ] Add selected-item exports with all required references.
- [ ] Evaluate JSON for structured data and interoperable text exports such as Markdown notes and SRT/VTT subtitles. These convenience exports do not replace a complete restore archive.
- ✅ Validate schema, checksum, exact fields, record identity and references, and the 16 MiB/20,000-variant limits before browser or desktop import. Reject unsupported or invalid input without changing storage.
- ✅ Show import counts and version conflicts. Keep both variants; local versions stay active unless the user chooses archive versions. Repeated imports skip identical records.
- ✅ Apply browser merges and pre-import snapshots in one IndexedDB transaction. Restore swaps the previous copy with the current library; stale players cannot overwrite restored records.
- ✅ Apply desktop merges and the pre-import copy in one atomic file replacement. Restore swaps the recovery copy with the current library and advances the storage generation. Pause and release the active playback binding before a successful data replacement can become active.
- [ ] Add Android import/restore and explicit relinking for renamed/changed files on each platform. Do not treat another device's permissions as usable access.
- ✅ Exclude credentials, active sessions, device grants, and machine-specific paths. Export portable speed/seek settings; keep playback mode, timer/voice preferences, and other device settings local.

## [ ] Backup and restore

- ✅ Export a browser library snapshot after flushing the active player. Keep one local recovery snapshot before changed imports and swap it on restore. Downloaded JSON files are the independent manual backups.
- ✅ Export a consistent desktop snapshot through the Bun playback owner after flushing stable progress. Do not copy `library.json` or `playback.json` directly as a portable backup.
- [ ] Add snapshots from the Android background playback owner.
- [ ] Define optional scheduled backups, destinations, retention count/age, storage limits, and behavior while offline. Rotate old backups only after a new complete backup is verified.
- [ ] Keep recoverable historical snapshots independent of ongoing synchronization so a bad edit or deletion does not replace every recovery copy.
- [ ] Show backup date, schema version, contents, media inclusion, encryption state, and integrity status. Define recovery for interrupted writes and insufficient space.
- ✅ Validate browser and desktop archives before applying them. Atomic storage commits keep current library data and the recovery copy intact after a failed write.

## [ ] Implementation order and acceptance

Completed source: shared records and archives; browser persistence/migration and archive tools; desktop native persistence/migration, export/import/recovery, chapter and playlist tools, personal notes, local subtitle import/editing, and manual WebDAV synchronization. Android library migration and tools, causal synchronization, deletion, attachments, encryption, and automatic sync/backup remain pending.

Automated desktop checks cover migration and archive privacy, stable identities, separate device progress, conflict retention, repeat imports, recovery generations, conditional-write conflicts, malformed or oversized listings, credential exclusion, playlist EOF, engine disconnect, and failed progress flushes. The suites are `tests/library-store.test.js`, `tests/webdav.test.js`, `tests/media-library.test.js`, and `tests/media-library-review.test.js`. `tests/webdav-host.test.js` also sends real loopback HTTP requests through two native owners, with streamed responses, note/playlist/subtitle exchange, explicit device positions, 401/412 safety, and playback/timer controls during a slow preview. The user deferred real-provider verification until a WebDAV destination is available.

Browser verification: reopen a file at its migrated position; export/import an archive; repeat import without duplicates; choose a different archive version and retain both variants; restore the previous copy; verify malformed/checksum-invalid input leaves current data intact; verify a second tab cannot overwrite restored progress. Also check cancelled import, quota failure, and file reselection after restore.

1. [ ] Define the shared model, stable identity, migrations, and progress ownership across desktop, Android, and browser.
2. ✅ Implement browser and desktop persistence plus portable export/import and manual backup/restore. Android remains part of step 1.
3. [ ] Complete causal conflict and change rules. The first manual WebDAV adapter is implemented; deletion and a durable outgoing queue remain pending.
4. [ ] Add automatic sync/backups and additional adapters after recovery and concurrent edits work.

Acceptance: export on desktop and import on Android without losing notes, subtitle timing, playlists, history, or progress; repeat import without duplication; edit the same note on two offline devices and retain both changes; preserve intentional rewinds; retry interrupted transfers; restore after deletion; reject a corrupt archive without changing the current library; keep media and access credentials within the chosen export scope.
