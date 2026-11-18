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
| `bun run dev:android` | Serve development UI over the LAN on port 3001 with automatic reload for the Android debug app |
| `bun run check` | Check Svelte and frontend TypeScript |
| `bun run build` | Write the production web app and offline worker to `dist` |
| `bun run preview` | Serve `dist` on `http://127.0.0.1:4173` for PWA checks |
| `bun run desktop` | Open the existing `dist` app in the system WebView |
| `bun run build:desktop` | Build web files and an unsigned native executable for the current system in `release` |
| `bun run prepare:android` | Build bundled web files, remove the build-time server URL, sync Capacitor, and apply the Android player module |
| `bun run prepare:android:dev` | Prepare Android to load UI from the LAN server; accepts `--url http://192.168.1.10:3001` |
| `bun run android:deploy [--alongside]` | Build the local debug APK and install or update it on an ADB device |
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

On YouTube, Watch now attaches video without reopening or pausing the audio. The picture can appear later and joins the current playback position. Audio controls and the sleep timer keep working while video is prepared. Switching back to Listen removes the external video tracks and keeps the audio running. If only a combined stream is available, disabling video still leaves its combined media transfer.

On Windows, system media controls and headset media buttons use Shravanam's media session. Play/Pause/Stop retain the current source; Previous/Next use the configured time jumps. Global shortcuts are **Ctrl+Alt+Space** for play/pause, **Ctrl+Alt+Left/Right** for backward/forward, and **Ctrl+Alt+Home** to open the interface. They remain active in background mode. Player settings show connection status and shortcut conflicts. If a combination is occupied, close the conflicting application and restart Shravanam. Physical headset behavior still needs a device check. Windows can label this session as `powershell.exe`; the track title and artist show Shravanam.

With IINA, Shravanam starts and owns a separate application process. It does not send commands to an existing IINA window. It starts with a generated silent WAV while connecting, then loads the selected file with sound muted until the saved position and pause state are applied. IINA preferences are overridden for this process through launch arguments, not edited on disk. IINA does not use Shravanam's standalone mpv configuration files. Its media cache stays in RAM: Listen uses 32 MiB forward and 8 MiB backward; Watch uses 128 MiB forward and 32 MiB backward. Video requests safe hardware decoding. These are cache limits, not total memory limits. IINA may show its own window while controlled by Shravanam.

For the first IINA check, restart `bun run dev`, open a local MP3 or M4B, and check play/pause, speed, seeking, browser reload, and paused restoration after a terminal restart. Open a local video and switch Listen/Watch. Keep a separate IINA window open to check that closing Shravanam affects only its own player process. The user confirmed basic playback after updating IINA. Stop/close recovery and the remaining checks above still need verification. After closing the player, Play reopens the file at its latest received position; bootstrap and stopped-player properties must not replace that position. Pasted YouTube links are supported as described below; other sites and OS link associations remain pending.

## YouTube playback on desktop

In default `bun run dev` or native desktop, paste an HTTPS link to one recorded YouTube video and press **Open link**. Watch URLs, youtu.be links, Shorts, and embed links are accepted. A video link with a playlist parameter opens only that video. Playlist-only links, active/upcoming live streams, sign-in, PWA links, and other sites are not supported in this step. Android playback is described below.

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

Use **Open files** for the system document picker, or **Open with / Share** for an audio or video file in another app. Incoming files go through a serial import flow, including requests received during connection startup. Shared YouTube text and arbitrary HTTP links are not handled yet. The app requests persistent read access when the provider grants it. If access is temporary, the interface tells you to reselect through **Open files**. It does not request broad storage access, copy media, or upload files. A cloud document provider may still require a network connection for its selected files.

