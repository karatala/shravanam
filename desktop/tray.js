export function createDesktopTray({ app, icon, getPlaybackState, command, openWindow, quit, onUnavailable }) {
  let tray = null;
  let disposed = false;
  let updating = false;
  let lastKey = "";
  let language = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("ru") ? "ru" : "en";
  const text = (english, russian) => language === "ru" ? russian : english;
  function unavailable(error) {
    if (disposed) return;
    console.warn("Desktop tray is unavailable", error);
    const previous = tray;
    tray = null;
    try { if (previous && !previous.isDisposed()) previous.dispose(); } catch {}
    try { onUnavailable(); } catch (failure) { console.error("Could not restore the player window", failure); }
  }
  async function update() {
    if (!tray || disposed || updating) return;
    updating = true;
    try {
      const state = await getPlaybackState();
      if (!tray || disposed) return;
      if (tray.isDisposed()) throw new Error("The desktop tray was closed");
      const name = state.items.find(item => item.id === state.currentId)?.name ?? "Shravanam";
      const key = JSON.stringify([language, state.currentId, name, state.paused, state.loading, state.backward, state.forward]);
      if (key === lastKey) return;
      const enabled = Boolean(state.currentId) && !state.loading;
      tray.setTooltip(`Shravanam\n${name}`);
      tray.setMenu({ items: [
        { id: "shravanam-open", label: text("Open Shravanam", "Открыть Shravanam") },
        { role: "separator" },
        { id: "shravanam-toggle", label: state.paused ? text("Play", "Воспроизвести") : text("Pause", "Пауза"), enabled },
        { id: "shravanam-back", label: text(`Back ${state.backward} sec`, `Назад ${state.backward} сек`), enabled },
        { id: "shravanam-forward", label: text(`Forward ${state.forward} sec`, `Вперёд ${state.forward} сек`), enabled },
        { role: "separator" },
        { id: "shravanam-quit", label: text("Quit Shravanam", "Завершить Shravanam") },
      ] });
      lastKey = key;
    } catch (error) { unavailable(error); }
    finally { updating = false; }
  }
  async function menuClicked(event) {
    if (disposed) return;
    const id = event.customMenuEvent?.id;
    if (!id?.startsWith("shravanam-")) return;
    // Native menu callbacks run inside pumpEvents; release its Application borrow first.
    await new Promise(resolve => setImmediate(resolve));
    if (disposed) return;
    try {
      if (id === "shravanam-open") await openWindow();
      else if (id === "shravanam-quit") await quit();
      else {
        const state = await getPlaybackState();
        if (!state.currentId || state.loading) return;
        let result;
        if (id === "shravanam-toggle") result = await command({ type: "toggle" });
        else if (id === "shravanam-back") result = await command({ type: "seek", time: Math.max(0, state.time - state.backward) });
        else if (id === "shravanam-forward") result = await command({ type: "seek", time: Math.min(state.duration || Number.MAX_SAFE_INTEGER, state.time + state.forward) });
        if (result?.error) openWindow();
        await update();
      }
    } catch (error) {
      console.error("Desktop tray action failed", error);
      if (id !== "shravanam-open") {
        try { await openWindow(); }
        catch (failure) { console.error("Could not restore the player window", failure); }
      }
    }
  }
  app.on("custom-menu-click", menuClicked);
  const ready = app.whenReady({ autoRun: false }).then(async () => {
    if (disposed) return false;
    try {
      tray = app.createTrayIcon({ id: "shravanam-main", icon: { data: icon }, tooltip: "Shravanam", menuOnLeftClick: true, menuOnRightClick: true });
      await update();
      return Boolean(tray);
    } catch (error) { unavailable(error); return false; }
  }).catch(error => { unavailable(error); return false; });
  const timer = setInterval(() => void update(), 1000);
  return {
    available() { return Boolean(!disposed && tray && !tray.isDisposed()); },
    async ready(selectedLanguage) {
      if (selectedLanguage === "en" || selectedLanguage === "ru") language = selectedLanguage;
      if (!await ready || disposed || !tray || tray.isDisposed()) return false;
      await update();
      return Boolean(tray);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      app.off("custom-menu-click", menuClicked);
      try { if (tray && !tray.isDisposed()) tray.dispose(); }
      catch (error) { console.warn("Could not close the desktop tray", error); }
      tray = null;
    },
  };
}
