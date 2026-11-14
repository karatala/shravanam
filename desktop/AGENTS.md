# Desktop Host

## Purpose

- Runs the shared web application through Bun and the system WebView.

## Ownership

- `main.js` owns the fixed local server, OS data directory, and native window.

## Local Contracts

- Use loopback port 47870 and the Shravanam data directory, separate from Rachana. Fail when the port is occupied; do not select a new origin.
- Serve only the current asset map. Block external navigation and new windows. Expose only minimize, maximize, and close methods, each returning JSON null.
- Keep native decorations disabled. The HTML startup header provides movement and close controls before Svelte loads and after startup failure.
- The current WebView directory is persistent. Do not clear it or assume it holds only reproducible cache.
- Native source configuration does not establish tested platform support.

## Work Guidance

## Verification

- Run desktop builds and native checks only when requested.

## Child DOX Index
