# Shravanam

Lightweight audiobook application base, adapted from the sibling Rachana project in `../Komprohit`.

The current source contains a Svelte interface, Bun build and local server, a production PWA shell cache, and local-file playback. Default development uses the browser as controls for the Bun-owned mpv player; packaged desktop uses the same playback engine outside the system WebView. Standalone PWA mode uses a browser media player and an IndexedDB library with data export/import. Android has a Media3 playback service connected to Capacitor. iOS native playback, downloads, full library management, native library adapters, and desktop background controls remain future work. Browser data recovery and native platform behavior still need verification.

## Requirements

- Bun, with the same runtime used for Rachana.
- Native desktop prerequisites from `@webviewjs/webview` on the target system.
- mpv installed on PATH for desktop playback and default `bun run dev`. On macOS, standard Homebrew paths and mpv.app in system/user Applications are also checked. If mpv is absent or fails during startup, Shravanam tries IINA.app from system/user Applications and keeps using IINA for that host session. An incompatible mpv build can still produce a macOS crash report before fallback. Desktop packaging does not yet bundle a player or its libraries.
- The development system file dialog uses macOS `osascript`, Windows PowerShell/Windows Forms, or Linux `zenity` with `kdialog` as a fallback. Native desktop keeps its WebviewJS file dialog.
- Xcode Command Line Tools for the macOS document-opening launcher.
- Android Studio and its SDK for Android; macOS and Xcode for iOS.

Package versions and registry integrity values come from Rachana's lockfile. The lockfile contains only the selected dependency graph. There is no Vite or external component-library dependency. Current controls and pointer behavior are local. A separate `karatala-ui` library is deferred until shared needs from several projects are clear.

## Commands

Run these commands when you want to install, check, or build the base:

| Command | Purpose |
| --- | --- |
| `bun install --frozen-lockfile` | Install the locked dependencies |
| `bun run dev` | Build UI in `tmp/web`; serve browser controls on `http://127.0.0.1:3000` with Bun-owned files and mpv playback |
| `bun run dev:web` | Use the same development URL with standalone browser/PWA playback and browser data tools |
| `bun run dev:desktop` | Build development UI with source maps, then open the native desktop window with DevTools and tray |
| `bun run check` | Check Svelte and frontend TypeScript |
| `bun run build` | Write the production web app and offline worker to `dist` |
| `bun run preview` | Serve `dist` on `http://127.0.0.1:4173` for PWA checks |
| `bun run desktop` | Open the existing `dist` app in the system WebView |
| `bun run build:desktop` | Build web files and an unsigned native executable for the current system in `release` |
| `bun run prepare:android` | Build web files, sync Capacitor, and apply the versioned Android player module |
| `bun run prepare:ios` | Build web files, create the iOS project if needed, and sync Capacitor |
| `bun run open:android` / `bun run open:ios` | Open the generated native project in its IDE |

The desktop host uses `127.0.0.1:47870` and its own `Shravanam/webview` directory below the OS application-data directory. Launching again forwards files to the running instance through a local authenticated endpoint. The page has a limited window/media bridge. WebView storage must not be treated as disposable while it holds application data.

If mpv is not found, open **Player settings**, use **Browse…** to select its executable or enter its full path without quotes or arguments, and choose **Apply**. Cancel leaves the path unchanged. For example, use `C:\Players\mpv\mpv.exe` on Windows or `/usr/local/bin/mpv` on macOS/Linux. Then press **Play** or reopen the file. An invalid path shows correction instructions. Clear the field and apply to restore automatic search. A running engine keeps its current executable until it restarts; restart Shravanam to use a changed path immediately. The setting stays in the local profile's `player.json`, outside portable archives and synchronization. Player search does not depend on a package manager.

Default development uses `Shravanam-dev` below that OS application-data directory. Bun owns recent paths, progress, settings, and mpv; the browser receives state and sends commands through an authenticated loopback endpoint. The development profile is separate from packaged desktop and browser IndexedDB. Existing browser data is retained and remains available through `dev:web`; select a file once through the native dialog to start its native history. Reloading or closing the browser leaves audio running. Ctrl+C in the server terminal saves progress and stops mpv. Backend edits require a terminal restart; frontend edits still require only a page reload after the rebuild message.

## Local playback

Use **Open files** for the system dialog in default development. Native desktop also accepts OS drops, and standalone PWA mode accepts browser File drops. A browser cannot pass a dropped file's absolute path to Bun; its control mode explains how to select the file with Open files instead. A batch adds all supported files in order and starts its first item. Select another item from the list. Play/pause, speed from 0.25× to 3×, and configurable time jumps are available. Space toggles playback; Left/Right use the configured intervals, initially 15/30 seconds. Shortcuts leave text fields, selects, sliders, and dialogs alone.

