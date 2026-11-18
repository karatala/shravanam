# Application Shell

## Purpose

- Owns the shared Svelte application for browser, desktop, Android, and iOS.

## Ownership

- `main.ts` mounts the application and removes the startup screen only after mount completes.
- `App.svelte` owns the shell, connection status, and production browser cache registration.
- `Player.svelte` owns file intake, playback controls, keyboard shortcuts, and native state polling while visible.
- `Player.svelte` keeps the compact playback card visible and groups tools into Library, Sources, Sleep, and Settings views. Keep workspace/component instances mounted in hidden containers so navigation preserves unsaved drafts, picker handles, and native polling. Sources belong inside this workspace, not below it as a second page section.
- The mpv-path Browse action uses `chooseMpv` in both desktop bridges. It fills the editable draft, leaves the draft unchanged on Cancel, and keeps Apply separate from file selection.
- `playback.ts` owns accepted extensions, playback state, and the validated command list shared with the desktop host.
- `browser-player.ts` owns browser media playback and object URLs, and writes progress/settings through the IndexedDB adapter in `data/`.
- `browser-files.ts` owns the feature-detected browser file picker and drop handles. Request read access only; capture drop handles before the event's data store closes.
- `LibraryTools.svelte` owns browser archive tools. `LibraryPanel.svelte` owns desktop chapters, ordered playlists, notes, saved device positions, and SRT/VTT import and editing. `NativeLibraryTools.svelte` owns desktop archives, recovery, and manual WebDAV preview/apply. `library.ts`, `library-client.ts`, and `timed-text.ts` own their commands, guarded transport, and timed-text parsing.
- `SleepPanel.svelte` owns desktop timer and spoken-time settings. `sleep.ts` defines validated settings and state; the Bun host owns the actual clock, signals, pause, and speech.
- `data/` owns the shared record model, archive codec, browser migration, and transactional storage under its child contract.
- `android-player.ts` defines the local Capacitor playback plugin contract.
- `AndroidDownloads.svelte` owns the compact Android Downloads view behind `downloadsSupported`, using native `getDownloads`, `downloadCommand`, and `openDownload`. Show part progress and native terminal errors; keep drafts mounted across workspace navigation and poll only while visible/active. Reuse the typed link or canonical current `sourceUrl` as a draft. Never pass local output paths or signed stream addresses through this bridge.
- Android debug snapshots advertise `diagnosticsSupported`. Show the native report action beside playback errors and in Settings through `showDiagnostics`; keep the report and clipboard in native code so LAN HTTP and a failed playback binding do not limit access. Older/release APKs do not advertise this action. The native Server dialog remains the recovery entry when the interface cannot run.
- `bun-player.ts` defines the authenticated same-origin control bridge for browser development. It carries commands and snapshots, without media bytes or local file paths.
- `env.d.ts` defines the narrow desktop window, media, and source bridges.
- `SourcesPanel.svelte` owns manual downloads and userscript import/editing. `SourceTools.svelte` owns the separate website window's toolbar. `sources.ts` validates their commands and snapshots; `source-client.ts` selects the native bridge or authenticated Bun transport.
- `pointer-input.ts` owns local mouse hover detection and pointer focus release.

## Local Contracts

