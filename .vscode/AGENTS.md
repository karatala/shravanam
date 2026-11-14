# VS Code Development

## Purpose

- Owns shared tasks and the development-terminal launch configuration.

## Ownership

- `tasks.json` calls existing Bun package scripts.
- `launch.json` follows Rachana's `node-terminal` pattern and runs `bun run dev` from the workspace root.

## Local Contracts

- Open `http://127.0.0.1:3000` manually in the user's browser. Do not add browser-specific launch configurations or attach a browser debugger without a request.
- Keep development source maps for browser developer tools. Terminal launch does not attach VS Code to frontend code.
- Use either F5 or the Dev task to start the server, not both. Stop the terminal process with Ctrl+C; a Dev task can also be stopped through Tasks: Terminate Task.
- Do not pass Vite's `--host` argument to the Bun server; it does not parse this option.
- Keep personal `settings.json`, browser profiles, and other editor state ignored. Version only these shared tasks, launch configurations, and this contract.
- Desktop and Android are the first native targets. Browser debugging does not verify native playback or background behavior.

## Work Guidance

## Verification

- Check task names, script names, URLs, and JSON structure when changing these files.
- Verify terminal launch and browser developer tools when requested.

## Child DOX Index