Accepted extensions: `mp3`, `m4a`, `m4b`, `aac`, `flac`, `ogg`, `opus`, `wav`, `mp4`, `m4v`, `webm`, `mkv`, `mov`. Browser codecs vary; start with an MP3. Files are not uploaded. The list is session-only and does not automatically advance at the end.

Positions save every five seconds and on pause, seeking, file changes, and graceful exit. Reopen the same unchanged file to resume; completed files start at zero. Browser library IDs are stable; local file matching uses name, size, and modification time, not a content hash. Desktop identity uses canonical path, size, and modification time. Moving or changing a desktop file creates a new identity. Abrupt termination can lose the last few seconds; browser page-exit writes are also subject to its lifecycle limits.

**Recent files** remembers up to 20 files separately from the current session list. Startup reopens the last file at its saved position, paused. Explicit Open With or launch files take priority. Missing, changed, or inaccessible files show an error with a way to reopen them. The browser stores file handles when its picker/drop API supports them; automatic reopening requires an existing read grant. Click the recent entry to renew permission, or use **Open files** when a handle is unavailable. Ordinary file-input selection retains metadata only. This feature does not copy media into browser storage. Recent paths, URIs, handles, and their local order are not part of portable data archives.

Desktop progress and settings live in `Shravanam/playback.json`, outside the WebView. The first mpv launch creates `Shravanam/mpv/mpv.conf` and `input.conf` if absent. Edit them while the app is closed. Defaults are `cache=yes`, `cache-on-disk=no`, `demuxer-max-bytes=128MiB`, and `demuxer-max-back-bytes=32MiB`. These settings control media buffering, not OS swap or progress writes. mpv video appears in its own native window; its `input.conf` shortcuts are not global. Closing Shravanam currently stops playback.

Desktop starts in **Listen** mode: video tracks are disabled, including for local video files. Choose **Watch** to enable video in the separate player window. The mode is saved with playback settings. The interface shows whether mpv or IINA is active.

With IINA, Shravanam starts and owns a separate application process. It does not send commands to an existing IINA window. It starts with a generated silent WAV while connecting, then loads the selected file with sound muted until the saved position and pause state are applied. IINA preferences are overridden for this process through launch arguments, not edited on disk. IINA does not use Shravanam's standalone mpv configuration files. Its media cache stays in RAM: Listen uses 32 MiB forward and 8 MiB backward; Watch uses 128 MiB forward and 32 MiB backward. Video requests safe hardware decoding. These are cache limits, not total memory limits. IINA may show its own window while controlled by Shravanam.

For the first IINA check, restart `bun run dev`, open a local MP3 or M4B, and check play/pause, speed, seeking, browser reload, and paused restoration after a terminal restart. Open a local video and switch Listen/Watch. Keep a separate IINA window open to check that closing Shravanam affects only its own player process. The user confirmed basic playback after updating IINA. Stop/close recovery and the remaining checks above still need verification. After closing the player, Play reopens the file at its latest received position; bootstrap and stopped-player properties must not replace that position. Pasted YouTube links are supported as described below; other sites and OS link associations remain pending.

## YouTube playback on desktop

In default `bun run dev` or native desktop, paste an HTTPS link to one recorded YouTube video and press **Open link**. Watch URLs, youtu.be links, Shorts, and embed links are accepted. A video link with a playlist parameter opens only that video. Playlist-only links, active/upcoming live streams, sign-in, Android/PWA links, and other sites are not supported in this step.

Shravanam uses installed yt-dlp. On macOS it first checks the copy named `youtube-dl` inside IINA.app in system/user Applications. Otherwise it checks beside the host executable, PATH, and standard macOS package-manager paths. A current version with its YouTube JavaScript support is needed. Installed Node/Bun are enabled, and yt-dlp can also use its default Deno runtime. No downloader, runtime, plugin, or remote helper is installed automatically. If extraction fails, update the selected yt-dlp or IINA copy and check the runtime requirement.

**Listen** requests only audio. **Watch** requests video and audio with a preference for 1080p/H.264 and safe hardware decoding. Mode changes resolve fresh streams and preserve position and pause state; a short pause can occur. yt-dlp returns metadata and stream addresses without downloading media files. Native playback uses RAM-only media buffering. This does not prevent OS swap or writes of saved positions.

Progress uses the stable YouTube video ID. An explicit `t` or `start` timestamp takes priority when opening a pasted link; otherwise playback resumes from saved progress. The separate **Recent YouTube links** list keeps up to 20 links and titles. Signed stream addresses and request headers are not saved. Reopening resolves a fresh stream address. Links are reopened manually after a host restart; startup still restores the last local file. These device-local records are not yet part of shared-library export or synchronization.

