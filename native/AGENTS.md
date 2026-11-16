# Native Integration

## Purpose

- Own durable native source used by desktop packaging and mobile preparation.

## Ownership

- `macos/Launcher.swift` receives macOS open-document events and starts or contacts the Bun host.
- `linux/register-file-types.py` installs the current user's Open With entry from packaged metadata.
- `scripts/desktop-associations.js` owns Windows registration output and shared packaging metadata.
- `android/` owns the Media3 service, local Capacitor plugin, and Android app overlay. Its child contract owns Android lifecycle and permission rules.
- `windows/` owns the bundled Windows media-session and global-shortcut helper. Playback stays in Bun/mpv; the helper owns only OS controls and its hidden message window.

## Local Contracts

- Pass file paths as argument arrays, never shell commands. Keep cold-launch file requests until the host starts.
- Register Shravanam as an available viewer. Do not change existing default applications.
- Desktop registration is an explicit user action. Keep the application at the registered location. Android declares supported incoming media intents in its manifest and leaves default selection to the user.
- Native sources do not establish verified behavior on a platform. Keep device checks in `FEATURE_PLAN.md`.

## Work Guidance

## Verification

## Child DOX Index

- `windows/AGENTS.md`: SMTC state/actions, global shortcut registration, helper lifetime, and bundling contract.
- `android/AGENTS.md`: Android playback owner, media session, content-URI intake, and generated-project integration.
