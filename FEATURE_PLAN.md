# Shravanam feature plan

This document tracks implemented source and remaining work. ✅ marks completed source or a recorded decision; platform verification is listed separately and is not implied. `TODOS.md` retains the original Russian feature text. Values in the sleep-timer example are examples, not approved defaults. Resolve open choices before implementing their behavior. The proposed stage order can change.

## Current scope

- ✅ First delivery targets: desktop and Android. Debug the shared interface in a desktop browser. Keep iOS and installed-PWA delivery for later stages.
- ✅ Add shared VS Code tasks and a Rachana-style `node-terminal` launch using `bun run dev`. Open a browser manually and use its developer tools with development source maps. Runtime checks remain pending.
- ✅ First local-file implementation: shared controls, browser playback, desktop mpv IPC, external file drops, saved positions, and desktop association source. Native checks remain pending.
- ✅ Add Android native local-audio source: Media3 service, Capacitor bridge, system file intake, saved positions, and media-session controls. Browser iteration accepted by the user; Android build/device checks remain pending.
- [ ] Design a separate `karatala-ui` library from common needs in several projects. This is deferred and is not part of the player implementation.
- ✅ Add GitHub Actions source based on Rachana for web checks/builds, Windows/Linux/macOS builds, and an Android debug APK, with downloadable artifacts.
- [ ] Verify the first GitHub CI run. Release publication, Pages, and iOS CI remain separate setup work.
- ✅ Record synchronization, export/import, and backup/restore requirements in `DATA_PLAN.md`. Browser persistence now uses IndexedDB; native storage and remote destinations remain open.
- ✅ Add the shared record model, JSON archive v1, browser migration, export/import preview, conflict preservation, and local recovery. Runtime verification remains pending.
- ✅ Add a separate 20-file recent list and paused restoration of the last file in browser, desktop, and Android source. Browser restoration uses supported file handles and existing permission; otherwise it asks for access or reselection. Runtime verification remains pending.
- ✅ Make default browser development a control surface for Bun-owned files and the shared mpv player. Add authenticated loopback commands, system file selection based on Rachana, independent development profile, and explicit `dev:web` mode for PWA checks.
- ✅ Add desktop YouTube link input, installed yt-dlp metadata resolution, audio-only/Watch streams, stable source progress, and a separate 20-link recent list. macOS IINA development checks confirmed Listen/Watch playback, page reload, mode changes that retain pause, seeking, and saved-position recovery. Remaining checks are listed below.
- [ ] Verify Bun control mode: native picker cancel/open, page reload on other targets, closed-tab playback, multiple control tabs, recent-file restoration after terminal restart on other targets, missing mpv, unavailable dialog, stale token after restart, and rejection of foreign Origin/Host/token requests.

## [ ] Data foundation: synchronization and recovery

`DATA_PLAN.md` owns this design. Address identity and persistence before expanding the library, notes, captions, or history.

- ✅ Define the first shared logical model and implement browser progress/settings migration while retaining old data.
- [ ] Connect native data adapters and migrate their progress stores without losing data or background updates.
- [ ] Cover viewed/listened history, progress, metadata, descriptions/comments, subtitles, transcripts, chapters, bookmarks, notes, playlists, and portable settings.
- [ ] Implement portable export/import and manual verified backup/restore, with explicit media inclusion and safe duplicate/conflict handling.
- [ ] Define offline changes, revisions, deletions, and conflict handling for multiple devices. Preserve concurrent text edits and intentional rewinds.
- [ ] Evaluate self-hosting, WebDAV, object storage, and cloud-drive adapters; choose the first destination separately from the data format.
- [ ] Define encryption, credential storage, automatic sync/backups, retention, and provider changes before enabling them.

## [ ] Stage 1: playback ownership and first playable version

### [ ] Decide playback ownership

The first desktop implementation uses a separate mpv process controlled by Bun through private JSON IPC. The interface reads state and sends validated commands. Default browser development controls this same engine through a local authenticated endpoint; `dev:web` explicitly selects a browser media element. Reloading or closing the development browser does not stop Bun playback. The future requirement to unload the desktop WebView must keep native playback, the sleep timer, and saved position alive. Closing the current desktop app still exits playback; tray mode and interface recreation are not implemented.

