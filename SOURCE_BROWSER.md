# Sources, downloads, and site scripts

Desktop provides source browsing, manual downloads, and site scripts. `bun run dev` provides browser controls and can open a native source window; `bun run desktop` provides the same actions in the native app. Android provides a native source browser, recorded YouTube Listen/Watch handoff, and manual offline audio/video downloads. Android scripts and standalone PWA acquisition remain pending.

## Find and play

Use **Find on YouTube** to open the separate source window. Enter a search or an HTTPS address. Back, Forward, and Reload control this window. Open a recorded YouTube video, then choose Listen or Watch to send its URL to the Bun-owned player. The selected mode and URL change together; URL timestamps are retained. Website sessions are stored separately from the app interface.

The source view blocks new windows. Its own pages do not receive the app's file, playback, or window bridge. Website playback, login compatibility, and site changes still need native checks. Authenticated/private videos and live streams are not supported by the current extractor flow.

## Android source browser

Install an updated APK, then tap **Browser** beside **Open files**. Enter an HTTPS address or search words, open one recorded YouTube video, and tap **Listen** or **Watch**. Back, Forward, and Reload navigate the website. The selected URL and mode go to the native Media3 player together; the browser closes. Watch opens the native video screen, while audio remains in the service. Video prepares independently and joins the current audio position. Closing video or the browser leaves audio running.

The website runs in a plain, muted WebView without the app's Capacitor bridge, local file/content access, mixed content, or new windows. If muting is unavailable, the app asks you to update Android System WebView. A separate website profile is used when the installed WebView supports it. Backgrounding destroys the website view; returning reloads its last address, so its page state and navigation history reset. Website sessions and addresses stay outside library archives.

Tap **Download** on a recorded YouTube page to choose audio or video up to 480p/720p/1080p. The separate native download service continues after the browser closes. The main **Downloads** view shows part progress, Cancel, Retry, and ready offline Listen/Watch actions. Ready copies share the online video's position. Android packages its own extraction and FFmpeg runtime; there is no executable path setting. After interruption, retry is explicit and partial files remain available. Downloads live in app-private storage outside Android backup and portable library archives.

Only a recorded YouTube URL can be handed to playback or downloads. Website login does not authenticate the extractor. Private/authenticated videos, live streams, scripts, and OS Share/Open With for links remain pending on Android. Real same-page navigation, AV synchronization, download/mux cancellation, restart, and airplane-mode playback still need device checks.

## Download and use offline

The following controls and the userscript section describe desktop features. Android controls are described above.

Use Download in the source toolbar, or paste a YouTube video link under Sources and downloads in the main window. Select audio or video up to 480p, 720p, or 1080p. These are maximum resolutions, not a promise that every video provides each format. Desktop uses installed yt-dlp; video merging also needs installed ffmpeg. The app does not install either tool.

The first version runs one manual download at a time. Cancel stops it and retains partial files for retry. A download is ready only after the extractor finishes and the output media file is checked. **Play offline** opens that saved file and shares the online video's position. The last local file can restore paused after restart without fetching YouTube.

Closing the source window releases its WebViews and keeps playback/downloading active. An empty hidden native window remains for reopening; it is disposed when the host exits. Exiting the host cancels the download and saves its interrupted state. Files and the download index live in the current native profile; `Shravanam-dev` and `Shravanam` stay separate. Browser data export does not back them up yet.

## Import or edit a userscript

Open **Site scripts** in the main window. Import a UTF-8 `.js` or `.user.js` file, or write code in the editor. Review it and use **Save and enable**. Existing scripts can be edited or switched off. Saving or switching reloads the source page and applies the current preload to its next document.

The first version accepts up to 32 scripts, each at most 128 KiB. It supports `@name`, `@namespace`, `@match`, URL-glob `@exclude` and `@exclude-match`, and `@run-at document-start`, `document-end`, or `document-idle`. Missing run-at means document-end. A wildcard scheme still runs only on HTTPS pages. Scripts run in the top-level website page; the app interface is outside their scope. Matching name and namespace replace an existing script. The previous script store is retained in `source-scripts.json.previous`.

This is a userscript metadata subset, not a Violentmonkey extension. Use `@grant none`; GM APIs and external `@require`/`@resource` are not supported. There are no automatic script updates. Scripts can modify page DOM and page JavaScript, but they are not a network filtering engine and cannot guarantee blocking every redirect or server response. YouTube video-ad blocking is not part of this feature.

Example for your own site; change the match rule and selectors before saving:

```js
// ==UserScript==
// @name My page cleanup
// @namespace my-scripts
// @match https://example.com/*
// @run-at document-end
// @grant none
// ==/UserScript==

const style = document.createElement("style");
style.textContent = ".my-banner, .my-spam-popup { display: none !important; }";
document.head.append(style);
```

Use document-start when your own script must change page behavior early. Start timing and actual YouTube behavior need checks on each supported native WebView. Parser, matching, storage, isolation, and download lifecycle checks do not replace those checks.
