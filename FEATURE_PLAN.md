# Shravanam feature plan

This is a planning document, not a list of implemented features. `TODOS.md` retains the original Russian feature text. Values in the sleep-timer example are examples, not approved defaults. Resolve open choices before implementing their behavior. The proposed stage order can change.

## Current scope

- ✅ First delivery targets: desktop and Android. Debug the shared interface in a desktop browser. Keep iOS and installed-PWA delivery for later stages.
- ✅ Add shared VS Code tasks and a Rachana-style `node-terminal` launch using `bun run dev`. Open a browser manually and use its developer tools with development source maps. Runtime checks remain pending.
- [ ] Implement the features below. The current application is still a platform shell.
- [ ] Design a separate `karatala-ui` library from common needs in several projects. This is deferred and is not part of the player implementation.

## [ ] Stage 1: playback ownership and first playable version

### [ ] Decide playback ownership

The requirement to unload the desktop WebView means that the WebView cannot own the active audio player. Proposed direction: Bun manages the desktop application; a native media engine owns playback. The interface reads state and sends commands. Closing the interface must not destroy playback, the sleep timer, or saved position. The concrete engine and process arrangement remain open.

| Target | Proposed direction | Required check before claiming support |
| --- | --- | --- |
| Desktop | Bun host, native media engine, optional WebView interface | Audio continues after WebView disposal; tray and global shortcuts work; reopening restores the interface without restarting audio |
| Android | Native player and media session outside the Capacitor WebView | Background audio, notification actions, lock-screen controls, headset events, and interruption handling on a device |
| iOS | Native media layer behind Capacitor | Background audio, system media controls, headset events, and interruption handling on a device |
| PWA | Browser player and browser-supported media controls | Record actual background and control support per browser; do not promise native parity |

- [ ] Select the desktop engine for the desktop/Android first stage. Compare required formats, video support, speed control, memory use, packaging size, and license requirements.
- [ ] Define storage outside the WebView for native playback state and downloaded media. The shell cache is not book storage.
- [ ] Define the minimum commands and state shared by interface, native controls, sleep timer, and tray. Keep one authoritative playback owner per session.
- [ ] Define first supported inputs and formats: local files, direct media URLs, and site links are separate input types.

### [ ] Desktop mpv candidate

mpv is a candidate, not a selected or bundled dependency. Proposed integration: a separate process controlled by Bun through JSON IPC, so playback survives WebView disposal.

- [ ] Evaluate bundling mpv with an application-owned `--config-dir`, `mpv.conf`, and editable `input.conf`. Keep global shortcuts in the host; player-window bindings alone do not cover hidden-window use.
- [ ] Default online playback to configurable RAM buffering: `cache=yes`, `cache-on-disk=no`. Expose memory limits through `demuxer-max-bytes` and `demuxer-max-back-bytes`; choose their defaults later. Keep offline downloads separate. This disables media disk caching, not OS swap or settings writes.
- [ ] Evaluate site-link resolution through mpv's yt-dlp integration separately from direct-stream playback.
- [ ] Check distribution size, licenses, supported desktop architectures, video-window behavior, IPC access, and state recovery before adopting it.

Reference: [mpv manual](https://mpv.io/manual/stable/).

### [ ] Core controls and library state

- [ ] Play and pause; adjustable playback speed.
- [ ] Configurable backward and forward time intervals in the main controls instead of previous/next-track actions.
- [ ] Seek with buttons and gestures. Define gesture direction, distance, and accidental-touch handling before implementation.
- [ ] Chapters and navigation by chapter.
- [ ] Remember position for each media item and restore it when that item is reopened.
- [ ] Queue and local playlists. Define the relationship between queue order and chapter navigation.
- [ ] Audio-only and video playback modes.
- [ ] Keep watched/listened history. Decide how completion and partial listening are recorded.
- [ ] Handle calls, other audio, output-device changes, and removed headphones without unexpected playback.

Stage verification: open a supported source, change speed, seek, reopen at the saved position, and confirm that queue and chapter actions do not replace the configured time jumps.

## [ ] Stage 2: background controls and resource use

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
- [ ] Open a link shared from YouTube. Separate receipt of the link from successful media extraction and playback.
- [ ] Keep source identity with local media so position, notes, and chapters can refer to the same item after download.
- [ ] Search the saved archive and watched/listened history.
- [ ] Keep searchable personal notes on videos, channels, and playlists, including items without a local download.
- [ ] Compare source acquisition options: a maintained external downloader and file import, browser integration or extension, and an embedded browser. No option is selected yet.
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

- [Android background playback](https://developer.android.com/media/media3/session/background-playback): Android documents a player and media session in a separate service for background playback and external controls. This supports investigating a native playback owner outside the interface.
- [yt-dlp options](https://github.com/yt-dlp/yt-dlp#usage-and-options): yt-dlp supports subtitle files, automatic captions, metadata, and comment retrieval. `--skip-download` permits related-file retrieval without downloading the video. Source availability still needs verification.
- [YouTube captions download](https://developers.google.com/youtube/v3/docs/captions/download): the official API method requires permission to edit the video. This restriction belongs to that API method; it does not describe yt-dlp's subtitle retrieval path.

## [ ] First decisions for the next iteration

- ✅ Choose desktop and Android first, with desktop-browser debugging for the interface.
- [ ] Choose the first source type. Proposed small starting point: local-file playback, position saving, and configurable time jumps.
- [ ] Select and validate a playback engine that can survive closing its interface before implementing desktop WebView disposal.
- [ ] Resolve the sleep-timer choices when that stage starts; retain the requested examples until then.
- [ ] Decide the source acquisition approach before promising YouTube downloads or arbitrary-site support.
