# Shravanam feature plan

This document tracks implemented source and remaining work. ✅ marks completed source or a recorded decision; platform verification is listed separately and is not implied. `TODOS.md` retains the original Russian feature text. Desktop timer behavior and the first manual WebDAV adapter are approved below. Android and standalone PWA adapters for the new library, timer, and synchronization controls remain pending.

## Current scope

- ✅ First delivery targets: desktop and Android. Debug the shared interface in a desktop browser. Keep iOS and installed-PWA delivery for later stages.
- ✅ Add shared VS Code tasks and a Rachana-style `node-terminal` launch using `bun run dev`. Open a browser manually and use its developer tools with development source maps. Runtime checks remain pending.
- ✅ Add `Debug Desktop` / `Dev Desktop` using `bun run dev:desktop` for the native window, WebView DevTools, development source maps, and existing tray controls. Normalize built asset names and HTML URLs to forward slashes so Windows native startup can load its icon and other resources. Browser development does not create a tray.
- [ ] Verify the Windows native development launch: startup icon/tray, DevTools source maps, playback and configured time jumps from the tray, Continue in background, tray Open, and Quit. Close an existing desktop host before F5.
- ✅ First local-file implementation: shared controls, browser playback, desktop mpv IPC, external file drops, saved positions, and desktop association source. Native checks remain pending.
- ✅ Add Android native local-audio source: Media3 service, Capacitor bridge, system file intake, saved positions, and media-session controls. Browser iteration accepted by the user; Android build/device checks remain pending.
- [ ] Design a separate `karatala-ui` library from common needs in several projects. This is deferred and is not part of the player implementation.
- ✅ Add GitHub Actions source based on Rachana for web checks/builds, Windows/Linux/macOS builds, and an Android debug APK, with downloadable artifacts.
- [ ] Verify the first GitHub CI run. Release publication, Pages, and iOS CI remain separate setup work.
- ✅ Record synchronization, export/import, and backup/restore requirements in `DATA_PLAN.md`. Browser persistence uses IndexedDB. Desktop now has a shared-library adapter and manual WebDAV synchronization; Android migration and other destinations remain pending.
- ✅ Add the shared record model, JSON archive v1, browser migration, export/import preview, conflict preservation, and local recovery. Runtime verification remains pending.
- ✅ Add a separate 20-file recent list and paused restoration of the last file in browser, desktop, and Android source. Browser restoration uses supported file handles and existing permission; otherwise it asks for access or reselection. Runtime verification remains pending.
- ✅ Make default browser development a control surface for Bun-owned files and the shared mpv player. Add authenticated loopback commands, system file selection based on Rachana, independent development profile, and explicit `dev:web` mode for PWA checks.
- ✅ Add desktop YouTube link input, installed yt-dlp metadata resolution, audio-only/Watch streams, stable source progress, and a separate 20-link recent list. macOS IINA development checks confirmed Listen/Watch playback, page reload, mode changes that retain pause, seeking, and saved-position recovery. Remaining checks are listed below.
- ✅ Check macOS Bun control mode with two browser tabs and IINA 1.5.1. Seek, speed, play/pause, and the active source were shared across both tabs. Switching between the local MP3 and recorded YouTube source retained their separate positions. Playback continued after closing one tab and after closing all control tabs; a new tab showed the advancing position and retained speed. The final page reported no console errors.
- ✅ Check the macOS system picker in Bun control mode with user-operated Cancel and Open. Cancel retained the source, position, and pause; Open selected the existing MP3 and started playback. Stopping Bun showed the connection error with restart/reload instructions. After restart the old page stayed disconnected until reload, which restored the local file paused.
- ✅ Check browser-host request validation with an isolated profile: valid state access, foreign/missing Origin, foreign Host/URL, missing/invalid/stale token, wrong method/content type, malformed JSON, invalid bodies, and unsupported raw player commands. Live loopback requests with invalid credentials or foreign Host/Origin were rejected without CORS access. Mock picker checks covered one active dialog, Cancel, failure, and retry after failure; actual OS dialog failure remains separate.
- ✅ Run `bun run build` and `bun run desktop` on macOS. The production asset list contained all seven files, with resolved entry and offline-cache placeholders and no source maps or development bridge token. The native host started on port 47870 without terminal errors. Its separate profile saved playback and reset completed WAV progress to zero. The user confirmed that the native window showed the player.
- ✅ Check the native macOS file dialog with user-operated Cancel and Open. The selected MP3 started and could be paused. The native profile retained its position separately from browser development.
- ✅ Check native macOS interface controls with the user after restart. The restored file appeared paused near 20 seconds. After clicking the forward button, Space started and paused playback, and Left sought backward. Maximizing and returning to the normal window size worked.
- ✅ Add desktop source for a separate website browser with a trusted local toolbar, YouTube search/navigation, single-command Listen/Watch handoff, manual yt-dlp downloads, and local userscript import/editing. Keep external pages outside the app bridge. Native site and real-download checks remain pending.
- ✅ Add desktop chapters, ordered local playlists with automatic next-item playback, searchable editable notes, and imported SRT/VTT subtitles with local cue editing. These records use the shared library and portable archives. Android/PWA editing adapters and native subtitle overlay remain pending.
- ✅ Add desktop archive export, checked import preview, conflict retention, local pre-import recovery, and explicit file relinking. Add a manual WebDAV preview/apply flow with separate device files and conditional publication. Real-server verification remains pending.
- ✅ Add Bun-owned adaptive sleep timing, saved possible-sleep and actual-pause positions, configurable spoken time through installed system voices, and an explicit desktop background action with tray controls. Source and unit checks do not establish support on other native targets.
- ✅ Keep YouTube audio running during Listen/Watch changes. Prepare video outside the command queue, attach it asynchronously to the audio clock, and remove its external tracks in Listen. Native Windows checks covered delayed video loading and a real YouTube stream with one main-file load, an unchanged process, responsive controls, and synchronized video.
- ✅ Fix the sleep noise filter resetting the main audio timestamps. A real-time native 3 min / 1 min / 2-repeat check signalled at 180.163, 245.404, and 310.635 seconds and paused at 315.656 seconds, with one file load and no rewind.
- [ ] Verify Bun control mode on other targets: native picker cancel/open, page reload, closed-tab playback, multiple control tabs, and recent-file restoration after terminal restart. Repeat missing-player checks on other targets and check actual unavailable-dialog behavior.

