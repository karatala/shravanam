# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
- User-facing errors must say what failed, quote the invalid value when useful, show the accepted form with a concrete example, and tell the user how to fix it. Do not expose parser positions, diagnostic codes, or implementation terms unless the message is for a developer log.
- Focus on requested code changes. Do not build, install, package, sign, publish, deploy, or simulate release workflows unless the user explicitly requests that exact action. Treat the user's confirmation that these workflows work as sufficient. Run or fix tests only when explicitly requested or when directly required to verify a specific code change.
- write in ASD-STE100 Simplified Technical English
- speak in simplified english or another language user speaks to you, so even a foreigner without tech background can understand what you mean, without fancy metaphors but using simple practical examples when needed
- no newlines between params in methods and conditions if line <250 symbols
- Never use one-letter variable names. Use `idx` for index variables.
- Use `this` when accessing class members from class methods.
- never ever use Em dash `—` but use `-` instead
- in C++ never create nameless namespace { ... } in the middle of code, use coresponding helper files
- Before changing code or documentation, ask for approval only when the requested change is ambiguous or requires behavior that the user did not explicitly request. Briefly describe the unclear choices, assumptions, and proposed changes, then wait for approval. If the user has already described the required change clearly, proceed without asking again.
- do not build anything and run tests until asked, and do not notify that you not going to build or run tests but if needed just ask to allow build or run
- no need for backward compatibility, app is not yet released
- when writing md plans, mark incomplete items/stages/phases with `[ ]` so user can easily find them using global search
- when implementing tasks from md todo/fixme/plan document, mark completed sections or steps with ✅ emoji, and when the entire doc is completed, make its main header start with "# ✅ COMPLETED: "
- The user permits staging and committing completed requested changes without another confirmation. Keep unrelated changes out of commits. Never push changes.
- Before removing or reverting temporary, test, experimental or other uncommitted changes, save the affected changes in a named Git stash so they can be restored and tested again. Do not discard them with restore, checkout, reset or reverse patches. Keep unrelated user changes in place and report the stash name. For test edits inside the running editor, save a separate project copy before undoing them because Git stash does not contain editor data.
- never hard-wrap text at a fixed line width
- never delete in code todo/fixme comments until they were implemented/fixed
- if summarizing a completed work iteration, also say very briefly what will be the next step/stage to complete and if something is required from user (like review unclear decisions in doc) then say what is expected to be done by user now and add short commit message in simple english without grammar
- never delete files/folders but rather move them to ./.deleted/ folder in workspace root
- Keep generated output, temporary files, local environment values, and personal editor settings out of Git. Keep runtime assets, licenses, source contracts, and the dependency lockfile versioned.
- Reuse approved shared UI components and their standard size, spacing, icon scale and states. Do not create a separate feature design when an approved control exists. If a required function is missing, propose a small extension to the standard component or a focused component built from it. Keep separate controls focused; do not grow one universal component with many flags and slots.
- Do not add visible CSS borders or inset box shadows unless the user explicitly requests them. Border reset declarations such as `border: none` are allowed. Prefer spacing, background color, text or icon color, and ordinary outer shadows for separation and state.
- Never let buttons, toolbar items, or popover triggers capture configured editor shortcuts such as Space or arrow keys after pointer use. Handle editor shortcuts during the window capture phase outside text inputs, selects, sliders, application menus, and open dialogs, and release pointer focus from controls after their action.
- `bunfig.toml` limits test discovery to `tests/`. Give archived test files in `.deleted/` a `.bak` suffix so editor test discovery does not treat them as active tests.

Read `DOX.md` before editing. This file is the repository-wide contract.

## Application Base

- Shravanam is a lightweight audiobook listener. Use the sibling Rachana project in `../Komprohit` as the source for platform patterns, not its notation engine or music assets.
- Use Bun for builds and local serving. Do not add Vite. Keep Svelte 5, Bun with WebviewJS for desktop, and Capacitor for iOS and Android.
- Keep UI controls local for now. Do not depend on `karatala-ui` or create its replacement here. A future separate `karatala-ui` library will draw from several projects; its design is not decided.
- Use `org.karatala.shravanam` as the initial native application ID. Keep native profiles, ports, cache names, and future hosting separate from Rachana.
- The current source includes the application shell and local-file playback: browser media playback, desktop mpv through private IPC, and an Android Media3 service behind a local Capacitor plugin. `TODOS.md` preserves the user's feature text. `FEATURE_PLAN.md` separates implemented source from pending native checks and future features.
- Speak Russian with the user. Keep repository guidance in simple English.
- Desktop and Android are the first delivery targets. Use the desktop browser for interface development and debugging. Keep native playback and background checks separate from browser checks.
- `.vscode/tasks.json` and `.vscode/launch.json` are shared project configuration. Keep personal editor settings ignored.
- Follow Rachana's `node-terminal` development launch with `bun run dev`. Let the user open their browser; do not add browser-specific launch configurations without a request.
- Media intake must include external OS file drag-and-drop and OS Open with/default-file associations into Shravanam. Internal extension-to-player rules are not requested. Optional persistent website routing must have an explicit enable and disable/restore flow; respect system user choices and preserve unrelated or newer handler settings. `FEATURE_PLAN.md` owns the implementation details and checks.

## Startup and Offline Hosting

- `index.html` owns the first-paint startup screen outside the app root: a dark animated radial gradient, a fixed-size transparent application icon, and translated loading text. Use a soft pulsing gold (#fec965) drop shadow that follows the icon silhouette. Honor reduced motion and retain the black document theme.
- Show desktop movement and window controls before application initialization. Keep them available after startup failure. Remove the startup header and screen only after Svelte mounts successfully.
- On startup failure, show an error textarea with copy and reload icon actions. Do not add introductory or developer-contact text.
- `scripts/build-web.js` owns production offline-cache generation from the current Bun output. Include worker code and published contents in cache revisions. Keep generated output ignored.
- Browser offline use requires a complete online cache preparation on HTTPS or same-device loopback. Development output does not install a worker. `LOCAL_OFFLINE.md` owns preparation and manual checks.
- Cache only the shell. Book storage must have its own owner. Native hosts use bundled files and skip service-worker registration.
- Keep manifest and worker URLs relative for root and subpath hosting. No publication destination is configured.

## Child DOX Index

- `.vscode/AGENTS.md`: shared Bun tasks and the Rachana-style development-terminal launch.
- `src/AGENTS.md`: shared Svelte interface, browser player, playback contract, and browser offline state.
- `desktop/AGENTS.md`: Bun host, native window, mpv playback, file intake, and persistent profile.
- `native/AGENTS.md`: desktop OS integration and the Android native playback source hierarchy.
- `scripts/AGENTS.md`: Bun builds, local server, desktop packaging, and mobile preparation.
- `public/AGENTS.md`: PWA manifest, worker template, and runtime assets.