Paste a recorded YouTube video link into the field beside **Open files** and tap **Open** to play its audio. Android packages youtubedl-android 0.18.1, its extraction runtime, and QuickJS; Media3 still owns playback and system controls. Streaming does not cache media on disk. Explicit offline downloads also package FFmpeg 0.18.1 for audio extraction and video merging. No external executable path or installation is needed. New native support requires one updated APK; an older APK using a new LAN interface shows an update hint instead of enabling an unsupported command. See the [extractor library](https://github.com/yausername/youtubedl-android/tree/0.18.1).

The APK pins yt-dlp 2026.10.26 and EJS 0.8.0 separately from the Android library's old default. An APK update verifies and refreshes that cached code from bundled resources while retaining saved positions and downloads. Diagnostics show these versions. Recorded videos prefer the visionOS YouTube client, with one embedded-client fallback when extraction/probes fail. See [extractor provenance and updates](native/android/EXTRACTOR.md). A saved time with `--:--` duration means playback metadata is not ready; the disabled slider stays empty until the player reports duration.

Open **Downloads**, paste a recorded YouTube link or use the current video's prefilled link, select Audio or video up to 480p/720p/1080p, and tap **Download**. The native browser also has a **Download** format picker for its actual current YouTube page. One manual transfer runs at a time in a separate foreground service with progress and Cancel in its notification. Android 13+ asks for notification permission; denying it does not prevent a user-started transfer, but Android can hide its notification from the drawer. Progress shows the current audio/video part, bytes, speed, and remaining time. **Cancel** keeps partial files; **Retry** obtains fresh source addresses and resumes available parts. Processing and validation finish before the file becomes ready. Process termination marks unfinished entries interrupted and requires an explicit retry; no automatic queue or retry runs on launch. Transfers stop at the system timeout or the app's six-hour limit.

Use **Listen** or **Watch** on a ready entry with the network disconnected. Normal YouTube opening, paused startup restoration, and headset Play also prefer an available downloaded copy. The canonical YouTube media ID and saved position are shared by online audio, downloaded audio, and downloaded video. Watch reads available local video independently from the service audio clock. Finishing a download does not replace or stop current playback. The private offline directory and atomic index are outside Android backup and library archives. Files survive app restarts and remain until app data or the app is removed. Retry keeps partial data and moves a damaged completed file aside. Signed stream addresses, headers, and metadata JSON are not stored. Device checks for real extraction, merging, background cancellation, restart, and airplane-mode playback remain pending.

The separate saved-links list keeps 20 canonical YouTube URLs and titles. Progress uses the stable video ID, and an explicit link timestamp overrides it. Signed stream URLs and HTTP headers stay in memory. Reopening and Play after a stream error resolve a fresh address; restart restores the last source paused. Extraction is cancelled when another item is selected or playback stops, and interface reload leaves it with the service. Live streams, OS link sharing, scripts, and offline downloads remain pending. Real YouTube playback and background continuity still need device verification.

Use **Listen / Watch** for a local video or recorded YouTube video. The service continues audio while a private native screen prepares video and synchronizes it to the current position. Video uses a second Media3 player with audio disabled; closing or backgrounding this screen releases its decoder and keeps service audio running. Returning rebuilds the picture at the current position. YouTube video is limited to 1080p and prefers H.264. Accepted local file extensions come from the shared playback contract; provider-declared audio/video MIME types also work when names do not identify the format. Codec support depends on the device.

Tap **Browser** beside **Open files** to search YouTube or open an HTTPS page. On a recorded video page, tap **Listen** or **Watch** to close the browser and transfer the source to the native player. This website WebView has no app bridge and is muted; it requires Android System WebView with audio-muting support. Backgrounding releases the page, and returning reloads its last address. See [source browsing](SOURCE_BROWSER.md). These native additions require a new APK, including when the interface comes from LAN; older APKs show an update hint. AV sync, silent browsing, and background return still need device checks.

Private SharedPreferences store speed, intervals, positions, and recent file descriptors. Progress saves every five seconds and on playback changes. Android file identity uses the content URI and reported size. Different providers may give the same file a different identity. The active list lives as long as the service; recents survive service restart. Opening the app revalidates the last source and prepares it paused at its saved position. If a file's grant expired, select it again through **Open files**. Completed items restart at zero.

The service declares foreground media-playback and wake-lock permissions. Media3 owns audio focus, the playback notification, and lock-screen/headset/media-key routing independently of the interface. The notification shows the track title, local-file/YouTube source, Play/Pause, and configured backward/forward jumps in a localized Playback channel. Tapping it returns to the main interface without reopening media. Android chooses the actual button layout on each device.

Previous/Rewind seek backward and Next/Fast-forward seek forward by the configured intervals within the current item. Stop cancels pending opening, saves position, and leaves the item available for Play. One Play/Pause action after EOF replays the item; Play after a failed YouTube stream resolves a fresh address. Pause during provider/YouTube loading prevents late autoplay. Disconnecting headphones also pauses and cancels pending autoplay before the first source starts; focus loss cancels pending autoplay as well. Volume buttons retain normal system behavior.

Check the new APK with both a local file and YouTube: use the notification and lock screen, test headset Play/Pause and Previous/Next with nondefault intervals, Stop then Play, EOF replay, and headphone removal while a source is still loading. Repeat in the background, with the interface reloaded, and in Watch mode. Native unit cases use a fake Media3 player; actual notification layout, Bluetooth gestures, task removal, and interruption behavior still need device checks.

After the service has ended, headset Play or Play/Pause can restart it at the last saved position without opening the interface. A local file needs its persisted document permission; select it again through **Open files** if access was temporary, revoked, or the file changed. YouTube obtains a fresh stream address from its saved canonical link. The foreground loading notification provides Play/Pause and Stop while restoration runs, with a 60-second limit. Pause, headphone removal, Stop, and newer explicit selections prevent stale autoplay. Headset resumption starts in Listen mode. Ordinary app startup still restores paused.

Pause, Stop, EOF, and orderly shutdown flush the saved position. Abrupt process death can lose progress since the latest five-second checkpoint. Test cold-service resumption on a phone with both local and YouTube sources, including a slow/unavailable provider, offline extraction, and cancellation. Android force-stop requires opening the app again; system restrictions can also refuse a background start, in which case the app asks you to open Shravanam and press Play. Reboot does not start audio automatically, and a System UI resumption carousel after reboot is a separate feature. See [Media3 playback resumption](https://developer.android.com/media/media3/session/background-playback#resumption).

For an Android device check, use `bun run prepare:android`, then `bun run open:android`, and build/run from Android Studio. Preparation copies the native module and MainActivity into the ignored Android project and adds its Gradle links without duplication. Keep durable edits in `native/android`; rerun preparation after those edits. A bare `cap sync` does not update the native overlay. Media3 dependencies resolve through Gradle, separately from Bun's lockfile.

The mobile application ID is `org.karatala.shravanam`. Mobile preparation does not sign or publish. Capacitor's default mobile launch assets remain until the app design is chosen. Android build and device verification are still pending. References: [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [media controls](https://developer.android.com/media/media3/session/control-playback).

PWA URLs are relative, so the output can be hosted at a root or a subpath. No publication destination is configured. See [LOCAL_OFFLINE.md](LOCAL_OFFLINE.md).

## Install Android updates from the computer

Install the Bun dependencies and set up Android Studio with a JDK 21, Android SDK Platform 36, Build Tools 36.0.0, and Platform-Tools. The deploy command can find the default SDK and Android Studio JDK locations. For custom locations set `ANDROID_HOME` to the SDK and `JAVA_HOME` to the JDK. Restart the terminal after changing them.

Connect the phone with USB debugging, or pair it once through **Wireless debugging** in Android Studio. Keep the phone and computer on the same network for Wi-Fi. Check that the phone is listed as `device` by `adb devices`. If several devices are ready, set `ANDROID_SERIAL` to the phone's listed serial. [Android device setup](https://developer.android.com/studio/run/device)

- `bun run android:deploy` bundles the current interface, applies the native source overlay, builds the debug APK and installs it on the phone. Gradle reuses its local build cache. Repeat the command after native changes. Local edits are included directly.
- `bun run android:deploy --alongside`, or **Deploy Android Dev** in VS Code, installs **Shravanam Dev** beside a GitHub APK. The first run creates a separate app with its own positions, downloads and server setting. Later runs update that copy in place.

Android preserves app data on updates with the same app ID and signing key. GitHub artifacts use the runner's debug key, which normally differs from the key on your computer. If the keys differ, the deploy command reports the failure and keeps the installed APK. Use the alongside option to retain the old app and data. Keep the local debug keystore between builds. [Android app signing](https://developer.android.com/studio/publish/app-signing)

## Android LAN development

Android debug APKs include **Playback diagnostics** in Settings and a **Diagnostics** button beside playback errors. If the web interface does not work, use the native **Server → Playback diagnostics** button. Reproduce the error, open the report, and tap **Copy**. The report includes APK/device versions, extraction stages and stderr, HTTP probe status, and Media3 error codes with exception causes. Refresh updates the displayed report. Logs stay in process memory and reset when the process exits; URLs, paths, and credentials are removed before storage and Logcat (`ShravanamDebug`). A new APK is required for this native feature; reloading the LAN interface alone does not add it. Release APKs keep diagnostics disabled.

Install a debug APK locally or from GitHub once. It includes a native **Server** button at the top right, independent of the web interface. The phone and computer must use the same reachable Wi-Fi network. Allow Bun through the firewall for private networks on port 3001. Use this mode only for development on a trusted network.

1. Run `bun run dev:android` and keep its terminal open. It prints the available LAN URLs and preparation commands. In VS Code, `Debug Android LAN` or `Dev Android LAN` starts the same server.
2. In the debug app, tap **Server**, enter the printed Wi-Fi address, for example `http://192.168.1.10:3001`, and tap **Connect**. The address stays on this device across app restarts. Use the computer's LAN address: `127.0.0.1` on the phone refers to the phone.
3. To change computers or IP addresses, open **Server** and enter the new address. Tap **Built-in interface** to return to the files included in the APK. Both actions work without rebuilding or reinstalling. The native button stays available if the server is down or its JavaScript fails.
4. Edit the interface source. After a successful rebuild, connected interfaces reload automatically. Development source maps are included. Failed builds keep the current interface open and report the error in the server terminal.

The Android service still owns playback. Changing the interface source recreates its Activity and reconnects its controller; playback continuity needs a device check. LAN mode does not add native features to an older APK. Java code, Capacitor plugins, or permissions still require a new APK. A full page reload clears unsaved form text. Server controls and the HTTP policy overlay are enabled only in debug variants.

If the interface cannot load, use the native **Server** button to fix the address or return to the built-in interface. Check the server, Wi-Fi address, port, and firewall. Stopping the LAN server does not send Stop to the Android player.

For local native development, `bun run prepare:android:dev --url http://192.168.1.10:3001` can still set an initial address before opening Android Studio with `bun run open:android`. Without `--url`, it selects one private IPv4 address or asks for an explicit choice; `SHRAVANAM_ANDROID_DEV_URL` is an optional local override. A source selected in the installed debug app takes priority. Standard `prepare:android` removes only the build-time URL; use **Built-in interface** to clear a device's saved server selection. See [Capacitor Live Reload](https://capacitorjs.com/docs/guides/live-reload).

## VS Code debugging

Desktop and Android are the first native targets. Develop and debug the shared interface in a desktop browser.

For the native desktop, select `Debug Desktop` in Run and Debug and press F5, or run the `Dev Desktop` task. This runs `bun run dev:desktop`, builds development output in `tmp/web`, and opens the system WebView with DevTools and source maps. Use those DevTools for frontend breakpoints. The same Bun host creates the tray and supports **Continue in background**. Browser launches (`Debug app` and `Debug Web (PWA)`) do not create a tray. On Windows, also check the tray's hidden-icons menu.

Close any existing desktop instance before native debugging; otherwise the new process forwards to that instance and exits. Native development uses port 47870 and the normal `Shravanam` profile, including saved positions and window state. Restart the native development terminal after source changes. This terminal launch does not attach a VS Code debugger to Bun or the frontend. Close the player or choose tray **Quit** to stop it; the player window's close button still exits instead of entering background mode.

After installing dependencies, select `Debug app` in Run and Debug, then press F5. Like Rachana, this uses `node-terminal` to run `bun run dev` from the workspace root. Wait for the server address, then open `http://127.0.0.1:3000` in your browser. F5 does not open a browser or attach VS Code to frontend code. Use browser developer tools; development output retains TypeScript and Svelte source maps. Reload the page after the terminal reports an updated build.

Use either F5 or the `Dev` task to start the server, not both. Stop the server with Ctrl+C in its terminal. For a server started through `Dev`, you can also use `Tasks: Terminate Task`. Stop any other server on port 3000 before starting a new one. The Bun server does not accept Rachana's Vite `--host` argument.

Shared tasks: `Dev Desktop`, `Dev`, `Dev Web (PWA)`, `Dev Android LAN`, `Check`, `Build`, `Preview`, `Run Desktop`, `Build Desktop`, `Prepare Android`, `Deploy Android Dev`, and `Open Android`. `Debug Web (PWA)` is the matching terminal launch for `dev:web`. `Preview` and `Run Desktop` first run `Build`. `Prepare Android` builds web output and syncs the native project; use `Open Android` afterward. Personal VS Code settings remain ignored.

Default browser debugging controls actual mpv playback through Bun. Native window behavior, tray controls, global shortcuts, and Android background behavior need their own platform checks.

## GitHub CI

`.github/workflows/build.yml` follows Rachana's build pattern for the current delivery targets. It runs on pull requests, tag pushes, and manual dispatch. Ordinary branch pushes do not trigger it. Once the workflow is on the default branch, use **Actions → Cross-platform build → Run workflow** for a manual run.

Only Android CI is active for now. Web and desktop jobs remain defined but are temporarily skipped with job-level conditions, so no PWA or desktop artifacts are built. The Android job runs `bun run check`, prepares the native player overlay, and builds a debug APK. Download the Android APK from the run's **Artifacts** section; retention is 14 days. It uses the runner's generated debug key, not a stable distribution key.

Gradle dependencies and wrapper distributions use the GitHub Actions cache. Pull requests read it; trusted manual/tag jobs can update it. A Maven Central HTTP 429 during Gradle configuration gets at most three attempts, with 60- and 120-second pauses. Compilation and test failures stop immediately. Persistent repository throttling can still fail the job; wait before a later run rather than clearing the cache or changing dependency versions.

CI uses read-only repository access and no custom secrets. After this updated workflow reaches GitHub, start a run at the updated commit; rerunning an older run uses its older workflow definition. A successful remote Android run is still pending. There are no release-publication jobs: this workflow does not publish a GitHub Release, deploy a PWA, or build iOS. Rachana's release destination and Pages settings are not inherited.

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
