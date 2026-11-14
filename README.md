# Shravanam

Lightweight audiobook application base, adapted from the sibling Rachana project in `../Komprohit`.

The current source contains a Svelte interface, Bun build and local server, a production PWA shell cache, and local-file playback. The browser uses its media player and an IndexedDB library with data export/import; the Bun desktop host controls mpv outside the system WebView. Android has a Media3 playback service connected to Capacitor. iOS native playback, downloads, full library management, native library adapters, and desktop background controls remain future work. Browser data recovery and native platform behavior still need verification.

## Requirements

- Bun, with the same runtime used for Rachana.
- Native desktop prerequisites from `@webviewjs/webview` on the target system.
- mpv installed on PATH for desktop playback. Standard Homebrew paths are also checked on macOS. Desktop packaging does not yet bundle mpv or its libraries.
- Xcode Command Line Tools for the macOS document-opening launcher.
- Android Studio and its SDK for Android; macOS and Xcode for iOS.

Package versions and registry integrity values come from Rachana's lockfile. The lockfile contains only the selected dependency graph. There is no Vite or external component-library dependency. Current controls and pointer behavior are local. A separate `karatala-ui` library is deferred until shared needs from several projects are clear.

## Commands

Run these commands when you want to install, check, or build the base:

| Command | Purpose |
| --- | --- |
| `bun install --frozen-lockfile` | Install the locked dependencies |
| `bun run dev` | Build development files in `tmp/web` and serve on `http://127.0.0.1:3000`; reload the browser after edits |
| `bun run check` | Check Svelte and frontend TypeScript |
| `bun run build` | Write the production web app and offline worker to `dist` |
| `bun run preview` | Serve `dist` on `http://127.0.0.1:4173` for PWA checks |
| `bun run desktop` | Open the existing `dist` app in the system WebView |
| `bun run build:desktop` | Build web files and an unsigned native executable for the current system in `release` |
| `bun run prepare:android` | Build web files, sync Capacitor, and apply the versioned Android player module |
| `bun run prepare:ios` | Build web files, create the iOS project if needed, and sync Capacitor |
| `bun run open:android` / `bun run open:ios` | Open the generated native project in its IDE |

The desktop host uses `127.0.0.1:47870` and its own `Shravanam/webview` directory below the OS application-data directory. Launching again forwards files to the running instance through a local authenticated endpoint. The page has a limited window/media bridge. WebView storage must not be treated as disposable while it holds application data.

## Local playback

Use **Open files**, or drag files from Finder/Explorer into the window. A batch adds all supported files in order and starts its first item. Select another item from the list. Play/pause, speed from 0.25× to 3×, and configurable time jumps are available. Space toggles playback; Left/Right use the configured intervals, initially 15/30 seconds. Shortcuts leave text fields, selects, sliders, and dialogs alone.

Accepted extensions: `mp3`, `m4a`, `m4b`, `aac`, `flac`, `ogg`, `opus`, `wav`, `mp4`, `m4v`, `webm`, `mkv`, `mov`. Browser codecs vary; start with an MP3. Files are not uploaded. The list is session-only and does not automatically advance at the end.

Positions save every five seconds and on pause, seeking, file changes, and graceful exit. Reopen the same unchanged file to resume; completed files start at zero. In the browser, reselect the file after reloading. Browser library IDs are stable; local file matching uses name, size, and modification time, not a content hash. Desktop identity uses canonical path, size, and modification time. Moving or changing a desktop file creates a new identity. Abrupt termination can lose the last few seconds; browser page-exit writes are also subject to its lifecycle limits.

Desktop progress and settings live in `Shravanam/playback.json`, outside the WebView. The first mpv launch creates `Shravanam/mpv/mpv.conf` and `input.conf` if absent. Edit them while the app is closed. Defaults are `cache=yes`, `cache-on-disk=no`, `demuxer-max-bytes=128MiB`, and `demuxer-max-back-bytes=32MiB`. These settings control media buffering, not OS swap or progress writes. mpv video appears in its own native window; its `input.conf` shortcuts are not global. Closing Shravanam currently stops playback.

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

Private SharedPreferences store speed, intervals, and positions every five seconds and on playback changes. Android file identity uses the content URI and reported size. Different providers may give the same file a different identity. The list lives as long as the service. After the service stops, reselect a file to resume; opening the app alone does not start sound. Completed files restart at zero.