An IINA source-level check loaded a public recorded video in Listen mode, confirmed its stream path and duration, and confirmed that playback advanced. IINA startup now waits for the silent launch file to load before replacing it; a file-loaded event for another path cannot complete the requested load. Manual verification remains pending for the restarted browser host, seeking, speed changes, Listen/Watch changes while playing and paused, player close/Play recovery, recent links after host restart, and switching back to a local file. Also check invalid links, unavailable videos, missing/outdated yt-dlp, missing JavaScript support, network failure, and host shutdown during extraction.

## Desktop file associations

Packaging source includes OS integration for the supported extensions. It registers an available viewer; choose Shravanam as the default through your OS when you want double-click opening.

- macOS: the `.app` contains document declarations and a small Swift launcher, following Rachana. Use Finder's **Open With**. To set a default, use **Get Info → Open with → Change All** for the chosen type.
- Windows: after moving the packaged folder to its permanent location, run its `Register file types.ps1` with PowerShell. Then use **Open with** or Windows default-app settings.
- Linux: after moving the packaged folder, run `python3 register-file-types.py` from that folder. Then select Shravanam in the file manager. Python 3 is required for this optional registration step.

Cold launches and existing instances use the same native media intake. Registration and these platform flows still need native verification. Browser development does not register associations. Website routing remains separate future work.

## Android native playback

The versioned source under `native/android` adds Media3 1.11.1, an ExoPlayer inside a `MediaSessionService`, and a local `ShravanamPlayer` Capacitor plugin. The service owns playback and progress. The interface uses the same controls and reads native snapshots; it stops polling while hidden. Destroying the interface releases its controller connection, not the active player.

Use **Open files** for the system document picker, or **Open with / Share** for an audio or video file in another app. Incoming files go through a serial import flow, including requests received during connection startup. HTTP links and shared YouTube text are not handled yet. The app requests persistent read access when the provider grants it. If access is temporary, the interface tells you to reselect through **Open files**. It does not request broad storage access, copy media, or upload files. A cloud document provider may still require a network connection for its selected files.

Android currently plays audio only, including audio tracks from video files. Video and text tracks are disabled. Accepted file extensions come from the shared playback contract; provider-declared audio/video MIME types also work when names do not identify the format. Codec support depends on the device.

Private SharedPreferences store speed, intervals, positions, and recent file descriptors. Progress saves every five seconds and on playback changes. Android file identity uses the content URI and reported size. Different providers may give the same file a different identity. The active file list lives as long as the service; recent files survive service restart. Opening the app revalidates the last file and prepares it paused at its saved position. If its grant expired, select it again through **Open files**. Completed files restart at zero.

The service declares foreground media-playback and wake-lock permissions. Media3 owns the playback notification and audio-focus handling; disconnecting headphones pauses playback. Session controls request play/pause and configured time jumps. Received previous/next commands also seek by those intervals. Actual notification layout, lock-screen buttons, headset mappings, task removal, and interruption behavior require device checks. Volume buttons retain their system behavior. Headset-only playback resumption after the OS kills the service is not implemented; reopening the app restores the last accessible file paused.

For an Android device check, use `bun run prepare:android`, then `bun run open:android`, and build/run from Android Studio. Preparation copies the native module and MainActivity into the ignored Android project and adds its Gradle links without duplication. Keep durable edits in `native/android`; rerun preparation after those edits. A bare `cap sync` does not update the native overlay. Media3 dependencies resolve through Gradle, separately from Bun's lockfile.

The mobile application ID is `org.karatala.shravanam`. Mobile preparation does not sign or publish. Capacitor's default mobile launch assets remain until the app design is chosen. Android build and device verification are still pending. References: [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [media controls](https://developer.android.com/media/media3/session/control-playback).

PWA URLs are relative, so the output can be hosted at a root or a subpath. No publication destination is configured. See [LOCAL_OFFLINE.md](LOCAL_OFFLINE.md).

## VS Code debugging

Desktop and Android are the first native targets. Develop and debug the shared interface in a desktop browser.

For the native desktop, select `Debug Desktop` in Run and Debug and press F5, or run the `Dev Desktop` task. This runs `bun run dev:desktop`, builds development output in `tmp/web`, and opens the system WebView with DevTools and source maps. Use those DevTools for frontend breakpoints. The same Bun host creates the tray and supports **Continue in background**. Browser launches (`Debug app` and `Debug Web (PWA)`) do not create a tray. On Windows, also check the tray's hidden-icons menu.

Close any existing desktop instance before native debugging; otherwise the new process forwards to that instance and exits. Native development uses port 47870 and the normal `Shravanam` profile, including saved positions and window state. Restart the native development terminal after source changes. This terminal launch does not attach a VS Code debugger to Bun or the frontend. Close the player or choose tray **Quit** to stop it; the player window's close button still exits instead of entering background mode.