## [ ] Data foundation: synchronization and recovery

`DATA_PLAN.md` owns this design. Address identity and persistence before expanding the library, notes, captions, or history.

- ✅ Define the first shared logical model and implement browser progress/settings migration while retaining old data.
- ✅ Connect the desktop library adapter to the Bun playback owner. Allocate device-local opaque record IDs, migrate valid playback settings, local recents, source links, and positions without clearing playback.json, and associate online/downloaded copies with the same logical media record.
- [ ] Migrate Android native storage and connect the new library controls on Android and standalone PWA. Verify file access and relinking on each target.
- ✅ Persist desktop progress, source/media metadata, chapters, playlists, notes, and imported subtitle originals, edits, and cues in shared records. Preserve archive variants rather than discarding conflicting text.
- [ ] Complete viewed/listened history capture, descriptions/comments, transcripts, bookmark controls, and selected-item exports.
- ✅ Add desktop portable archive export, validated import preview, retained conflicting variants, repeated-import deduplication, and pre-import recovery. Export excludes media bytes, device-local paths, credentials, downloads, and website sessions.
- [ ] Define offline changes, revisions, deletions, and conflict handling for multiple devices. Preserve concurrent text edits and intentional rewinds.
- ✅ Select WebDAV as the first desktop destination. Implement explicit connection, remote preview, merge-priority selection, manual apply, retry, and disconnect. Keep one device archive per remote file, require ETag/conditional writes, and retain the password only in process memory.
- [ ] Verify a real WebDAV server and two real devices. Add automatic scheduling, causal revisions/deletion markers, attachment/media transfer, and other provider adapters separately. Manual snapshot exchange does not implement these capabilities.
- [ ] Define encryption, credential storage, automatic sync/backups, retention, and provider changes before enabling them.

## [ ] Stage 1: playback ownership and first playable version

### [ ] Decide playback ownership

The desktop implementation uses a separate mpv process controlled by Bun through private JSON IPC. The interface reads state and sends validated commands. Default browser development controls this same engine through a local authenticated endpoint; `dev:web` explicitly selects a browser media element. Reloading or closing the development browser does not stop Bun playback. The native desktop has an explicit Continue in background action that disposes the app WebView/context while Bun retains playback, sleep timing, and saved position. Tray Open recreates the interface from host state. Closing the player window or choosing Quit still exits the application. Native background verification remains separate from the lifecycle tests.

| Target | Proposed direction | Required check before claiming support |
| --- | --- | --- |
| Desktop | Bun host, native media engine, optional WebView interface | Check audio and timer continuity after WebView disposal, tray commands, and interface recreation. Global shortcuts remain pending. |
| Android | Media3 ExoPlayer and MediaSessionService outside the Capacitor WebView; local plugin for the interface | Android build, background audio, notification actions, lock-screen controls, headset events, and interruption handling on a device |
| iOS | Native media layer behind Capacitor | Background audio, system media controls, headset events, and interruption handling on a device |
| PWA | Browser player and browser-supported media controls | Record actual background and control support per browser; do not promise native parity |

- ✅ Use mpv for desktop local playback and Media3 1.11.1 for Android local audio. Keep format, resource, packaging, and license validation open before distribution.
- ✅ Store desktop progress and settings through the native shared-library adapter, outside the WebView. Keep playback.json and local bindings for device access and migration. Development control mode uses a separate Shravanam-dev profile; standalone PWA progress uses IndexedDB.
- ✅ Store manual desktop downloads in private profile-owned directories with a checked download index. Keep media out of the shell cache. Cross-device media backup and automatic cache policies remain pending.
- ✅ Define shared select, play/pause, seek, speed, and interval commands and playback state in `src/playback.ts`. Android maps the existing commands to its service. Desktop also has host-owned sleep commands and tray controls; global system controls remain pending.
- ✅ Start with local files: MP3, M4A/M4B, AAC, FLAC, OGG/Opus, WAV, MP4/M4V, WebM, MKV, MOV. Browser codec support varies. Recorded YouTube links have desktop and Android audio resolvers. Generic URLs, other sites, and PWA links remain pending.

### [ ] File drag-and-drop and associations

