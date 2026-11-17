# Application Tooling

## Purpose

- Owns Bun web builds, local serving, desktop packaging source, and Capacitor preparation source.

## Ownership

- `build-web.js` compiles Svelte through Bun and generates the production offline revision from the current output.
- `dev-desktop.js` builds development assets in `tmp/web`, reads their current asset list, and starts `desktop/main.js` with DevTools enabled. It uses the normal desktop port/profile and does not watch files; restart after source changes.
- `serve.js` serves development output on port 3000 and production preview on port 4173, both on loopback. Default development connects to the Bun-owned player in `desktop/browser-host.js`; `--web` and production preview use standalone web playback.
- `serve.js --android` serves only interface files on LAN port 3001, builds to `tmp/android-web`, and injects the development reload client. It must not create the desktop browser host or expose its player/source endpoints. Validate request hosts against local addresses; LAN serving is explicit and separate from desktop development.
- `android-dev.js` owns port 3001, private IPv4 discovery, and validation of the optional Android development URL. When several interfaces exist, require an explicit URL instead of choosing a VPN or virtual adapter.
- `android-reload.js` polls the development revision while visible. Reload only after a successful build, including after a server restart. Keep the current interface when the server is unavailable. Full reload discards unsaved interface edits; the Android playback service remains the audio owner.
- The development startup message names mpv on Windows/Linux and the mpv/IINA alternatives only on macOS. The selected backend comes from playback state, not this startup message.
- `build-desktop.js` embeds the current asset list and the platform WebviewJS addon. On macOS it compiles the document launcher and packages the Bun host as `ShravanamHost`.
- `desktop-associations.js` generates macOS media document declarations and optional Windows/Linux Open With registration output. Packaging does not execute registration or change defaults.
- `prepare-mobile.js` creates and syncs the requested Capacitor target.
- `prepare-mobile.js android --dev` accepts `--url http://192.168.1.10:3001` or `SHRAVANAM_ANDROID_DEV_URL`. Pass the selected URL only to Capacitor child commands. Normal Android/iOS preparation removes this environment value before sync. Debug APKs can select a server or bundled files at runtime through their native Server control; that device-local selection takes priority over the build-time URL. Standard preparation does not clear device preferences. `capacitor.config.ts` contains no saved development address.
- `prepare-android.js` applies the versioned Android player library and MainActivity after sync, including its debug manifest and native server settings. It generates media-type metadata from `src/playback.ts` and adds each Gradle link once. All Android debug APKs include the runtime server selector without a build-time address.

## Local Contracts

- Use Bun without Vite. Keep desktop/web development output in `tmp/web`, Android LAN development output in `tmp/android-web`, production output in `dist`, and native output in `release`.
- Development builds include linked Bun source maps and the Svelte compiler's input source maps for browser debugging. Production builds do not generate source maps.
- Store all asset-list names and HTML asset URLs with forward slashes on every OS. Keep source maps in the development asset list so the native host can serve them.
- Inject the per-run Bun bridge configuration only in development HTML responses. Do not write it into build output or service-worker caches. Validate the request host, prevent framing of the control page, and never allow cross-origin control requests. Restart the terminal after host/script changes; frontend source changes still use the existing rebuild watcher.
- Route `/__sources` and player/library/sleep methods through the authenticated desktop browser host. Allow bounded request bodies up to 34 MiB for a normalized library archive of at most 16 MiB plus JSON escaping. Validate each command separately; userscripts remain limited to 128 KiB. `?tool=sources` selects the native website window's local toolbar and receives its own native source/window bridge, never a bridge in the website view.
- The production asset list excludes stale output, documentation, source maps, and the worker itself. Never cache audio through the shell worker.
- Keep signing and publication outside these scripts. Android preparation includes the background-player source; it does not build an APK or establish device support.
- Generated iOS and Android projects remain ignored. Durable native changes belong in versioned source overlays. Edit `native/android` instead of generated copies. Run `prepare:android` after native source edits; bare `cap sync` does not apply those edits.
- Run install, build, packaging, and native preparation commands only when requested.

## Work Guidance

## Verification

- `bun test tests/android-dev.test.js tests/android-prepare.test.js` checks LAN serving, desktop API isolation, successful/failed rebuild revisions, URL validation, and remote/bundled preparation environments. These checks use temporary fixtures and do not build the app or prepare native targets. Phone checks remain in `FEATURE_PLAN.md`.

## Child DOX Index
