# Application Shell

## Purpose

- Owns the shared Svelte application for browser, desktop, Android, and iOS.

## Ownership

- `main.ts` mounts the application and removes the startup screen only after mount completes.
- `App.svelte` owns the initial library placeholder, connection status, and production browser cache registration.
- `env.d.ts` defines the narrow desktop window-control bridge.
- `pointer-input.ts` owns local mouse hover detection and pointer focus release.

## Local Contracts

- Use local native buttons and SVG icons for the current shell. Keep their size, style, accessible labels, and actions consistent with the startup header in `index.html`. Do not add an external component-library dependency yet.
- Release pointer focus after window-control actions.
- Use Russian for a Russian browser locale and English otherwise. Keep user-visible failures actionable.
- Browser cache state describes the application shell, not book availability. Native hosts skip worker registration.
- `FEATURE_PLAN.md` records playback, downloads, and background audio requirements. Resolve its open behavior choices before implementing the affected feature.

## Work Guidance

## Verification

- `bun run check` checks Svelte and frontend types when requested.

## Child DOX Index