- Use local native buttons and SVG icons for the current shell. Keep their size, style, accessible labels, and actions consistent with the startup header in `index.html`. Do not add an external component-library dependency yet.
- Keep the desktop page compact: 12-13 px control text, roughly 30 px controls, 6-8 px gaps, and small section headings. Use short subnavigation instead of stacked or nested accordions. Keep all functions available; use background, spacing, and color instead of visible borders.
- Release pointer focus after button actions. Capture playback shortcuts outside editable controls, sliders, menus, and dialogs.
- Use Russian for a Russian browser locale and English otherwise. Keep user-visible failures actionable.
- Browser cache state describes the application shell, not book availability. Native hosts skip worker registration.
- Use browser File objects for OS drops in the browser; desktop intake uses native file-drop paths. A batch adds accepted files in order and starts its first accepted item. Desktop persistent playlists explicitly select the EOF queue; ordinary file intake does not enable automatic next-item playback. Android and standalone PWA playlist editing remain pending.
- Browser files stay local and use object URLs. Allocate library IDs and bind files locally by filename, size, and modification time. Store supported file handles in IndexedDB without media bytes. Restore the last file paused when access is already granted; permission requests require a click. Without a handle, show the recent entry and ask for file reselection. Do not upload or copy media into the shell cache. Codec support depends on the browser.
- Show the 20-entry recent list separately from session items. The recent command takes only an app-owned ID on native bridges. Reopening moves that file to the front. File selection still starts playback; automatic startup restoration does not.
- Start the browser player only after its data adapter is ready. Stop and dispose it before import/restore, then recreate it without autoplay. Generation checks prevent stale players in other tabs from overwriting restored data.
- The desktop interface sends validated playback commands and receives state. Never pass arbitrary paths or mpv commands from the page.
- Desktop and Android have a YouTube URL form that sends the bounded `open-youtube` command through their native bridge. Android enables submission only with `youtubeSupported` in the service snapshot; an older APK shows an update hint. Keep source resolution out of the WebView and hide URL entry in standalone PWA. Show `recentLinks` separately from local recents; Android uses the `recent` command to reopen one. Native snapshots contain titles and app-owned IDs, not signed stream URLs or headers. Android errors must suggest checking the connection/video and updating the APK, not installing desktop executables.
- Desktop snapshots can include `backend` and `audioOnly`. Show the backend and the standard Listen/Watch select when supported; send only the validated `audio-only` boolean command. Android exposes the select with `videoSupported`; its private native video screen follows service audio. Disable Watch for Android audio-only items. Standalone browser mode switching remains separate.
- `videoLoading` and `videoError` describe video preparation separately from audio loading. Keep playback controls enabled while video resolves; explain that the picture joins the current position. Player settings show Windows system-control status, registered shortcuts, and conflicts. System Play/Pause use the validated idempotent `pause` command.
- `Player.svelte` provides native desktop Player settings, including Bun browser control mode. Keep the editable `mpvPath` draft stable during polling; activate the Settings view after `missing-player`, `player-path`, or `player-settings`. Send the explicit `mpv-path` setting through the existing trusted playback bridge. Empty resets automatic search. This local executable setting is not a media path, portable library record, or Android/PWA option.
- Desktop source controls can open the isolated website window, hand the selected video to the native player, and download a pasted or selected YouTube link. `open-youtube` accepts an optional audioOnly boolean so mode and source change in one operation without resolving the previous source again. Preserve explicit source timestamps.
- Android shows a Browser button with `sourceBrowserSupported`, calling only the narrow native `openBrowser` method. The native screen owns HTTPS navigation and explicit YouTube Listen/Watch/Download actions. Older APKs do not show unsupported download controls. Android uses its own download adapter; keep desktop userscript controls out of Android and standalone PWA until their adapters exist. The desktop website toolbar is a trusted local view with a separate external content view below it; do not iframe third-party pages into the app. Show installed script scope, let the user edit/import and explicitly save, and keep playback shortcuts out of script textareas. Do not describe the metadata subset as full Violentmonkey compatibility.
- `shravanamBunHost` selects the local Bun player without enabling desktop window controls. It uses desktop library tools and must not create a browser media player, migrate browser storage, or show browser backup tools. Keep transport failures visible and actionable. Native state polling must not erase file-dialog or unsupported-drop errors.
- Keep desktop library/sync/timer controls out of Android and standalone PWA until their adapters exist. Archive and sync confirmation must match the reviewed preview token. Stop and flush native playback before replacing library data; export and replacement must fail if the flush fails. Show device positions as explicit resume choices rather than choosing the greatest position or a device clock.
- Desktop background is explicit through `backgroundWindow`. Close exits. Do not hide a native window until the tray is available; disposing the interface must leave playback and timers in Bun.
- Browser control mode opens files through Bun's system dialog. Browser drops cannot provide native paths; explain how to use Open files instead. Keep native window OS drops and standalone PWA File handling intact.
- Android uses the native service through the plugin and does not create a browser media element for playback. Use the system picker; receive shared files in native code. Show temporary file access and independent video failures explicitly. Native connection failures must not silently switch to website playback.
- Explain `player-closed` as stopped playback or a closed player, with Play to reopen at the saved position. Do not suggest changing the media format for this state.
- Native player state is authoritative. Stop polling when the document is hidden and refresh on return; visibility changes must not pause native playback.
- When duration is unknown, keep the saved/current time label, show `--:--` for duration, and keep the disabled seek slider at zero. Do not clamp a nonzero saved time into a fake one-second range and display it as completed playback.
- `FEATURE_PLAN.md` records playback, downloads, and background audio requirements. Resolve its open behavior choices before implementing the affected feature.

## Work Guidance

## Verification

- `bun run check` checks Svelte and frontend types when requested.

## Child DOX Index

- `data/AGENTS.md`: logical data records, portable archive rules, browser persistence, migration, and recovery. `data/FORMAT.md` documents archive v1.
