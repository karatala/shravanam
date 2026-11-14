# Desktop Host

## Purpose

- Runs the shared web application through Bun and the system WebView.

## Ownership

- `main.js` owns the fixed local server, OS data directory, native window, file dialog, OS drops, and single-instance delivery.
- `browser-host.js` provides the development browser's authenticated control endpoint around the same `media.js` player. `system-file-picker.js` uses OS dialogs without a WebView, following Rachana's picker pattern. `profile.js` resolves native profile locations.
- `media.js` owns the accepted file list, recent files, serialized playback actions, and `playback.json` outside the WebView.
- `mpv.js` owns the separate player process, private IPC, and application-owned mpv configuration.

## Local Contracts

- Use loopback port 47870 and the Shravanam data directory, separate from Rachana. Forward launch files to an existing authenticated instance. Fail for an unrelated port occupant; do not select a new origin.
- Serve only the current asset map. Block external navigation and new windows. Expose window controls, native file selection, playback state, and the validated commands from `src/playback.ts`. Do not expose raw mpv IPC or page-supplied paths.
- The local file-forwarding endpoint requires the token from the user's private `open-session.json` and rejects browser Origin headers. Retain batches received before the player is ready.
- Browser development uses port 3000 and the separate `Shravanam-dev` profile to avoid concurrent writes to the packaged desktop profile. Create its player only after the server owns its port. All `/__player` calls require POST, exact loopback Host/Origin, JSON content type, and the per-run token injected into the app HTML. Do not enable CORS, accept page-supplied paths, or expose raw mpv commands. Accept only state, validated playback commands, and system-file selection.
- Reloading, hiding, or closing the development browser must not dispose the Bun player. Terminal shutdown saves progress and closes mpv and a pending file dialog. System dialogs run with argument arrays, never interpolated shell commands. Keep only one picker active.
- Canonicalize and validate native incoming files before registering them. Use the same intake for launch arguments, native file drops, and the file dialog. Add files in order and start the first accepted item.
- Keep positions and settings in `Shravanam/playback.json`. Persist every five seconds, on controls and file changes, and before graceful exit. Key native positions by canonical path, size, and modification time.
- Save 20 recent files with canonical paths in the private profile. Expose names and IDs, never paths, through playback snapshots. Revalidate files before reopening. On startup, restore only the last file and leave mpv paused; incoming launch/drop/Open With requests take priority. Missing or changed files remain in recents with an actionable error.
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
