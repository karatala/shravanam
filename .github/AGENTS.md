# GitHub Automation

## Purpose

- Own CI source for checking the web interface and building downloadable web, desktop, and Android artifacts.

## Ownership

- `workflows/build.yml` follows Rachana's native-runner build pattern with Shravanam commands and output paths.

## Local Contracts

- Run on pull requests, tag pushes, and manual dispatch. Use read-only repository permissions and the frozen Bun lockfile. Keep runtime versions pinned.
- Android is temporarily the only active CI target. Keep the web and desktop jobs defined with job-level `if: ${{ false }}` gates so they are skipped. Restore those jobs only when requested. Desktop definitions retain Windows x64, Linux x64, and macOS arm64/x64 native runners, ZIP for Windows, ditto ZIP for macOS, and tar.gz for Linux.
- Android uses Java 21 and explicit SDK packages: platform-tools, platforms;android-36, and build-tools;36.0.0. Run `bun run check`, then `prepare:android` before Gradle so interface checks and the native player overlay remain included while the web job is paused. Upload only the Android debug APK; do not use distribution signing keys.
- Upload successful job outputs with errors for missing artifacts. CI artifacts are not published releases or a hosted PWA. Desktop artifacts still require an installed mpv.
- Do not copy Rachana's release repository, Pages address, secrets, updater, or publication jobs. Configure Shravanam publication separately when requested. iOS CI is deferred with its delivery stage.
- Workflow source does not establish a successful remote run. Keep the first-run check pending until GitHub reports results. Do not push or dispatch workflows without authorization.

## Work Guidance

## Verification

- The active Android job runs `bun run check` before preparation, then `:shravanam-player:testDebugUnitTest` and `assembleDebug`. The debug artifact includes native server settings and its debug-only HTTP manifest overlay. Web and desktop jobs are skipped until their gates are removed. After an updated workflow reaches GitHub, use a run at that updated commit to verify it; rerunning an older run uses its older workflow definition.

## Child DOX Index
