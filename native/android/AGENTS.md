# Android Playback

## Purpose

- Own the versioned Android library and app overlay for native local/YouTube playback and source browsing behind Capacitor.

## Ownership

- `player/` is an Android library with Media3, the playback service, and the Capacitor plugin.
- `PlaybackService.java` owns playback, persistence, notification preferences, and system time-jump commands. `MediaFile.java` validates granted files and reads provider metadata. `ShravanamPlayerPlugin.java` owns the controller binding, picker, and incoming-intent queue.
- `YouTubeSource.java` validates individual HTTPS YouTube links and explicit timestamps. `YouTubeResolver.java` uses the pinned youtubedl-android 0.18.1 runtime to resolve audio or video streams and bounded headers. Media3 remains the playback engine.
- `NativeVideoActivity.java` and `player/src/main/res/layout/shravanam_video.xml` own the private video screen. `VideoSync.java` decides secondary-renderer seeks, frame visibility, and play state from the service audio clock.
- `SourceBrowserActivity.java` owns the private website WebView and native toolbar. `SourceBrowserUrl.java` validates HTTPS addresses and search input. `PlaybackConnection.java` binds temporary native screens to the service; `NativeControls.java` owns their compact controls and system insets.
- `MainActivity.java` registers the local plugin and selects the debug interface origin before Capacitor creates its bridge.
- `DevelopmentServer.java` owns the debug-only native Server button, settings dialog, and device-local server preference. `DevelopmentServerUrl.java` validates local HTTP origins on port 3001 without DNS lookup.
- `scripts/prepare-android.js` copies this source into the ignored Android project and generates accepted media types from `src/playback.ts`.

## Local Contracts

- The service owns the primary audio ExoPlayer and authoritative playback state. Disable its video/text tracks. The app WebView only selects files, sends validated commands, and reads snapshots. Releasing any interface controller must not release active playback.
- The plugin and service run in the same application process. Keep service access on the main thread; query file providers on the service's serial worker.
- Accept granted content URIs from the system document picker, Open With, and media sharing. Do not expose arbitrary URI or path opening to JavaScript. Attempt persistent read access only when the sender grants it; report temporary access in item metadata.
- No broad storage permission, media copying, arbitrary media URL opening, or automatic downloads. Recorded YouTube links use native extraction with no media download or disk cache. Share/Open With for links, live streams, scripts, and offline downloading remain separate work.
- Watch opens a second, video-only ExoPlayer with audio/text disabled and audio focus disabled. It follows the service clock without seeking, pausing, or replacing audio to synchronize. Hide the TextureView until a frame is decoded near the audio position; hold video that is ahead and seek video that is behind. Playback controls affect the primary session. Release the secondary decoder, resolver, and controller when the screen pauses; rebuild video at the current audio position on return. Listen closes the video screen and leaves audio running.
- Video extraction uses a separate cancellable worker with a 60-second limit, generation guards, a 1080p maximum, and H.264 preference. Keep only the app-owned media ID in video intents. Service revision/owner tokens prevent old screen cleanup and errors from overwriting a newer request. Video failures remain separate from audio failures.
- The source browser is a plain WebView, never a Capacitor/BridgeActivity, with no JavaScript interface. Keep native controls outside the website. Permit HTTPS navigation only; disable file/content access, mixed content, and new windows. Require WebView MUTE_AUDIO support and mute the page so it cannot produce a second soundtrack; request an Android System WebView update when unavailable. Use a separate website profile when MULTI_PROFILE is supported, avoid the HTTP cache, and destroy the website view on pause. Return reloads the last address without restoring page DOM/history.
- Listen/Watch in the browser validates the actual current YouTube page again and hands its canonical source and selected mode to the service in one command. Destroy the website view and close the browser after handoff. Website downloads only show an unavailable hint; websites must never receive app file, service, or window bridges.
- Keep 20 canonical YouTube links separately from local recents, with the desktop-compatible YouTube media ID and saved position. Do not put signed stream URLs or headers in preferences, snapshots, archives, or application error logs. Restore the last source paused; obtain a new stream on reopening and on Play after a stream failure.
- Run extraction on the service's worker, not in the WebView. Bound it to 60 seconds, cancel old work when selection changes or playback stops, and ignore stale completions. Pause/media-key actions during resolution set the requested playback state. A UI reload must not start extraction again. Use stream-specific Media3 HTTP headers, leaving local-file playback unchanged.
- The packaged extractor includes its runtime and QuickJS; do not fetch extractor updates or remote helper components during playback. App packaging must use extracted native libraries and `useLegacyPackaging = true`. Native features need a new APK; `youtubeSupported`, `videoSupported`, and `sourceBrowserSupported` in snapshots keep a newer LAN interface from sending unsupported commands to an older APK.
- Disable yt-dlp format checks because they create temporary media files. Check the selected stream and at most five alternatives with a one-byte HTTP range read into memory, no HTTP cache or redirects, and bounded connect/read timeouts. Prefer separate audio before a combined stream.
- Save progress, settings, and 20 recent file descriptors in private SharedPreferences. The active file list lives with the service. Revalidate the most recent URI on the serial worker at service startup, then prepare it paused at its saved position. Explicit selections invalidate pending automatic restoration. Keep inaccessible recent entries visible and ask for reselection; do not start sound on launch alone.
- Publish play/pause and time jumps through Media3. Map received previous/next commands to the configured time jumps. Button visibility and headset behavior still require device checks. Do not intercept volume buttons.
- Let Media3 own foreground notifications and service lifetime. Enable audio-focus handling, pause on disconnected audio outputs, and use a playback wake lock. Do not release the service when Capacitor pauses or destroys its UI.
- Use pinned Media3 versions. Do not edit generated Android copies as durable source, and do not run preparation or native builds unless requested.
- Declare Activity, AppCompat, Core, and WebKit directly in `player/build.gradle`: Capacitor keeps its AndroidX dependencies in `implementation`, so they are not on this module's compile classpath. Match root version overrides, with defaults from the pinned Capacitor version. Declare Media3 UI directly for the native video screen. Do not change Capacitor internals to export these dependencies.
- Enable server settings only when the installed app has `ApplicationInfo.FLAG_DEBUGGABLE`. Keep the native Server button outside the WebView so recovery still works with an unreachable server or broken interface. Use system-bar/cutout insets for the button.
- Accept only private/loopback IPv4 or localhost over HTTP on port 3001, with no credentials, path, query, or fragment. Store the chosen origin in private development preferences, outside library data. An empty saved origin explicitly selects bundled assets; it overrides any build-time server URL. Cancel and invalid input must keep the current source.
- Select the origin with a fresh `CapConfig` before bridge creation. Switch by recreating only the Activity; do not pause, stop, or release the playback service. Keep Capacitor bridge access limited to its selected origin. The `player/src/debug/AndroidManifest.xml` overlay allows HTTP only in debug variants; release builds do not get this overlay or the Server button.

## Work Guidance

## Verification

- Track Android build and device checks separately in `FEATURE_PLAN.md`; source inspection does not establish runtime support.
- `:shravanam-player:testDebugUnitTest` checks native development/browser URLs, video synchronization decisions, and YouTube audio/video stream validation before the CI debug APK build. Preparation fixtures check both private Activities and the TextureView layout. Device checks must cover AV sync, seeks, pause/speed, rotation/background, silent browsing and same-page YouTube handoff, source changes, saved position, stale/cancelled extraction, expired streams, UI reload, and native server recovery. Source/unit checks do not establish real playback continuity.

## Child DOX Index