| Target | Proposed direction | Required check before claiming support |
| --- | --- | --- |
| Desktop | Bun host, native media engine, optional WebView interface | Audio continues after WebView disposal; tray and global shortcuts work; reopening restores the interface without restarting audio |
| Android | Media3 ExoPlayer and MediaSessionService outside the Capacitor WebView; local plugin for the interface | Android build, background audio, notification actions, lock-screen controls, headset events, and interruption handling on a device |
| iOS | Native media layer behind Capacitor | Background audio, system media controls, headset events, and interruption handling on a device |
| PWA | Browser player and browser-supported media controls | Record actual background and control support per browser; do not promise native parity |

- ✅ Use mpv for desktop local playback and Media3 1.11.1 for Android local audio. Keep format, resource, packaging, and license validation open before distribution.
- ✅ Store desktop progress and settings in `Shravanam/playback.json`, outside the WebView. Development control mode uses `Shravanam-dev/playback.json`; standalone PWA progress uses IndexedDB.
- [ ] Define storage for downloaded media. The shell cache is not book storage.
- ✅ Define shared select, play/pause, seek, speed, and interval commands and playback state in `src/playback.ts`. Android maps the same commands to its service. Desktop system controls, sleep timer, and tray integration remain later work.
- ✅ Start with local files: MP3, M4A/M4B, AAC, FLAC, OGG/Opus, WAV, MP4/M4V, WebM, MKV, MOV. Browser codec support varies. Pasted individual YouTube links now have a separate desktop resolver. Generic URLs, other sites, and Android/PWA links remain pending.

### [ ] File drag-and-drop and associations

- ✅ Scope confirmed: external OS file drag-and-drop and OS associations that open media in Shravanam. Internal extension-to-player rules are not requested.
- ✅ Add native OS file-drop handling and separate browser File handling. Both add files to the same interface. Native behavior still needs checks on each OS.
- ✅ Add packaging source for macOS document declarations and optional Windows/Linux Open With registration. The user chooses defaults for double-click opening; no defaults are changed automatically.
- ✅ Add cold-launch arguments, a macOS document-event launcher, authenticated forwarding to an existing instance, and startup buffering. OS drops, associations, and the file dialog share the media-opening flow.
- ✅ Add Android document selection, Open With, and file Share intake through content URIs, with cold/warm intent handling and queued imports. Request persistent read access where granted and identify temporary access in the UI. Device checks remain pending.
- [ ] Use Folder Sync only as a reference for relevant validation and argument handling. Its internal file rules and drag format do not implement incoming OS associations or native file drops.
- ✅ Add accepted files in input order and start the first accepted item of each batch. Skip unsupported entries with a visible error. The list is session-only; automatic next-item playback is not included.
- [ ] Verify native drops, cold/warm OS opening, default double-click opening, spaces in paths, multiple files, and requests during startup on target desktops.

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

mpv is the first desktop playback engine, running as a separate process controlled through private JSON IPC. The source finds an installed or adjacent binary; packaging does not yet bundle it. WebView disposal while retaining playback remains a later stage.

