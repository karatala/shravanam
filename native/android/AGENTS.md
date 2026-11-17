# Android Playback

## Purpose

- Own the versioned Android library and app overlay for native local audio playback behind Capacitor.

## Ownership

- `player/` is an Android library with Media3, the playback service, and the Capacitor plugin.
- `PlaybackService.java` owns playback, persistence, notification preferences, and system time-jump commands. `MediaFile.java` validates granted files and reads provider metadata. `ShravanamPlayerPlugin.java` owns the controller binding, picker, and incoming-intent queue.
- `MainActivity.java` registers the local plugin before Capacitor creates its bridge.
- `scripts/prepare-android.js` copies this source into the ignored Android project and generates accepted media types from `src/playback.ts`.

## Local Contracts

- The service owns one ExoPlayer and all playback state. The WebView only selects files, sends validated commands, and reads snapshots. Releasing the interface controller must not release active playback.
- The plugin and service run in the same application process. Keep service access on the main thread; query file providers on the service's serial worker.
- Accept granted content URIs from the system document picker, Open With, and media sharing. Do not expose arbitrary URI or path opening to JavaScript. Attempt persistent read access only when the sender grants it; report temporary access in item metadata.
- No broad storage permission, media copying, URL extraction, or automatic downloads. Android plays audio tracks only in this stage; disable video and text tracks.
- Save progress, settings, and 20 recent file descriptors in private SharedPreferences. The active file list lives with the service. Revalidate the most recent URI on the serial worker at service startup, then prepare it paused at its saved position. Explicit selections invalidate pending automatic restoration. Keep inaccessible recent entries visible and ask for reselection; do not start sound on launch alone.
- Publish play/pause and time jumps through Media3. Map received previous/next commands to the configured time jumps. Button visibility and headset behavior still require device checks. Do not intercept volume buttons.
- Let Media3 own foreground notifications and service lifetime. Enable audio-focus handling, pause on disconnected audio outputs, and use a playback wake lock. Do not release the service when Capacitor pauses or destroys its UI.
- Use pinned Media3 versions. Do not edit generated Android copies as durable source, and do not run preparation or native builds unless requested.
- Declare Activity, AppCompat, and Core directly in `player/build.gradle`: Capacitor keeps its AndroidX dependencies in `implementation`, so they are not on this module's compile classpath. Match root version overrides, with defaults from the pinned Capacitor version. Do not change Capacitor internals to export these dependencies.

## Work Guidance

## Verification

- Track Android build and device checks separately in `FEATURE_PLAN.md`; source inspection does not establish runtime support.

## Child DOX Index
