# Sources, downloads, and site scripts

The first implementation targets desktop. `bun run dev` provides browser controls and can open a native source window. `bun run desktop` provides the same source actions in the native app. Android and standalone PWA source/download adapters are not implemented.

## Find and play

Use **Find on YouTube** to open the separate source window. Enter a search or an HTTPS address. Back, Forward, and Reload control this window. Open a recorded YouTube video, then choose Listen or Watch to send its URL to the Bun-owned player. The selected mode and URL change together; URL timestamps are retained. Website sessions are stored separately from the app interface.

The source view blocks new windows. Its own pages do not receive the app's file, playback, or window bridge. Website playback, login compatibility, and site changes still need native checks. Authenticated/private videos and live streams are not supported by the current extractor flow.

## Download and use offline

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
