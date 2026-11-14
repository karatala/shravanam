# Desktop Host

## Purpose

- Runs the shared web application through Bun and the system WebView.

## Ownership

- `main.js` owns the fixed local server, OS data directory, native window, file dialog, OS drops, and single-instance delivery.
- `media.js` owns the accepted file list, serialized playback actions, and `playback.json` outside the WebView.
- `mpv.js` owns the separate player process, private IPC, and application-owned mpv configuration.

## Local Contracts

- Use loopback port 47870 and the Shravanam data directory, separate from Rachana. Forward launch files to an existing authenticated instance. Fail for an unrelated port occupant; do not select a new origin.
- Serve only the current asset map. Block external navigation and new windows. Expose window controls, native file selection, playback state, and the validated commands from `src/playback.ts`. Do not expose raw mpv IPC or page-supplied paths.
- The local file-forwarding endpoint requires the token from the user's private `open-session.json` and rejects browser Origin headers. Retain batches received before the player is ready.
- Canonicalize and validate native incoming files before registering them. Use the same intake for launch arguments, native file drops, and the file dialog. Add files in order and start the first accepted item.
- Keep positions and settings in `Shravanam/playback.json`. Persist every five seconds, on controls and file changes, and before graceful exit. Key native positions by canonical path, size, and modification time.
- Find mpv beside the executable, in macOS Resources, on PATH, or at standard Homebrew paths. Do not download it automatically. Bundling remains separate work.
- Create `mpv/mpv.conf` and `mpv/input.conf` only when missing. Default to RAM caching with 128 MiB forward and 32 MiB backward limits; no media disk cache. Input bindings apply to the mpv video window, not global hotkeys.
- Closing the app currently stops mpv after saving. Tray mode and WebView disposal without stopping playback remain future work. Video uses mpv's separate native window.
- Keep native decorations disabled. The HTML startup header provides movement and close controls before Svelte loads and after startup failure.
- The current WebView directory is persistent. Do not clear it or assume it holds only reproducible cache.
- Native source configuration does not establish tested platform support.

## Work Guidance

## Verification

- Run desktop builds and native checks only when requested.

## Child DOX Index
