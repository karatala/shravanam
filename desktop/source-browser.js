import { join } from "node:path";
import { sourceAddress, sourceFailure, validSourceCommand } from "../src/sources.ts";
import { youtubeSource } from "./youtube.js";
import { createSourceScripts } from "./source-scripts.js";
import { createDownloads } from "./downloads.js";

export async function createSourceBrowser({ profile, origin, media, getApplication }) {
  const scripts = await createSourceScripts(profile);
  const downloads = await createDownloads(profile, media);
  let browser = null;
  let sourceWindow = null;
  let opening = null;
  let closing = false;
  let scriptQueue = Promise.resolve();
  let lastUrl = "https://www.youtube.com/";
  function currentUrl() {
    if (browser) {
      const value = browser.page?.url();
      if (value?.startsWith("https://") && value.length <= 2048) lastUrl = value;
    }
    return lastUrl;
  }
  function disposeBrowser() {
    if (!browser) return;
    const previous = browser;
    currentUrl();
    browser = null;
    previous.window.hide();
    previous.page?.dispose();
    previous.toolbar.dispose();
    previous.context.dispose();
  }
  function createPage() {
    const selected = browser;
    selected.page = selected.window.createWebview({ url: lastUrl, child: true, x: 0, y: 160, width: selected.window.getInnerSize(true).width, height: Math.max(1, selected.window.getInnerSize(true).height - 160), webContext: selected.context, preload: scripts.preload(), enableDragRegionHelpers: false, navigationHandler: url => { try { const target = new URL(url); return target.protocol === "https:" && !target.username && !target.password; } catch { return false; } }, newWindowHandler: () => false });
    selected.page.on("title-changed", ({ title }) => { if (browser === selected) selected.title = title.slice(0, 300); });
  }
  async function openBrowser() {
    if (closing) throw new Error("The app is closing. Reopen Shravanam to browse. / Приложение закрывается. Откройте Shravanam снова.");
    if (browser) { browser.window.setMinimized(false); browser.window.focus(); return; }
    if (opening) return opening;
    opening = (async () => {
      const app = await getApplication();
      if (closing) return;
      if (!sourceWindow) {
        sourceWindow = app.createBrowserWindow({ title: "Shravanam · YouTube", width: 1000, height: 800, decorations: false, resizable: true });
        sourceWindow.setMinSize(760, 480, true);
        const window = sourceWindow;
        window.on("resize", () => {
          if (browser?.window !== window) return;
          const size = window.getInnerSize(true);
          browser.toolbar.setBounds({ x: 0, y: 0, width: size.width, height: 160 });
          browser.page.setBounds({ x: 0, y: 160, width: size.width, height: Math.max(1, size.height - 160) });
        });
        window.on("close", event => { event.preventDefault(); setImmediate(disposeBrowser); });
      }
      const window = sourceWindow;
      const context = app.createWebContext({ dataDirectory: join(profile, "source-browser") });
      const toolbar = window.createWebview({ url: `${origin}/?tool=sources`, child: true, x: 0, y: 0, width: window.getInnerSize(true).width, height: 160, navigationHandler: url => { try { return new URL(url).origin === origin; } catch { return false; } }, newWindowHandler: () => false });
      browser = { window, context, toolbar, page: null, title: "YouTube" };
      try {
        toolbar.expose("shravanamSources", bridge);
        toolbar.expose("shravanamDesktop", { minimizeWindow() { window.setMinimized(true); return null; }, toggleMaximized() { window.setMaximized(!window.isMaximized()); return null; }, requestWindowClose() { disposeBrowser(); return null; } });
        createPage();
        window.setMinimized(false);
        window.show();
        window.focus();
      } catch (error) { disposeBrowser(); throw error; }
    })();
    try { await opening; } finally { opening = null; }
  }
  function refreshScripts() {
    if (!browser) return;
    currentUrl();
    browser.page.dispose();
    browser.page = null;
    createPage();
  }
  const bridge = {
    async getState() { return { browser: { open: Boolean(browser), url: currentUrl(), title: browser?.title ?? "" }, scripts: scripts.snapshot(), downloads: downloads.snapshot() }; },
    async command(command) {
      if (closing || !validSourceCommand(command)) throw new Error("Cannot use this source action. Reload Shravanam and retry. / Не удалось выполнить действие с источником. Обновите Shravanam и повторите попытку.");
      if (command.type === "open-browser") await openBrowser();
      if (command.type === "close-browser") disposeBrowser();
      if (command.type === "navigate") { lastUrl = sourceAddress(command.address); if (browser) browser.page.loadUrl(lastUrl); else await openBrowser(); }
      if (command.type === "back") browser?.page.evaluateScript("history.back()");
      if (command.type === "forward") browser?.page.evaluateScript("history.forward()");
      if (command.type === "reload") browser?.page.reload();
      if (command.type === "play") {
        const url = currentUrl();
        try { youtubeSource(url); }
        catch { throw new Error("Open one YouTube video before selecting Listen or Watch. / Откройте отдельный ролик YouTube перед выбором «Слушать» или «Смотреть»."); }
        browser?.page.evaluateScript("document.querySelectorAll('video,audio').forEach(media => media.pause())");
        const result = await media.command({ type: "open-youtube", url, audioOnly: command.audioOnly });
        if (result.error) throw new Error(sourceFailure(result.error));
      }
      if (command.type === "download") downloads.download(command.url || currentUrl(), command.audioOnly, command.quality);
      if (command.type === "open-download") await downloads.open(command.id);
      if (command.type === "cancel-download") downloads.cancel(command.id);
      if (command.type === "retry-download") downloads.retry(command.id);
      if (command.type === "import-script" || command.type === "toggle-script") {
        const next = scriptQueue.then(async () => {
          if (command.type === "import-script") await scripts.import([{ source: command.source, name: command.name }], command.id);
          else await scripts.toggle(command.id, command.enabled);
          refreshScripts();
        });
        scriptQueue = next.catch(() => {});
        await next;
      }
      const state = await bridge.getState();
      if (command.type === "read-script") state.script = scripts.read(command.id);
      return state;
    },
  };
  return {
    bridge,
    async close() { closing = true; try { await opening; await scriptQueue; disposeBrowser(); sourceWindow?.dispose(); sourceWindow = null; } finally { await downloads.close(); } },
    terminate() { downloads.terminate(); },
  };
}