- ✅ Scope confirmed: external OS file drag-and-drop and OS associations that open media in Shravanam. Internal extension-to-player rules are not requested.
- ✅ Add native OS file-drop handling and separate browser File handling. Both add files to the same interface. Native behavior still needs checks on each OS.
- ✅ Add packaging source for macOS document declarations and optional Windows/Linux Open With registration. The user chooses defaults for double-click opening; no defaults are changed automatically.
- ✅ Add cold-launch arguments, a macOS document-event launcher, authenticated forwarding to an existing instance, and startup buffering. OS drops, associations, and the file dialog share the media-opening flow.
- ✅ Add Android document selection, Open With, and file Share intake through content URIs, with cold/warm intent handling and queued imports. Request persistent read access where granted and identify temporary access in the UI. Device checks remain pending.
- [ ] Use Folder Sync only as a reference for relevant validation and argument handling. Its internal file rules and drag format do not implement incoming OS associations or native file drops.
- ✅ Add accepted files in input order and start the first accepted item of each batch. Skip unsupported entries with a visible error. The intake list is session-only. Automatic next-item playback uses an explicitly selected saved playlist, not arbitrary recent-file order.
- ✅ Check warm command-line delivery to the running native host on macOS. A second `bun run desktop -- <file> <file>` process exited successfully, kept the first host PID, and saved two WAV files with spaces and Cyrillic names in input order. Native loopback requests without a token or with a foreign Origin returned 403; unknown assets returned 404. Finder document events remain unchecked.
- ✅ Check native macOS file drops and window closure with the user. Dropping two WAVs from Finder added both and started the first. Pausing near 20 seconds and closing with the app's X saved 20.48 seconds, stopped its Bun host and IINA, and left the separate browser-development player running. A new `bun run desktop` restored the same file at 20.48 seconds in Listen; private IPC reads two seconds apart confirmed that it stayed paused.
- ✅ Check cold command-line intake in the native macOS app. Launching with two WAVs in reversed order started the first incoming file, instead of restoring the previous file on pause. Private IPC confirmed that playback advanced. Terminal shutdown saved its position, and another launch without files restored it paused in Listen.
- ✅ Check native file-forwarding validation with its own session token. Invalid JSON, non-array input, invalid path entries, NUL characters, excess path length, more than 256 entries, and raw player-command objects returned 400. Origin headers and a foreign Host returned 403. All 14 requests left file intake unchanged.
- [ ] Verify packaged macOS Open With and default double-click opening during cold/warm startup. Repeat native drops, command-line intake, paths with spaces, and multiple files on Windows/Linux. Check incoming requests during native startup on each target.

Verification: drag a file from the OS file manager into the native window and the browser interface. Check Open with and default double-click opening with Shravanam closed and already running. Test paths with spaces and multiple files. Browser-only success does not establish native drop or association support.

### [ ] Optional persistent link opening

- [ ] Provide an optional, short setup flow to open selected websites, for example YouTube, in Shravanam persistently. Show actual enabled state and a matching disable/restore action. Keep ordinary file associations independent of website rules.
- [ ] Support explicit Open link and OS Share/Open with input even when automatic website opening is disabled.
- [ ] Select a supported per-platform routing method. Evaluate Android user-approved domain handling and desktop browser integration or a link-routing helper. A custom application URL scheme alone does not reroute ordinary HTTPS links.
- [ ] Require the platform's user choice where needed and lead directly to the relevant settings. Do not claim automatic domain verification for YouTube or change the default handler for all web links merely to enable one site.
- [ ] Record prior routing settings where they can be read, and track only changes made by Shravanam. On disable, remove its routing rules and restore the recorded choice where supported. Do not overwrite a newer choice made by the user in another application.
- [ ] Where the OS prevents reading or restoring another handler directly, guide the user to the exact settings needed and verify the resulting state. Do not label restoration complete merely because an app-local switch was cleared.
- [ ] Preserve the original URL and media time parameter. Avoid routing loops when opening a link back in the browser. Handle incoming links during startup and while the application is already running.

Verification: check a selected-site link before enable, after enable, after restart, and after restore. Check that other sites retain their existing behavior. Include a changed or unavailable previous handler and user cancellation of system setup.

### [ ] Desktop mpv integration and distribution

- ✅ Reject inaccessible YouTube stream formats during yt-dlp resolution with `--check-formats`, before loading them in mpv. A Windows failure reproduced HTTP 403 for the same extracted URL in the host, a fresh mpv process, and a bounded HTTP probe.
- ✅ Check the ordinary Windows `bun run dev` browser flow after format validation: the same recorded video opened twice, playback advanced, and pause at 10.9 seconds remained after a page reload. Watch mode and other backends remain separate checks.

mpv is the first desktop playback engine, running as a separate process controlled through private JSON IPC. The source finds an installed or adjacent binary; packaging does not yet bundle it. Explicit background mode now disposes the app WebView while retaining the engine.

- ✅ Add a local Player settings field for the mpv executable path in native desktop and Bun browser control mode. Expand it when player discovery fails, validate the executable file, preserve the setting outside shared library data, and allow an empty reset to automatic search. Do not add package-manager-specific discovery.
- ✅ Add Browse to the mpv path field in both desktop modes. Select one file through the OS dialog, preserve the draft on Cancel, and keep Apply explicit.
- ✅ Check an explicitly configured Windows mpv with an empty PATH and an isolated silent WAV: playback, pause, seeking, speed, host restart, paused position restoration, and exclusion of the executable path from library archives. Audible output and native window controls remain separate checks.