The service declares foreground media-playback and wake-lock permissions. Media3 owns the playback notification and audio-focus handling; disconnecting headphones pauses playback. Session controls request play/pause and configured time jumps. Received previous/next commands also seek by those intervals. Actual notification layout, lock-screen buttons, headset mappings, task removal, and interruption behavior require device checks. Volume buttons retain their system behavior. Playback resumption after the OS kills the service is not implemented.

For an Android device check, use `bun run prepare:android`, then `bun run open:android`, and build/run from Android Studio. Preparation copies the native module and MainActivity into the ignored Android project and adds its Gradle links without duplication. Keep durable edits in `native/android`; rerun preparation after those edits. A bare `cap sync` does not update the native overlay. Media3 dependencies resolve through Gradle, separately from Bun's lockfile.

The mobile application ID is `org.karatala.shravanam`. Mobile preparation does not sign or publish. Capacitor's default mobile launch assets remain until the app design is chosen. Android build and device verification are still pending. References: [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [media controls](https://developer.android.com/media/media3/session/control-playback).

PWA URLs are relative, so the output can be hosted at a root or a subpath. No publication destination is configured. See [LOCAL_OFFLINE.md](LOCAL_OFFLINE.md).

## VS Code browser debugging

Desktop and Android are the first native targets. Develop and debug the shared interface in a desktop browser.

After installing dependencies, select `Debug app` in Run and Debug, then press F5. Like Rachana, this uses `node-terminal` to run `bun run dev` from the workspace root. Wait for the server address, then open `http://127.0.0.1:3000` in your browser. F5 does not open a browser or attach VS Code to frontend code. Use browser developer tools; development output retains TypeScript and Svelte source maps. Reload the page after the terminal reports an updated build.

Use either F5 or the `Dev` task to start the server, not both. Stop the server with Ctrl+C in its terminal. For a server started through `Dev`, you can also use `Tasks: Terminate Task`. Stop any other server on port 3000 before starting a new one. The Bun server does not accept Rachana's Vite `--host` argument.

Shared tasks: `Dev`, `Check`, `Build`, `Preview`, `Run Desktop`, `Build Desktop`, `Prepare Android`, and `Open Android`. `Preview` and `Run Desktop` first run `Build`. `Prepare Android` builds web output and syncs the native project; use `Open Android` afterward. Personal VS Code settings remain ignored.

Browser debugging covers the web interface. Native audio, tray controls, global shortcuts, and Android background behavior need their own native checks.

## GitHub CI

`.github/workflows/build.yml` follows Rachana's build pattern for the current delivery targets. It runs on pull requests, tag pushes, and manual dispatch. Ordinary branch pushes do not trigger it. Once the workflow is on the default branch, use **Actions → Cross-platform build → Run workflow** for a manual run.

The web job runs `bun run check` and builds the PWA. Native jobs build Windows x64, Linux x64, macOS arm64/x64, and an Android debug APK. Android preparation includes the native player overlay before Gradle builds it. Download successful outputs from the run's **Artifacts** section; retention is 14 days. Desktop packages still need an installed mpv, and Android debug artifacts use the runner's generated debug key, not a stable distribution key.

CI uses read-only repository access and no custom secrets. The configuration is added locally; a successful GitHub run is still pending. It does not publish a GitHub Release, deploy a PWA, or build iOS. Rachana's release destination and Pages settings are not inherited.

## Data portability and synchronization

Synchronization, export/import, and backups are required for history, progress, source texts, subtitles, transcripts, notes, and the rest of the library. [DATA_PLAN.md](DATA_PLAN.md) records scope, conflict handling, restore behavior, and open decisions. It proposes local-first data with separate destination adapters; self-hosting, WebDAV, object storage, and cloud drives remain candidates. Media inclusion and encryption are explicit design choices.

The first implementation is available in the browser under **Data and backups**. It stores library records in IndexedDB, migrates valid old browser progress/settings while retaining the originals, and exports an unencrypted JSON archive without media files. Import validates version, checksum, record links, and size before showing a preview. Conflicting variants are both retained; current versions stay active by default. A changed import saves the previous library atomically. **Previous local copy** restores that snapshot and retains the replaced data in the recovery slot. Export the JSON file to keep a copy outside browser storage.

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
