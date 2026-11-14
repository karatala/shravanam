# Application Tooling

## Purpose

- Owns Bun web builds, local serving, desktop packaging source, and Capacitor preparation source.

## Ownership

- `build-web.js` compiles Svelte through Bun and generates the production offline revision from the current output.
- `serve.js` serves development output on port 3000 and production preview on port 4173, both on loopback.
- `build-desktop.js` embeds the current asset list and the platform WebviewJS addon.
- `prepare-mobile.js` creates and syncs the requested Capacitor target.

## Local Contracts

- Use Bun without Vite. Keep development output in `tmp/web`, production output in `dist`, and native output in `release`.
- Development builds include linked Bun source maps and the Svelte compiler's input source maps for browser debugging. Production builds do not generate source maps.
- The current asset list excludes stale output, documentation, source maps, and the worker itself. Never cache audio through the shell worker.
- Keep signing, publication, and background audio outside these base scripts.
- Generated iOS and Android projects remain ignored. Future durable native changes belong in versioned source overlays.
- Run install, build, packaging, and native preparation commands only when requested.

## Work Guidance

## Verification

## Child DOX Index
