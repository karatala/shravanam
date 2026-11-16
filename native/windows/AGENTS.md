# Windows System Controls

## Purpose

- Owns the native helper for Windows system media controls and explicit global shortcuts.

## Ownership

- `system-controls.ps1` compiles its bundled C# helper through Windows PowerShell and .NET Framework. A hidden top-level WinForms window owns `RegisterHotKey` registrations. An unplayed Windows MediaPlayer supplies manual SMTC; it has no media source and does not decode or play audio.
- `desktop/system-controls.js` owns the helper process, its line-based JSON protocol, playback state publication, and validated command routing to the Bun media owner.

## Local Contracts

- Keep all playback in mpv. Disable MediaPlayer's command manager and send SMTC actions to Bun. Play/Pause/Stop are idempotent pause commands; Previous/Next use the configured time jumps.
- Keep the helper alive independently of the app WebView. Unregister shortcuts and disable the media session on quit or stdin closure. Stop only the helper process owned by this host.
- Accept only state, shortcut configuration, and quit through stdin. Return JSON state/action messages on stdout; never accept paths, stream URLs, or executable code from the page.
- Register explicit modifier combinations through `RegisterHotKey`, with no keyboard hook. Report conflicts instead of taking another application's shortcut. Media/headset controls use SMTC, not globally registered media keys.
- Bundle this source as text. Do not require an installed Windows SDK, separate .NET SDK, downloaded assemblies, or repository-relative files at runtime.

## Verification

- `tests/system-controls.test.js` checks media-action mapping and shortcut validation. Native SMTC session discovery, command routing, registration, and shutdown are separate Windows checks. Real headset-button routing remains a device check.