- ✅ Add an installed-IINA fallback on macOS when standalone mpv is absent or fails during startup. Start a separate process with private IPC, silent initialization, and process-local preference overrides. Keep progress in Shravanam and close only its own process.
- ✅ Add desktop Listen/Watch selection, saved with playback settings. Listen disables video. IINA uses RAM cache limits of 32/8 MiB forward/backward for Listen and 128/32 MiB for Watch, with safe hardware decoding requested for video.
- ✅ User confirmed basic playback after updating IINA; the installed version was not recorded.
- ✅ Check recorded YouTube Listen/Watch playback in macOS Bun control mode with installed IINA. The user confirmed video and audio in Watch. Position and 1.25× speed were retained during playing mode changes, and page reload kept Watch playback running. Host and browser logs reported no errors during these checks.
- ✅ Fix paused YouTube Watch-to-Listen switching with process-local `pauseWhenOpen=YES`. macOS IINA 1.5.1 checks confirmed that both directions retain pause and position, playing mode changes continue playback at 1.25×, and startup restores the last local file paused. The host keeps ownership of autoplay.
- ✅ Preserve the latest active-file position across player stop/disconnect and exclude bootstrap properties from saved progress. Show a specific message with Play to reopen the file. Checks below cover macOS IINA; other recovery cases remain open.
- ✅ Check recorded YouTube seeking and recovery in macOS Bun control mode with IINA 1.5.1. Listen buttons moved by -15/+30 seconds on pause, the timeline selected a position, and Watch seeking kept playback active. The user confirmed video/audio synchronization. Play restored the saved position after window closure with the user's auto-quit utility active and after a separate full IINA exit. After a Bun restart, the last local file restored paused and manually selecting the saved YouTube link resumed its position.
- ✅ Keep native EOF state through late position, pause, and duration updates. The Bun regression check covers this event order. macOS IINA 1.5.1 checks confirmed that an eight-second local WAV and a recorded YouTube source pause at the end and restart from zero with Play.
- ✅ Check unexpected IINA exit before the five-second checkpoint with an isolated local WAV. With Bun still running, terminating the test-owned IINA process at 0.71 seconds advanced its disk checkpoint from zero to 0.71 seconds, and Play resumed from that position. This does not cover simultaneous Bun termination or power loss.
- [ ] Verify fallback from an incompatible mpv build; repeat startup, play/pause, speed, seeking, Listen/Watch, paused restoration, end-of-file replay, and recovery before the five-second checkpoint on the other desktop backends. Check file changes, local-file recovery after a host restart, and shutdown while another IINA process is open. Measure CPU and memory before deciding whether to add a separate audio engine. Tauri migration is not selected.

- ✅ Add application-owned `--config-dir`, `mpv.conf`, and editable `input.conf`, created only when absent. Bindings cover the mpv video window; global shortcuts remain future work.
- ✅ Default standalone mpv buffering to `cache=yes`, `cache-on-disk=no`, 128 MiB forward and 32 MiB backward, configurable in `mpv.conf`. IINA uses the mode-specific properties above. This controls media buffering, not OS swap or settings writes. Desktop YouTube input uses metadata resolution and enforces RAM-only media buffering; no offline media download is implemented.
- [ ] Bundle mpv and its dependent libraries with the required licenses for each supported desktop architecture.
- ✅ Resolve recorded YouTube links in the Bun host with installed yt-dlp, then pass validated HTTPS streams to mpv/IINA. Do not depend on the player’s bundled extraction hook.
- ✅ Wait for IINA's silent launch file before opening media and match load completion to the requested path. Prefer IINA's bundled yt-dlp on macOS. A source-level check confirmed that a recorded YouTube audio stream loaded with the correct duration and playback advanced.
- [ ] Verify YouTube extraction with the installed downloader/runtime, separate audio/video synchronization, seeking, and mode changes on other target systems. Check expired-address retry and shutdown cancellation on every supported target.
- [ ] Check distribution size, licenses, supported desktop architectures, video-window behavior, IPC access, and state recovery before adopting it.

