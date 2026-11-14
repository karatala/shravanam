# Shravanam

Lightweight audiobook application base, adapted from the sibling Rachana project in `../Komprohit`.

The current source contains a Svelte shell, Bun build and local server, a production PWA cache, a Bun desktop host with the system WebView, and Capacitor configuration for iOS and Android. It does not yet contain an audiobook player, book downloads, a catalog, or background audio support. Platform behavior still needs verification.

## Requirements

- Bun, with the same runtime used for Rachana.
- Native desktop prerequisites from `@webviewjs/webview` on the target system.
- Android Studio and its SDK for Android; macOS and Xcode for iOS.

Package versions and registry integrity values come from Rachana's lockfile. The lockfile contains only the selected dependency graph. There is no Vite or external component-library dependency. Current controls and pointer behavior are local. A separate `karatala-ui` library is deferred until shared needs from several projects are clear.

## Commands

Run these commands when you want to install, check, or build the base:

| Command | Purpose |
| --- | --- |
| `bun install --frozen-lockfile` | Install the locked dependencies |
| `bun run dev` | Build development files in `tmp/web` and serve on `http://127.0.0.1:3000`; reload the browser after edits |
| `bun run check` | Check Svelte and frontend TypeScript |
| `bun run build` | Write the production web app and offline worker to `dist` |
| `bun run preview` | Serve `dist` on `http://127.0.0.1:4173` for PWA checks |
| `bun run desktop` | Open the existing `dist` app in the system WebView |
| `bun run build:desktop` | Build web files and an unsigned native executable for the current system in `release` |
| `bun run prepare:android` | Build web files, create the Android project if needed, and sync Capacitor |
| `bun run prepare:ios` | Build web files, create the iOS project if needed, and sync Capacitor |
| `bun run open:android` / `bun run open:ios` | Open the generated native project in its IDE |

The desktop host uses `127.0.0.1:47870` and its own `Shravanam/webview` directory below the OS application-data directory. It accepts one running instance. It exposes only window controls. WebView storage must not be treated as disposable while it holds application data.

The mobile application ID is `org.karatala.shravanam`. Generated projects stay ignored. Mobile preparation does not sign, publish, or configure background playback. Capacitor's default mobile launch assets remain until the app design is chosen.

PWA URLs are relative, so the output can be hosted at a root or a subpath. No publication destination is configured. See [LOCAL_OFFLINE.md](LOCAL_OFFLINE.md).

## VS Code browser debugging

Desktop and Android are the first native targets. Develop and debug the shared interface in a desktop browser.

After installing dependencies, select `Debug app` in Run and Debug, then press F5. Like Rachana, this uses `node-terminal` to run `bun run dev` from the workspace root. Wait for the server address, then open `http://127.0.0.1:3000` in your browser. F5 does not open a browser or attach VS Code to frontend code. Use browser developer tools; development output retains TypeScript and Svelte source maps. Reload the page after the terminal reports an updated build.

Use either F5 or the `Dev` task to start the server, not both. Stop the server with Ctrl+C in its terminal. For a server started through `Dev`, you can also use `Tasks: Terminate Task`. Stop any other server on port 3000 before starting a new one. The Bun server does not accept Rachana's Vite `--host` argument.

Shared tasks: `Dev`, `Check`, `Build`, `Preview`, `Run Desktop`, `Build Desktop`, `Prepare Android`, and `Open Android`. `Preview` and `Run Desktop` first run `Build`. `Prepare Android` builds web output and syncs the native project; use `Open Android` afterward. Personal VS Code settings remain ignored.

Browser debugging covers the web interface. Native audio, tray controls, global shortcuts, and Android background behavior need their own native checks.

## Next work

The original feature text is in [TODOS.md](TODOS.md). [FEATURE_PLAN.md](FEATURE_PLAN.md) contains the structured backlog, sleep-timer sequence, proposed stages, and open decisions.

- [ ] Resolve the first-stage decisions in `FEATURE_PLAN.md` before implementing playback.
- [ ] Replace the temporary Rachana icons with Shravanam assets and configure native launch icons.
- [ ] Verify dependency installation, source checks, PWA offline use, and each requested native target.

## Source and license

This repository retains its existing GPL license in `LICENSE`. The startup layout, offline-cache approach, and native-host approach are adapted from Rachana. The three PNG assets in `public/icons` are temporary copies of Rachana's application icon. The local pointer helpers retain the behavior previously supplied by the shared UI package.