After installing dependencies, select `Debug app` in Run and Debug, then press F5. Like Rachana, this uses `node-terminal` to run `bun run dev` from the workspace root. Wait for the server address, then open `http://127.0.0.1:3000` in your browser. F5 does not open a browser or attach VS Code to frontend code. Use browser developer tools; development output retains TypeScript and Svelte source maps. Reload the page after the terminal reports an updated build.

Use either F5 or the `Dev` task to start the server, not both. Stop the server with Ctrl+C in its terminal. For a server started through `Dev`, you can also use `Tasks: Terminate Task`. Stop any other server on port 3000 before starting a new one. The Bun server does not accept Rachana's Vite `--host` argument.

Shared tasks: `Dev Desktop`, `Dev`, `Dev Web (PWA)`, `Check`, `Build`, `Preview`, `Run Desktop`, `Build Desktop`, `Prepare Android`, and `Open Android`. `Debug Web (PWA)` is the matching terminal launch for `dev:web`. `Preview` and `Run Desktop` first run `Build`. `Prepare Android` builds web output and syncs the native project; use `Open Android` afterward. Personal VS Code settings remain ignored.

Default browser debugging controls actual mpv playback through Bun. Native window behavior, tray controls, global shortcuts, and Android background behavior need their own platform checks.

## GitHub CI

`.github/workflows/build.yml` follows Rachana's build pattern for the current delivery targets. It runs on pull requests, tag pushes, and manual dispatch. Ordinary branch pushes do not trigger it. Once the workflow is on the default branch, use **Actions → Cross-platform build → Run workflow** for a manual run.

The web job runs `bun run check` and builds the PWA. Native jobs build Windows x64, Linux x64, macOS arm64/x64, and an Android debug APK. Android preparation includes the native player overlay before Gradle builds it. Download successful outputs from the run's **Artifacts** section; retention is 14 days. Desktop packages still need installed mpv or, on macOS, IINA. Android debug artifacts use the runner's generated debug key, not a stable distribution key.

CI uses read-only repository access and no custom secrets. The configuration is added locally; a successful GitHub run is still pending. It does not publish a GitHub Release, deploy a PWA, or build iOS. Rachana's release destination and Pages settings are not inherited.

## Data portability and synchronization

Synchronization, export/import, and backups are required for history, progress, source texts, subtitles, transcripts, notes, and the rest of the library. [DATA_PLAN.md](DATA_PLAN.md) records scope, conflict handling, restore behavior, and open decisions. It proposes local-first data with separate destination adapters; self-hosting, WebDAV, object storage, and cloud drives remain candidates. Media inclusion and encryption are explicit design choices.

The first implementation is available in standalone PWA mode (`dev:web` or production preview) under **Data and backups**. It stores library records in IndexedDB, migrates valid old browser progress/settings while retaining the originals, and exports an unencrypted JSON archive without media files. Import validates version, checksum, record links, and size before showing a preview. Conflicting variants are both retained; current versions stay active by default. A changed import saves the previous library atomically. **Previous local copy** restores that snapshot and retains the replaced data in the recovery slot. Export the JSON file to keep a copy outside browser storage. Bun/native profiles are not included in this archive yet.

Import/restore stops the initiating player; reselect the file afterward. Stale players in other tabs cannot overwrite restored data and ask for a reload. Matching one imported media record by filename, size, and modification time can restore its progress; changed/renamed files need future explicit relinking. Invalid legacy entries are reported and remain in the old storage, but are excluded from the new archive. The archive supports 16 MiB and 20,000 record variants. See [archive v1](src/data/FORMAT.md) for the record model and merge rules.

The model includes notes, subtitles/transcripts, chapters, history, and playlists for import/export; their authoring and extraction interfaces remain future work. Native desktop/Android stores are still separate and are not included in browser backups. Native adapters, cross-platform relinking, automatic backups, encryption, and remote synchronization are the next data stages. Browser migration and recovery still need runtime verification.

## Next work

The original feature text is in [TODOS.md](TODOS.md). [FEATURE_PLAN.md](FEATURE_PLAN.md) contains the structured backlog, sleep-timer sequence, proposed stages, and open decisions.

- [ ] Verify local playback, saved positions, OS drops, and file associations on target desktops.
- [ ] Build and check Android native playback, system opening, notification controls, screen lock, and headset actions on a device. See `FEATURE_PLAN.md` for the check list.
- [ ] Replace the temporary Rachana icons with Shravanam assets and configure native launch icons.
- [ ] Verify dependency installation, source checks, PWA offline use, and each requested native target.
- [ ] Verify the first GitHub CI run and browser data recovery, then connect desktop/Android storage to the shared data format before adding remote synchronization.

## Source and license

This repository retains its existing GPL license in `LICENSE`. The startup layout, offline-cache approach, and native-host approach are adapted from Rachana. The three PNG assets in `public/icons` are temporary copies of Rachana's application icon. The local pointer helpers retain the behavior previously supplied by the shared UI package.