Reference: [mpv manual](https://mpv.io/manual/stable/).

### [ ] Android playback and device checks

- ✅ Add a versioned Android library, plugin registration overlay, and repeatable integration in `prepare:android`.
- ✅ Keep ExoPlayer, state, and five-second progress checkpoints in MediaSessionService. Reconnect the UI to an active service without reopening its media.
- ✅ Play audio tracks only and disable video/text tracks. Persist settings and per-file positions in private SharedPreferences, keyed by URI and reported size. Recent descriptors survive service termination; the active file list remains service-session-only.
- ✅ Add media notification preferences for play/pause and time jumps; map previous/next commands to time jumps. Enable audio-focus handling, headphone-disconnect pause, and playback wake lock.
- [ ] Prepare and build the Android project, then install on a device. Check both a modern Android version and the oldest supported API level available for verification.
- [ ] Open MP3/M4B and a video with an audio track. Check speed, configured intervals, end-of-file replay, saved position, and no video playback on Android in this stage.
- [ ] Check single/multiple document selection, cancellation, Open With and Share during cold/warm launch, names with spaces/non-Latin characters, temporary grants, and revoked file access. Confirm that opening the UI again does not restart an already accepted intent.
- [ ] Lock the screen, hide/recreate the interface, remove the active app task, and reopen through the notification. Check continuous audio, one playback instance, correct position, and no unintended autoplay when the service is no longer alive.
- [ ] Check notification and lock-screen controls, headset play/pause and next/previous time jumps, headphone removal, and audio-focus interruptions. Record device-specific restrictions.
- [ ] Add native video display and explicit audio/video switching in a later step.
- [ ] Add media-button playback resumption after service termination when persistent library state exists.

### [ ] Core controls and library state

- ✅ Add local play/pause and playback speed from 0.25× to 3× in browser, desktop, and Android source.
- ✅ Add configurable backward/forward intervals, initially 15/30 seconds, plus Space and Left/Right shortcuts in the app. Settings persist.
- [ ] Seek with buttons and gestures. Define gesture direction, distance, and accidental-touch handling before implementation.
- [ ] Chapters and navigation by chapter.
- ✅ Persist position per local file and restore it on reopening. Browser identity uses name, size, and modification time; desktop identity uses canonical path, size, and modification time. Completed items restart at zero. Runtime verification remains pending.
- ✅ Keep the 20 most recent files, deduplicated and ordered by reopening, independently of the active session list. Automatically reopen the last file paused when access is available. Preserve missing/inaccessible entries for recovery; newer explicit opening must win over pending startup restoration.
- [ ] Verify restart and recent-file selection on each platform: saved position, no startup sound, incoming-file priority, changed/deleted files, revoked access, temporary Android grants, browser picker/drop handles, and browser fallback without handles. Verify browser import/restore still leaves playback stopped.
- [ ] Queue and local playlists. Define the relationship between queue order and chapter navigation.
- [ ] Audio-only and video playback modes.
- [ ] Keep watched/listened history. Decide how completion and partial listening are recorded.
- [ ] Handle calls, other audio, output-device changes, and removed headphones without unexpected playback.

Stage verification: open a supported source, change speed, seek, reopen at the saved position, and confirm that queue and chapter actions do not replace the configured time jumps.

## [ ] Stage 2: background controls and resource use

- ✅ Add the first Android background-service and media-session source. Device checks above remain open; desktop tray and resource-release work is separate.
- [ ] Continue native playback with the screen locked and the interface in the background.
- [ ] Expose play/pause and the configured time jumps through supported lock-screen and headset controls.
- [ ] Add useful notification actions where the platform supports them; define the action set per platform.
- [ ] Investigate volume-button control separately from normal volume adjustment. Define a user-selected mode and supported platforms before intercepting any buttons.
- [ ] Keep desktop tray commands and global shortcuts active with the WebView completely disposed.
- [ ] Recreate the desktop interface on demand from the active playback state without changing position or restarting the track.
- [ ] Keep explicit application exit separate from hiding or disposing its interface.
- [ ] Compare memory, CPU, and energy use for the same media, codec, resolution, and output mode. Check hardware video decoding and avoid duplicate decoders. Lower resource use is a goal to measure, not a guarantee from choosing a native wrapper.
- [ ] In audio-only mode, avoid video decoding and video transfer when the source provides a usable separate audio stream. Record behavior when it does not.

Stage verification: compare playback with the interface open and disposed; confirm that the WebView resources are released, controls still work, and reopening restores the correct state. Test each advertised hardware action on its target platform.

## [ ] Stage 3: downloads, sources, and archive

- [ ] Offline download with a choice of audio-only or video where the source supports it.
- [ ] Automatic downloading. Define triggers, queue limits, network conditions, storage limits, and retry behavior before enabling it.
- [ ] Represent waiting, downloading, interrupted, ready, and failed downloads clearly. An incomplete file must not appear as an offline-ready item.
- ✅ Add manual paste/open of individual recorded YouTube links on desktop, including video links with playlist parameters and explicit timestamps. Keep 20 canonical source links separate from local recents; store no signed stream URLs.
- [ ] Add OS Share/Open with input for YouTube links and Android/PWA adapters. Separate receipt of the link from successful media extraction and playback.
- [ ] Keep source identity with local media so position, notes, and chapters can refer to the same item after download.
- [ ] Search the saved archive and watched/listened history.
- [ ] Keep searchable personal notes on videos, channels, and playlists, including items without a local download.
- [ ] Compare source acquisition options: a maintained external downloader and file import, browser integration or extension, and an embedded browser. Installed yt-dlp is selected for the first desktop YouTube playback path; broader acquisition and download behavior remain open.
- [ ] Investigate reuse of an existing downloader before implementing a browser. Define manual file import versus watched-folder import separately.
- [ ] Evaluate yt-dlp for both media sources and related data: manual and automatic subtitles, descriptions, chapters, and comments where available. Use metadata extraction or `--skip-download` when media bytes are not needed; assess desktop and Android integration separately.
- [ ] Maintain an explicit list of supported sites and source capabilities. The wish to load media from any site remains a research goal, not a promise.

Stage verification: share a supported link, choose an available format, download it, disconnect, and resume at the saved position. Confirm that duplicate imports keep notes attached to the intended item.

## [ ] Stage 4: bookmarks, notes, subtitles, and transcription

- [ ] Timestamped bookmarks and editable notes.
- [ ] Extract available YouTube subtitles and chapter timestamps with descriptions.
- [ ] Evaluate yt-dlp subtitle retrieval with `--write-subs` and `--write-auto-subs`, and selected languages. Import available descriptions and chapters from metadata and comments through `--write-comments`. Retrieving existing automatic captions is separate from generating a new transcript.
- [ ] Import useful video-description text and selected comments as local notes.
- [ ] Let the user keep only useful parts of imported descriptions and comments and edit their local copies. Do not publish these edits back to the source.
- [ ] Attach an imported note to a parsed timestamp or a time chosen by the user. Do not invent a time for text without one.
- [ ] Retain the source reference of imported information and keep imported text distinguishable from the user's edited note.
- [ ] Prevent later metadata refreshes from silently overwriting local edits. Decide whether to retain a separate original snapshot.
- [ ] Transcribe media when required. Decide languages, processing location, timing accuracy, compute limits, and whether a remote service is acceptable.
- [ ] Search personal notes attached to media, channels, and playlists. Decide whether full subtitle and transcript search is included in the first version.

Stage verification: import a timed note, edit it locally, reload metadata, and confirm the edit remains intact. Selecting a timed result must seek to its saved position.

## [ ] Stage 5: adaptive sleep timer

### [ ] Scheduling and signal

- [ ] Configure time-of-day windows for automatic timer activation. The example starts from media opened at 21:00; decide whether opening, starting playback, or entering the window is the actual trigger.
- [ ] Configure the first delay, repeat interval, signal duration, signal gain, volume reduction, number of repeats, and response-wait duration.
- [ ] Offer a short brown-noise signal with fade-in and fade-out.
- [ ] Allow recording a personal signal, for example “Are you asleep?”. Define microphone permission, storage, and replacement behavior when implementing recording.

### [ ] Example sequence, pending exact choices

| State | Example action | Next event |
| --- | --- | --- |
| Initial delay | Start a 15-minute delay for eligible media at 21:00 | User response resets the delay; delay completion starts the signal |
| Signal | Mix in 5 seconds of brown noise at one third of the current volume, with fade-in and fade-out, or use the recorded signal | Enter the repeat cycle |
| Repeat cycle | Repeat after 5 minutes; reduce volume by a configurable step such as 30% | User volume increase resets the cycle; after the configured number of unanswered repeats, pause |
| Paused response window | Save the pause position and wait for a few minutes for a supported headset action or volume change | A qualifying response can resume playback; timeout enters explicit-play-only mode |
| Explicit-play-only mode | Remain paused | Resume only on Play from the headset, notification, or application |

- [ ] Keep the actual pause position and a separate possible sleep-start position for each file. Show them as separate resume choices. The latter is an estimate, not detected sleep.
- [ ] Do not count automatic volume changes made by the timer as user responses.
- [ ] Keep this sequence in the playback owner so unloading the interface does not stop or reset it.
- [ ] Define how schedule boundaries, manual pause, seeking, switching files, queue transitions, and application restart affect a running cycle.

### [ ] Decisions needed before implementation

- [ ] Is a 30% reduction relative to the current volume, the starting volume, or 30 percentage points? Does the first signal already reduce volume?
- [ ] Does “one or two repeats” exclude the first signal? What is the default repeat count?
- [ ] Is the first-delay countdown based on elapsed time or actual playing time? Does entering a scheduled window while media is already playing start it?
- [ ] Does a user response restore the pre-timer volume, keep the new volume, or only reset the countdown?
- [ ] During the pause window, does either direction of volume change count, or only an increase? Which headset button counts, and should it also resume playback?
- [ ] How is possible sleep-start time chosen: last user response, first unanswered signal, or another point?
- [ ] How are signal gain and the one-third level defined relative to application gain and system volume? Is the media kept at its current level during the signal?
- [ ] Define the response-wait duration and behavior where system-volume changes cannot be reliably observed. Keep explicit Play available.

Stage verification: use a controlled event sequence to cover all states, manual and automatic volume changes, saved markers, deadline expiry, and unloading the interface. Verify real headset and system-volume events on devices.

## [ ] Stage 6: spoken time

- [ ] Speak the time at a configurable interval, with 15 minutes as the example.
- [ ] Configure active days and the spoken phrase using hour and minute variables, with 12-hour or 24-hour format.
- [ ] Decide language, voice, and whether speech must work offline.
- [ ] Decide whether the schedule uses clock boundaries such as 21:00 and 21:15 or elapsed intervals from playback start.
- [ ] Decide interaction with paused media, sleep mode, the sleep signal, quiet periods, and missed announcements. Avoid unexpected speech after the sleep timer has paused playback.

Stage verification: cover day boundaries, time format, selected days, schedule changes, and overlap with the sleep timer.

## Technical reference points

These references identify specific platform constraints; they do not select a complete implementation.

- [Android user-approved domain handling](https://developer.android.com/training/app-links/verify-applinks): users can associate an app with declared domains through system settings even without domain verification. Selection and conflicts with other handlers need device verification.
- [Windows website app handlers](https://learn.microsoft.com/en-us/windows/apps/develop/launch/web-to-app-linking): this mechanism requires package identity and a website-hosted association. It is not a general way to claim a third-party site such as YouTube; desktop routing needs a separate integration decision.

- [Android background playback](https://developer.android.com/media/media3/session/background-playback): Android documents a player and media session in a separate service for background playback and external controls. This supports investigating a native playback owner outside the interface.
- [yt-dlp options](https://github.com/yt-dlp/yt-dlp#usage-and-options): yt-dlp supports subtitle files, automatic captions, metadata, and comment retrieval. `--skip-download` permits related-file retrieval without downloading the video. Source availability still needs verification.
- [YouTube captions download](https://developers.google.com/youtube/v3/docs/captions/download): the official API method requires permission to edit the video. This restriction belongs to that API method; it does not describe yt-dlp's subtitle retrieval path.

## [ ] First decisions for the next iteration

- ✅ Choose desktop and Android first, with desktop-browser debugging for the interface.
- ✅ Start with local-file playback, position saving, and configurable time jumps.
- [ ] Validate desktop mpv and OS intake, and Android playback on a device; then implement desktop WebView disposal and tray controls.
- [ ] Resolve the sleep-timer choices when that stage starts; retain the requested examples until then.
- [ ] Decide the source acquisition approach before promising YouTube downloads or arbitrary-site support.
