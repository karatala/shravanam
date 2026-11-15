# VS Code Development

## Purpose

- Owns shared tasks and browser/native development-terminal launch configurations.

## Ownership

- `tasks.json` calls existing Bun package scripts.
- `launch.json` follows Rachana's `node-terminal` pattern and runs the selected Bun script from the workspace root.
- `Debug Desktop` / `Dev Desktop` run `bun run dev:desktop`: build development assets with source maps, open the system WebView with DevTools, and create the native tray. Use port 47870 and the normal `Shravanam` profile. Close an existing desktop instance first; otherwise single-instance delivery uses that existing host. Restart after source changes.
- `Debug app` / `Dev` use Bun-owned mpv playback. `Debug Web (PWA)` / `Dev Web (PWA)` run `bun run dev:web` for the standalone browser adapter. Both use port 3000; run only one at a time.

## Local Contracts

- Open `http://127.0.0.1:3000` manually in the user's browser. Do not add browser-specific launch configurations or attach a browser debugger without a request.
- Keep development source maps for browser developer tools. Terminal launch does not attach VS Code to frontend code.
- The browser launches do not create a tray. Use `Debug Desktop` to check native tray and background controls. Use the WebView's DevTools for native frontend breakpoints.
- Use either F5 or the matching development task, not both. Stop the terminal process with Ctrl+C; a development task can also be stopped through Tasks: Terminate Task.
- Do not pass Vite's `--host` argument to the Bun server; it does not parse this option.
- Keep personal `settings.json`, browser profiles, and other editor state ignored. Version only these shared tasks, launch configurations, and this contract.
- Desktop and Android are the first native targets. Default browser debugging controls the shared native desktop player and requires mpv. Native window drops/associations, tray controls, and Android background behavior still need their own checks. Browser reload does not stop Bun playback; stopping the terminal does.

## Work Guidance

## Verification

- Check task names, script names, URLs, and JSON structure when changing these files.
- Verify terminal launch and browser developer tools when requested.

## Child DOX Index
