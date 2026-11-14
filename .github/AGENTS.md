# GitHub Automation

## Purpose

- Own CI source for checking the web interface and building downloadable web, desktop, and Android artifacts.

## Ownership

- `workflows/build.yml` follows Rachana's native-runner build pattern with Shravanam commands and output paths.

## Local Contracts

- Run on pull requests, tag pushes, and manual dispatch. Use read-only repository permissions and the frozen Bun lockfile. Keep runtime versions pinned.
- Build Windows x64, Linux x64, and macOS arm64/x64 on their native runners. Use ZIP for Windows, ditto ZIP for macOS, and tar.gz for Linux to retain executable permissions.
- Android uses Java 21 and explicit SDK packages: platform-tools, platforms;android-36, and build-tools;36.0.0. Run `prepare:android` before Gradle so the native player overlay is included. Upload the debug APK; do not use distribution signing keys.
- Upload successful job outputs with errors for missing artifacts. CI artifacts are not published releases or a hosted PWA. Desktop artifacts still require an installed mpv.
- Do not copy Rachana's release repository, Pages address, secrets, updater, or publication jobs. Configure Shravanam publication separately when requested. iOS CI is deferred with its delivery stage.
- Workflow source does not establish a successful remote run. Keep the first-run check pending until GitHub reports results. Do not push or dispatch workflows without authorization.

## Work Guidance

## Verification

- The web job runs `bun run check` before building. Native jobs verify their respective build commands when CI is triggered.

## Child DOX Index
