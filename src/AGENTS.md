# Application Shell

## Purpose

- Owns the shared Svelte application for browser, desktop, Android, and iOS.

## Ownership

- `main.ts` mounts the application and removes the startup screen only after mount completes.
- `App.svelte` owns the shell, connection status, and production browser cache registration.
- `Player.svelte` owns file intake, playback controls, keyboard shortcuts, and native state polling while visible.
- `playback.ts` owns accepted extensions, playback state, and the validated command list shared with the desktop host.
- `browser-player.ts` owns browser media playback and object URLs, and writes progress/settings through the IndexedDB adapter in `data/`.
- `LibraryTools.svelte` owns browser archive export, import preview, conflict-version priority, and local recovery controls. Native backup controls remain deferred until native adapters exist.
- `data/` owns the shared record model, archive codec, browser migration, and transactional storage under its child contract.
- `android-player.ts` defines the local Capacitor playback plugin contract.
- `env.d.ts` defines the narrow desktop window and media bridge.
- `pointer-input.ts` owns local mouse hover detection and pointer focus release.

## Local Contracts

- Use local native buttons and SVG icons for the current shell. Keep their size, style, accessible labels, and actions consistent with the startup header in `index.html`. Do not add an external component-library dependency yet.
- Release pointer focus after button actions. Capture playback shortcuts outside editable controls, sliders, menus, and dialogs.
- Use Russian for a Russian browser locale and English otherwise. Keep user-visible failures actionable.
- Browser cache state describes the application shell, not book availability. Native hosts skip worker registration.
- Use browser File objects for OS drops in the browser; desktop intake uses native file-drop paths. A batch adds accepted files in order and starts its first accepted item. Do not imply automatic next-item playback or persistent playlists.
- Browser files stay local and use object URLs. Allocate library IDs and bind files locally by filename, size, and modification time; the user reselects files after reload. Do not upload or copy media into the shell cache. Codec support depends on the browser.
- Start the browser player only after its data adapter is ready. Stop and dispose it before import/restore, then recreate it without autoplay. Generation checks prevent stale players in other tabs from overwriting restored data.
- The desktop interface sends validated playback commands and receives state. Never pass arbitrary paths or mpv commands from the page.
- Android uses the native service through the plugin and does not create a browser media element. Use the system picker; receive shared files in native code. Show audio-only video behavior and temporary file access explicitly. Native connection failures must not silently switch to browser playback.
- Native player state is authoritative. Stop polling when the document is hidden and refresh on return; visibility changes must not pause native playback.
- `FEATURE_PLAN.md` records playback, downloads, and background audio requirements. Resolve its open behavior choices before implementing the affected feature.

## Work Guidance

## Verification

- `bun run check` checks Svelte and frontend types when requested.

## Child DOX Index

- `data/AGENTS.md`: logical data records, portable archive rules, browser persistence, migration, and recovery. `data/FORMAT.md` documents archive v1.
