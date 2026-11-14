# Application Tooling

## Purpose

- Owns Bun web builds, local serving, desktop packaging source, and Capacitor preparation source.

## Ownership

- `build-web.js` compiles Svelte through Bun and generates the production offline revision from the current output.
- `serve.js` serves development output on port 3000 and production preview on port 4173, both on loopback.
- `build-desktop.js` embeds the current asset list and the platform WebviewJS addon. On macOS it compiles the document launcher and packages the Bun host as `ShravanamHost`.
- `desktop-associations.js` generates macOS media document declarations and optional Windows/Linux Open With registration output. Packaging does not execute registration or change defaults.
- `prepare-mobile.js` creates and syncs the requested Capacitor target.
- `prepare-android.js` applies the versioned Android player library and MainActivity after sync, generates media-type metadata from `src/playback.ts`, and adds each Gradle link once.

## Local Contracts

- Use Bun without Vite. Keep development output in `tmp/web`, production output in `dist`, and native output in `release`.
- Development builds include linked Bun source maps and the Svelte compiler's input source maps for browser debugging. Production builds do not generate source maps.
- The current asset list excludes stale output, documentation, source maps, and the worker itself. Never cache audio through the shell worker.
- Keep signing and publication outside these scripts. Android preparation includes the background-player source; it does not build an APK or establish device support.
- Generated iOS and Android projects remain ignored. Durable native changes belong in versioned source overlays. Edit `native/android` instead of generated copies. Run `prepare:android` after native source edits; bare `cap sync` does not apply those edits.
- Run install, build, packaging, and native preparation commands only when requested.

## Work Guidance

## Verification

## Child DOX Index