- ✅ Add an installed-IINA fallback on macOS when standalone mpv is absent or fails during startup. Start a separate process with private IPC, silent initialization, and process-local preference overrides. Keep progress in Shravanam and close only its own process.
- ✅ Add desktop Listen/Watch selection, saved with playback settings. Listen disables video. IINA uses RAM cache limits of 32/8 MiB forward/backward for Listen and 128/32 MiB for Watch, with safe hardware decoding requested for video.
- ✅ Pass the extracted stream title to mpv before loading it, instead of letting IINA display the signed media URL as its window title. Clear the override for the next local file. Regression checks cover literal title handling, load order, and clearing on source changes. The user confirmed that IINA shows THE NEAL MORSE BAND - Do It All Again after reopening the stream on macOS.
- ✅ User confirmed basic playback after updating IINA; the installed version was not recorded.
- ✅ Check recorded YouTube Listen/Watch playback in macOS Bun control mode with installed IINA. The user confirmed video and audio in Watch. Position and 1.25× speed were retained during playing mode changes, and page reload kept Watch playback running. Host and browser logs reported no errors during these checks.
- ✅ Fix paused YouTube Watch-to-Listen switching with process-local `pauseWhenOpen=YES`. macOS IINA 1.5.1 checks confirmed that both directions retain pause and position, playing mode changes continue playback at 1.25×, and startup restores the last local file paused. The host keeps ownership of autoplay.
- ✅ Preserve the latest active-file position across player stop/disconnect and exclude bootstrap properties from saved progress. Show a specific message with Play to reopen the file. Checks below cover macOS IINA; other recovery cases remain open.
- ✅ Check recorded YouTube seeking and recovery in macOS Bun control mode with IINA 1.5.1. Listen buttons moved by -15/+30 seconds on pause, the timeline selected a position, and Watch seeking kept playback active. The user confirmed video/audio synchronization. Play restored the saved position after window closure with the user's auto-quit utility active and after a separate full IINA exit. After a Bun restart, the last local file restored paused and manually selecting the saved YouTube link resumed its position.
- ✅ Keep native EOF state through late position, pause, and duration updates. The Bun regression check covers this event order. macOS IINA 1.5.1 checks confirmed that an eight-second local WAV and a recorded YouTube source pause at the end and restart from zero with Play.
- ✅ Check unexpected IINA exit before the five-second checkpoint with an isolated local WAV. With Bun still running, terminating the test-owned IINA process at 0.71 seconds advanced its disk checkpoint from zero to 0.71 seconds, and Play resumed from that position. This does not cover simultaneous Bun termination or power loss.
- ✅ Check macOS engine startup failures with controlled executable discovery and test executables. Missing players returned `missing-player` and allowed retry. An mpv executable that exited during startup fell back to installed IINA 1.5.1; a later restart kept IINA selected. A controlled IINA startup failure returned `iina-player`, cleared the process/socket, and allowed a successful retry.
- ✅ Check IINA process ownership and existing configuration. Two test-owned IINA processes used distinct PIDs; closing the first left the second responsive through its private IPC. Existing `mpv.conf` and `input.conf` contents survived player restart.
- ✅ Clear a storage failure after a successful settings-file replacement without erasing unrelated playback errors. A read-only test profile kept the previous JSON intact; restoring write access and repeating the setting saved it and cleared the error. Bun regression checks and the native playback block cover this recovery.
- [ ] Validate real standalone mpv builds on target systems; repeat startup, play/pause, speed, seeking, Listen/Watch, file switching, paused restoration, end-of-file replay, and recovery before the five-second checkpoint on the other desktop backends. Measure CPU and memory before deciding whether to add a separate audio engine. Tauri migration is not selected.

- ✅ Add application-owned `--config-dir`, `mpv.conf`, and editable `input.conf`, created only when absent. Bindings cover the mpv video window; global shortcuts remain future work.
- ✅ Default standalone mpv buffering to `cache=yes`, `cache-on-disk=no`, 128 MiB forward and 32 MiB backward, configurable in `mpv.conf`. IINA uses the mode-specific properties above. This controls media buffering, not OS swap or settings writes. Desktop YouTube playback enforces RAM-only buffering. Explicit offline downloads have a separate host-owned disk store.
- [ ] Bundle mpv and its dependent libraries with the required licenses for each supported desktop architecture.
- ✅ Resolve recorded YouTube links in the Bun host with installed yt-dlp, then pass validated HTTPS streams to mpv/IINA. Do not depend on the player’s bundled extraction hook.
- ✅ Wait for IINA's silent launch file before opening media and match load completion to the requested path. Prefer IINA's bundled yt-dlp on macOS. A source-level check confirmed that a recorded YouTube audio stream loaded with the correct duration and playback advanced.
- [ ] Verify YouTube extraction with the installed downloader/runtime, separate audio/video synchronization, seeking, and mode changes on other target systems. Check expired-address retry and shutdown cancellation on every supported target.
- [ ] Check distribution size, licenses, supported desktop architectures, video-window behavior, IPC access, and state recovery before adopting it.

Reference: [mpv manual](https://mpv.io/manual/stable/).

### [ ] Android playback and device checks

- ✅ Add a versioned Android library, plugin registration overlay, and repeatable integration in `prepare:android`.
- ✅ Add Android LAN interface development on port 3001 with automatic reload, temporary Capacitor server configuration, and a standard preparation path back to bundled assets.
- ✅ Add a native Server setting to debug APKs, including GitHub artifacts. Keep the selected address on the device and allow return to bundled assets without rebuilding, even when the server or web interface fails.
- ✅ Keep ExoPlayer, state, and five-second progress checkpoints in MediaSessionService. Reconnect the UI to an active service without reopening its media.
- ✅ Keep the service's primary player audio-only with video/text disabled. Persist settings and per-file positions in private SharedPreferences, keyed by URI and reported size. Recent descriptors survive service termination; the active file list remains service-session-only.
- ✅ Add media notification preferences for play/pause and time jumps; map previous/next commands to time jumps. Enable audio-focus handling, headphone-disconnect pause, and playback wake lock.
- [ ] Prepare and build the Android project, then install on a device. Check both a modern Android version and the oldest supported API level available for verification.
- [ ] Open MP3/M4B and a video with an audio track. Check speed, configured intervals, end-of-file replay, saved position, and no video decoding in Listen mode.
- [ ] Check single/multiple document selection, cancellation, Open With and Share during cold/warm launch, names with spaces/non-Latin characters, temporary grants, and revoked file access. Confirm that opening the UI again does not restart an already accepted intent.
- [ ] Lock the screen, hide/recreate the interface, remove the active app task, and reopen through the notification. Check continuous audio, one playback instance, correct position, and no unintended autoplay when the service is no longer alive.
- [ ] Install the GitHub debug APK, select a LAN server through the native Server button, and change its address without reinstalling. Check automatic reload and source switching with uninterrupted audio and the correct position. Repeat after backgrounding, app restart, and server restart. Stop the server or load broken JavaScript, use the native button to return to bundled assets, and check offline startup and safe-area placement. Confirm that release builds do not show server settings.
- [ ] Check notification and lock-screen controls, headset play/pause and next/previous time jumps, headphone removal, and audio-focus interruptions. Record device-specific restrictions.
- ✅ Add Android Listen/Watch source with a private video-only Media3 screen following the service audio clock. Prepare local or recorded YouTube video independently, hide unsynchronized frames, and release the secondary decoder on pause. Keep video errors independent and bound YouTube video to 1080p with H.264 preference. Native unit cases cover waiting, drift, speed, pauses, and seek detection; execution awaits Android CI.
- [ ] Check Listen/Watch switching on a device with local and YouTube videos: continuous sound, initial join, forward/backward seeks, pause/resume, 0.25×/3× speed, end-of-file, retry, rotation, screen lock, background return, source changes during extraction, and failed video with working audio. Confirm one audio output and released video decoding when hidden.
- [ ] Add media-button playback resumption after service termination when persistent library state exists.

### [ ] Core controls and library state

- ✅ Add local play/pause and playback speed from 0.25× to 3× in browser, desktop, and Android source.
- ✅ Add configurable backward/forward intervals, initially 15/30 seconds, plus Space and Left/Right shortcuts in the app. Settings persist.
- [ ] Seek with buttons and gestures. Define gesture direction, distance, and accidental-touch handling before implementation.
- ✅ Add desktop chapter extraction from native files and resolved YouTube metadata, manual chapter creation/editing, and previous/next chapter navigation. Keep chapter actions separate from configured time-jump buttons. Android/PWA chapter adapters remain pending.
- ✅ Persist position per local file and restore it on reopening. Browser identity uses name, size, and modification time; desktop identity uses canonical path, size, and modification time. Completed items restart at zero. macOS IINA checks are recorded below; other targets remain pending.
- ✅ Keep the 20 most recent files, deduplicated and ordered by reopening, independently of the active session list. Automatically reopen the last file paused when access is available. Preserve missing/inaccessible entries for recovery; newer explicit opening must win over pending startup restoration.
- ✅ Check changed local-file identity with isolated WAVs and macOS IINA 1.5.1. Selecting the old entry reported `changed-file` and retained the current source, pause, and position. Explicitly opening the changed file created a new identity at zero; the old identity kept its saved progress.
- ✅ Check missing and unreadable local files with isolated WAVs and macOS IINA 1.5.1. A missing path reported `open` without replacing the current source. Returning the file restored its saved position. A missing startup file stayed in recents without autoplay and recovered through explicit recent-file selection. Removing read permission reported `open` while the control file kept playing; restoring permission allowed reopening. Fixture names included spaces and Cyrillic characters.
- ✅ Check desktop batch intake and startup priority with isolated WAVs and macOS IINA 1.5.1. A mixed batch kept accepted files in input order, started its first accepted file, and reported skipped entries. Invalid-only input left playback running, and the next valid command worked. Recents stayed capped at 20, deduplicated reopening, and moved reopened files first. Startup restored only the most recent file paused with its position and a fresh session list. Explicit incoming files won both before restoration began and during native loading. A new Bun process restored the saved local file paused with its position and all 20 recents.
- [ ] Complete restart and recent-file checks on each platform: saved position, no startup sound, incoming-file priority, changed/deleted files, revoked access, temporary Android grants, browser picker/drop handles, and browser fallback without handles. Verify browser import/restore still leaves playback stopped.
- ✅ Add desktop saved local playlists, ordered add/remove/move actions, explicit playlist playback, and next-item selection at EOF. Chapter actions seek within the current item; queue transitions select another item. Persist the playlist, not an automatic restart of an active queue.
- ✅ Add desktop audio-only Listen and native-window Watch modes, plus Android native video-screen source. Standalone PWA mode parity and Android runtime checks remain pending.
- [ ] Keep watched/listened history. Decide how completion and partial listening are recorded.
- [ ] Handle calls, other audio, output-device changes, and removed headphones without unexpected playback.

Stage verification: open a supported source, change speed, seek, reopen at the saved position, and confirm that queue and chapter actions do not replace the configured time jumps.

## [ ] Stage 2: background controls and resource use

- ✅ Add the first Android background-service and media-session source. Device checks above remain open; desktop tray and resource-release work is separate.
- [ ] Continue native playback with the screen locked and the interface in the background.
- [ ] Expose play/pause and the configured time jumps through supported lock-screen and headset controls.
- [ ] Add useful notification actions where the platform supports them; define the action set per platform.
- [ ] Investigate volume-button control separately from normal volume adjustment. Define a user-selected mode and supported platforms before intercepting any buttons.
- ✅ Add desktop tray Open, Play/Pause, configured backward/forward jumps, and Quit, owned by Bun while the app WebView/context is disposed. Lifecycle/menu tests cover commands and unavailable-tray recovery. After fixing native-event reentry, the user confirmed the macOS background/reopen flow works; other platforms remain pending.
- ✅ Recreate the desktop interface on tray Open or incoming media without reopening the active track. Retain an empty hidden native window to keep WebviewJS alive.
- ✅ Keep explicit Continue in background separate from Close/Quit. If the tray is unavailable, retain or restore the player interface and show an actionable failure.
- ✅ Persist desktop normal window coordinates, size, and maximized state locally. Restore before showing; fit saved geometry to an available monitor after display changes. Keep normal geometry when hidden, minimized, or fullscreen. Startup does not request focus; explicit tray Open and incoming files still do.
- ✅ Check saved normal coordinates and size through a full native macOS host restart. The restored host kept the same geometry and logged no startup error.
- [ ] Verify changed display layout and macOS fullscreen/RDP use. Geometry does not save a Space. Current WebviewJS cannot select a Space; user-controlled Dock assignment and Mission Control settings apply separately. Do not imply that stored coordinates prevent all fullscreen/Space transitions.
- ✅ Add Windows SMTC playback/timeline controls and global Ctrl+Alt+Space, Left/Right, and Home shortcuts for play/pause, time jumps, and opening the interface. Verify software transport requests, shortcut conflicts, and release on shutdown/failure. Controls stay owned by Bun outside the app WebView.
- [ ] Verify real headset/media-key hardware, locked-screen behavior, and full native background use on Windows. Add adapters for other desktop systems. System-volume responses remain separate from app/mpv volume observation; packaged Windows media-session identity remains pending.
- [ ] Compare memory, CPU, and energy use for the same media, codec, resolution, and output mode. Check hardware video decoding and avoid duplicate decoders. Lower resource use is a goal to measure, not a guarantee from choosing a native wrapper.
- [ ] In audio-only mode, avoid video decoding and video transfer when the source provides a usable separate audio stream. Record behavior when it does not.

Stage verification: compare playback with the interface open and disposed; confirm that the WebView resources are released, controls still work, and reopening restores the correct state. Test each advertised hardware action on its target platform.

## [ ] Stage 3: downloads, sources, and archive

- ✅ Add desktop manual offline-download source with audio or video up to 480p/720p/1080p, one active job, progress, cancellation, retry, and a persistent ready/interrupted list. Keep partial files for retry and verify the completed media path before marking ready. Installed ffmpeg is required for video merging. Native and real-source verification remains separate.
- [ ] Automatic downloading. Define triggers, queue limits, network conditions, storage limits, and retry behavior before enabling it.
- ✅ Represent downloading, finishing, interrupted, ready, and failed states in the desktop interface. An incomplete file cannot open as offline-ready. A waiting queue remains pending with automatic downloading.
- ✅ Add manual paste/open of individual recorded YouTube links on desktop, including video links with playlist parameters and explicit timestamps. Keep 20 canonical source links separate from local recents; store no signed stream URLs.
- ✅ Add Android paste/open for recorded YouTube audio through packaged youtubedl-android 0.18.1 and the existing Media3 service. Keep source resolution native, cancellation/generation checks, fresh stream retries, separate 20-link history, saved positions, and capability hints for older APKs. Add separate video extraction for Watch. Live streams, link Share/Open With, scripts, and downloads remain pending.
- [ ] Verify Android YouTube on a device: public/invalid/unavailable links, explicit timestamps, network loss and fresh Play retry, source changes during extraction, pause/stop/media keys while resolving, progress/restart, local-file switching, UI reload/background, and decoder behavior. Confirm that signed addresses/headers are absent from saved data and snapshots.
- [ ] Add OS Share/Open with input for YouTube links and Android/PWA adapters. Separate receipt of the link from successful media extraction and playback.
- ✅ Bind desktop downloaded files to their YouTube logical media record and shared progress, retain the title, and restore the local copy paused without fetching streams. Notes, chapters, and playlists retain that logical identity. Cross-device local-file relinking remains explicit.
- [ ] Search the saved archive and watched/listened history.
- ✅ Add searchable personal notes on opened local files and desktop YouTube videos, including online items without a download. Keep timed notes and seek to their stored positions.
- [ ] Add direct note-creation flows for channels and source playlists. Local playlist creation does not implement those source flows.
- ✅ Use the existing desktop WebviewJS/system WebView with a separate website context and local toolbar. Use the existing installed yt-dlp discovery and runtime restrictions for explicit offline downloads. Keep the Bun host. Android has a separate muted website WebView and native YouTube handoff; its device checks and download adapter remain pending.
- [ ] Investigate reuse of an existing downloader before implementing a browser. Define manual file import versus watched-folder import separately.
- [ ] Evaluate yt-dlp for both media sources and related data: manual and automatic subtitles, descriptions, chapters, and comments where available. Use metadata extraction or `--skip-download` when media bytes are not needed; assess desktop and Android integration separately.
- [ ] Maintain an explicit list of supported sites and source capabilities. The wish to load media from any site remains a research goal, not a promise.

Stage verification: share a supported link, choose an available format, download it, disconnect, and resume at the saved position. Confirm that duplicate imports keep notes attached to the intended item.

### [ ] Embedded browser and offline workflow

- ✅ Record the requested workflow: find a YouTube video inside Shravanam, play it through native extraction, or save audio/video for offline playback. Built-in video-ad blocking is not required. The user wants script import and an editor for page cleanup, with userscript-style metadata where supported.
- ✅ Add desktop source navigation, HTTPS/search address entry, Back/Forward/Reload, and native Listen/Watch/Download actions. Validate selected YouTube URLs in the host and retain explicit timestamps. Do not resolve the previous source just to change the requested mode.
- ✅ Keep website pages in a separate context, block new windows, and expose source/window controls only to the trusted local toolbar. Unit checks cover the bridge/context split; native behavior remains separate.
- ✅ Add local `.js`/`.user.js` import and editing, script toggles, name/namespace replacement, and a previous-store recovery copy. Support HTTPS match/exclusion globs, document-start/end/idle, and `@grant none`, only in the matching top-level website page. Reject invalid syntax, privileged grants, remote requirements/resources, and scripts above 128 KiB. Full Violentmonkey APIs are not implemented. See `SOURCE_BROWSER.md`.
- ✅ Add host-owned manual downloads, cancellation/retry, checked offline file opening, and source-position binding. Unit/process checks cover completion, early cancellation, retry, index restoration, path escape rejection, and paused local progress restoration.
- ✅ Dispose the desktop source views/context when closed while the host retains playback and downloads. Sync-provider selection remains independent.
- ✅ Check macOS source browsing and native handoff with the user. Check editor save, file import, toggles, rejected syntax, and previous-script preservation through the interface. A real WebView loaded example.com with a document-end script that changed its title; disabling the script restored the original title. The test script remains disabled in the development profile.
- ✅ Check real desktop audio download with installed yt-dlp: Me at the zoo produced a checked 309,288-byte local file, opened through IINA, and restored paused at four seconds after host restart. Playback advanced after closing the source browser. Fix reopening after the last source window closes by retaining an empty hidden window while disposing its WebViews/context; native reopen checks and the lifecycle regression cover this case.
- ✅ Keep video-download failures actionable when ffmpeg is absent. The interface reports the dependency and offers retry. The user deferred installation; real merged-video download verification remains pending.
- [ ] Check document-start/idle scripts on real pages, YouTube same-page navigation, merged-video downloads after ffmpeg installation, and online/local position continuity. Repeat source browsing, child-view layout/focus, script timing, download recovery, and close/reopen behavior on the other desktop targets.
- ✅ Add Android HTTPS/search navigation, Back/Forward/Reload, and explicit recorded YouTube Listen/Watch handoff. Keep the website in a muted plain WebView without an app bridge; block file/content access, mixed content, and popups. Use a separate profile when supported and destroy the page on pause. Native URL/unit cases and preparation fixtures cover address boundaries and private screen/layout packaging; device behavior remains separate.
- [ ] Check Android browser search, same-page YouTube navigation, timestamps, back/forward, blocked native schemes/popups, page failures, outdated System WebView, muted website audio, background address restoration, and Listen/Watch handoff while another item is playing. Confirm website JavaScript cannot access app bridges and signed streams remain absent from snapshots and saved data.
- [ ] Implement Android user-script handling and offline downloading. Standalone PWA needs a selected supported acquisition adapter; yt-dlp does not run directly in its current browser code. Do not describe these remaining capabilities as implemented.

Verification: find a video through the embedded browser, download the selected format, disconnect, restart Shravanam, and resume the local copy at its saved position. Check browsing with ad blocking enabled and disabled. Repeat supported behavior on desktop and Android before claiming both targets work.

## [ ] Stage 4: bookmarks, notes, subtitles, and transcription

- ✅ Add desktop editable notes with an optional explicit timestamp, search across saved notes, and seek from a timed result. Preserve the selected note target while another file opens.
- [ ] Add dedicated bookmark controls. The shared bookmark record alone does not implement the interface.
- ✅ Import desktop SRT/VTT files up to 1,000,000 bytes. Keep the original text, language, edited copy, and parsed cues; display the current cue in Shravanam and seek from a subtitle line. Render imported text as text, not executable markup.
- ✅ Edit local subtitle text and timing without replacing its original source. Keep alternate note versions visible after archive or WebDAV merges.
- [ ] Extract available YouTube subtitles and chapter timestamps with descriptions.
- [ ] Evaluate yt-dlp subtitle retrieval with `--write-subs` and `--write-auto-subs`, and selected languages. Import available descriptions and chapters from metadata and comments through `--write-comments`. Retrieving existing automatic captions is separate from generating a new transcript.
- [ ] Import useful video-description text and selected comments as local notes.
- [ ] Let the user keep only useful parts of imported descriptions and comments and edit their local copies. Do not publish these edits back to the source.
- [ ] Attach an imported note to a parsed timestamp or a time chosen by the user. Do not invent a time for text without one.
- ✅ Retain the target reference and separate original/edited fields for imported subtitles. Keep local chapters when the source opens again instead of overwriting them from extracted metadata.
- [ ] Apply the same original/edited policy to future description/comment imports and metadata refreshes.
- [ ] Transcribe media when required. Decide languages, processing location, timing accuracy, compute limits, and whether a remote service is acceptable.
- ✅ Search desktop personal notes on saved media, including opened online YouTube videos. Timed results open the correct logical item before seeking.
- [ ] Add channel/source-playlist note creation and full subtitle/transcript search. Import source descriptions/comments and generate transcripts separately from local SRT/VTT support.
- [ ] Connect these editing tools on Android and standalone PWA, and add native subtitle overlay where supported.

Stage verification: import a timed note, edit it locally, reload metadata, and confirm the edit remains intact. Selecting a timed result must seek to its saved position.

## [ ] Stage 5: adaptive sleep timer

### ✅ Desktop scheduling and signal

- ✅ Add manual activation and optional day/time windows. Start an automatic cycle when playback is active in an eligible window, including entry while already playing. Overnight windows belong to their starting day. Automatic activation is off by default.
- ✅ Configure the first delay, repeat interval, signal duration, signal gain, volume reduction, number of repeats, and response-wait duration. Store settings in the native profile.
- ✅ Mix a short brown-noise signal with fade-in/out through the existing mpv audio filter. The same native engine plays media and the signal. Scale signal length for playback speed; no separate ffmpeg executable is required. A muted macOS IINA check confirmed filter acceptance and advancing audio.
- [ ] Allow recording a personal signal, for example “Are you asleep?”. Define microphone permission, storage, and replacement behavior when implementing recording.

### ✅ Approved desktop sequence

| State | Default action | Next event |
| --- | --- | --- |
| Initial delay | Count 15 minutes of actual playing time | A response resets the delay; completion starts the first signal |
| First signal | Mix 5 seconds of brown noise at one third of the application level, with fades; keep media volume unchanged | Start a 5-minute playing-time delay |
| Repeats | Play two further signals, each after its 5-minute delay; reduce current media volume by 30% at each repeat | A response resets the cycle; the last signal ends in pause |
| Paused response window | Save the actual pause position and wait 3 minutes | An app/mpv volume increase or I am awake restores starting volume and resumes; expiry requires explicit Play |
| Explicit-play-only mode | Remain paused, including after a volume change | Explicit Play starts playback and a new cycle |

- ✅ Keep per-item possible-sleep and actual-pause positions and show separate seek choices. Possible sleep starts at the first unanswered signal and is an estimate, not sleep detection. Keep saved markers after host restart.
- ✅ Treat an app/mpv volume increase and the explicit I am awake action as responses. Restore pre-cycle application volume and restart the first delay. Timer volume changes are not responses; volume decreases do not reset the timer.
- ✅ Keep timing in the Bun playback owner, independent of the app WebView. Manual pause freezes playing-time counters; seeking keeps the cycle. Switching files or advancing a playlist restores starting volume and resets the delay. A running cycle continues across the end of its activation window.
- ✅ Reset the active cycle on host restart without autoplay. Retain settings and sleep positions; normal eligible playback can activate the configured schedule again.

### [ ] Remaining timer adapters and checks

- [ ] Implement Android and standalone PWA timing/signal adapters with their own background guarantees.
- [ ] Verify real headset and system-volume events on devices before using them as responses. Current desktop volume observation covers the application/mpv volume, not OS hardware-volume events.
- [ ] Verify audible signal level/fades and user responses on each advertised desktop backend. The muted IINA check does not replace an audible check.

Verification: Bun tests cover the full default cycle, 100% to 70% to 49% volume steps, manual pause, seek, response reset, file switching, both saved positions, deadline expiry, explicit Play, and settings/marker restoration. Native background, signal audibility, headset, and system-volume checks remain platform-specific.

## [ ] Stage 6: spoken time

- ✅ Add desktop configurable intervals, active days/time windows, system voice/language selection, phrase editing with `{hour}` and `{minute}`, 12/24-hour format, and voice testing. Default: disabled, 30-minute clock boundaries, daily 09:00-22:00, 24-hour format, Russian Milena voice, phrase `Сейчас {hour}:{minute}`.
- ✅ Use installed offline system voices through the Bun host: macOS say, Windows System.Speech, or installed eSpeak on Linux. Do not download a voice automatically. A voice unavailable on the current device requires a new selection. Milena is present on the current macOS system; Windows/Linux runtime checks remain pending.
- ✅ Follow local clock boundaries and skip missed announcements. Default to active playback only. An optional setting also permits speech during a manual pause after playback in the current session; restored-paused startup does not speak.
- ✅ Suppress speech during the sleep signal and after the sleep timer pauses playback. Cancel pending speech on pause, file change, and shutdown; pending voice discovery cannot restart a cancelled announcement.
- [ ] Add Android and standalone PWA speech adapters and verify each supported system voice/backend on its platform.

Verification: Bun tests cover clock-boundary deduplication, skipped announcements, selected days, day boundaries, 12-hour formatting, startup pause, unavailable/loading player state, sleep overlap, and cancellation while voice discovery is pending. Real voice output and desktop background checks remain separate.

## Desktop use

Open a local file or YouTube video, then expand Library. Create or edit chapters, make a playlist, add the current item, and change its order with the move controls. Playing an item from a playlist enables next-item playback at EOF. Chapter controls seek within that item and leave the configured time jumps unchanged. Notes can use the current position, a typed time such as 12:30, or no time. Import SRT/VTT under Subtitles, choose a track, and edit its local copy while retaining the original.

Use Data, backups, and synchronization for a portable data-only archive, import preview, or recovery of the pre-import library. Imported local files need explicit access/relinking on the receiving device. Under WebDAV, enter an HTTPS folder, login, and password, inspect remote data, then apply the preview with the desired version priority. Sync is manual, retains conflicting variants, and excludes media files. The password lasts only for the running host session.

Start the sleep timer explicitly or enable its optional day/time window. Use I am awake to reset the countdown and restore starting volume. The possible-sleep and actual-pause buttons seek to different saved positions. Spoken time is independently disabled until enabled and configured. On native desktop, Continue in background unloads the app interface; the tray opens it again, controls playback, or quits. The window Close action still quits.

## Technical reference points

These references identify specific platform constraints; they do not select a complete implementation.

- [Android user-approved domain handling](https://developer.android.com/training/app-links/verify-applinks): users can associate an app with declared domains through system settings even without domain verification. Selection and conflicts with other handlers need device verification.
- [Windows website app handlers](https://learn.microsoft.com/en-us/windows/apps/develop/launch/web-to-app-linking): this mechanism requires package identity and a website-hosted association. It is not a general way to claim a third-party site such as YouTube; desktop routing needs a separate integration decision.

- [Android background playback](https://developer.android.com/media/media3/session/background-playback): Android documents a player and media session in a separate service for background playback and external controls. This supports investigating a native playback owner outside the interface.
- [yt-dlp options](https://github.com/yt-dlp/yt-dlp#usage-and-options): yt-dlp supports subtitle files, automatic captions, metadata, and comment retrieval. `--skip-download` permits related-file retrieval without downloading the video. Source availability still needs verification.
- [YouTube captions download](https://developers.google.com/youtube/v3/docs/captions/download): the official API method requires permission to edit the video. This restriction belongs to that API method; it does not describe yt-dlp's subtitle retrieval path.
- [WebKit content-blocking rules](https://developer.apple.com/documentation/webkit/wkcontentruleliststore): WebKit has a native content-filtering API. Connecting it to the current desktop browser binding and checking YouTube behavior remain implementation work.

## [ ] First decisions for the next iteration

- ✅ Choose desktop and Android first, with desktop-browser debugging for the interface.
- ✅ Start with local-file playback, position saving, and configurable time jumps.
- ✅ Add desktop WebView disposal and tray controls after the library, notes/subtitles, manual sync, and timer source. Keep actual native background checks separate from unit coverage.
- ✅ Resolve the desktop adaptive timer sequence and configurable spoken-time behavior with the user. The approved defaults and remaining hardware/platform checks are recorded above.
- ✅ Select installed yt-dlp for desktop YouTube and downloads, and packaged youtubedl-android for recorded Android YouTube audio/video. Android downloads, PWA acquisition, and arbitrary-site media support remain pending.
- [ ] Finish desktop target checks and Android device playback checks. Verify real WebDAV synchronization and preserve the remaining adapter, history, transcription, and hardware-control work above.
