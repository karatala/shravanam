import { initialPlaybackState, mediaKind, validPlaybackCommand, type PlaybackState, type PlaybackCommand } from "./playback";

export function createBrowserPlayer(element: HTMLVideoElement, publish: (state: PlaybackState) => void) {
  const state = initialPlaybackState();
  const sources = new Map<string, string>();
  let lastSave = 0;
  let loadVersion = 0;
  let resumeTime: number | null = null;
  let disposed = false;
  const emit = () => { if (!disposed) publish({ ...state, items: [...state.items] }); };
  const storageError = () => { state.error = { code: "storage" }; emit(); };
  try {
    const saved = JSON.parse(localStorage.getItem("shravanam.playback.settings") ?? "null");
    if (saved && validPlaybackCommand({ type: "speed", value: saved.speed })) state.speed = saved.speed;
    if (saved && validPlaybackCommand({ type: "intervals", backward: saved.backward, forward: saved.forward })) { state.backward = saved.backward; state.forward = saved.forward; }
  } catch { state.error = { code: "storage" }; }

  function savePosition() {
    if (!state.currentId || resumeTime !== null || state.loading || element.error || !element.readyState) return;
    try { localStorage.setItem(`shravanam.position.${state.currentId}`, String(element.ended ? 0 : element.currentTime)); }
    catch { storageError(); }
    lastSave = Date.now();
  }
  function synchronize() {
    state.time = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    state.duration = Number.isFinite(element.duration) ? element.duration : 0;
    state.paused = element.paused;
    if (Date.now() - lastSave >= 5000 && !element.paused) savePosition();
    emit();
  }
  async function play() {
    const version = loadVersion;
    try { await element.play(); }
    catch (error) {
      if (version !== loadVersion || disposed) return;
      console.error("Browser playback failed", error);
      state.loading = false;
      state.error = { code: "play", name: state.items.find(item => item.id === state.currentId)?.name };
      emit();
    }
  }
  function loaded() {
    state.loading = false;
    element.playbackRate = state.speed;
    if (resumeTime !== null && Number.isFinite(element.duration)) element.currentTime = resumeTime < element.duration ? resumeTime : 0;
    resumeTime = null;
    synchronize();
    void play();
  }
  function failed() {
    resumeTime = null;
    state.loading = false;
    state.paused = true;
    state.error = { code: "play", name: state.items.find(item => item.id === state.currentId)?.name };
    emit();
  }
  function paused() { synchronize(); savePosition(); }
  function select(id: string) {
    const url = sources.get(id);
    if (!url) return;
    state.error = null;
    savePosition();
    loadVersion++;
    element.pause();
    state.currentId = id;
    state.time = 0;
    state.duration = 0;
    state.loading = true;
    state.paused = true;
    resumeTime = 0;
    try {
      const saved = Number(localStorage.getItem(`shravanam.position.${id}`));
      if (Number.isFinite(saved) && saved >= 0) resumeTime = saved;
    } catch { state.error = { code: "storage" }; }
    element.src = url;
    element.load();
    emit();
  }
  const events = { timeupdate: synchronize, durationchange: synchronize, play: synchronize, pause: paused, ended: paused, ratechange: synchronize, seeked: paused, loadedmetadata: loaded, error: failed };
  for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
  window.addEventListener("pagehide", savePosition);
  const visibilityChanged = () => { if (document.hidden) savePosition(); };
  document.addEventListener("visibilitychange", visibilityChanged);
  emit();

  return {
    addFiles(files: File[]) {
      let firstId: string | undefined;
      let invalidName: string | undefined;
      for (const file of files) {
        const kind = mediaKind(file.name);
        if (!kind) { invalidName ??= file.name; continue; }
        const id = JSON.stringify([file.name, file.size, file.lastModified]);
        if (!sources.has(id)) {
          sources.set(id, URL.createObjectURL(file));
          state.items.push({ id, name: file.name, kind });
        }
        firstId ??= id;
      }
      if (firstId) select(firstId);
      if (invalidName) state.error = { code: "format", name: invalidName };
      emit();
    },
    async command(command: PlaybackCommand) {
      if (!validPlaybackCommand(command)) return;
      if (command.type === "select") select(command.id);
      if (command.type === "toggle" && state.currentId) {
        state.error = null;
        if (element.paused) await play(); else element.pause();
      }
      if (command.type === "seek" && state.currentId && !state.loading) element.currentTime = Math.min(command.time, state.duration);
      if (command.type === "speed") { state.speed = command.value; element.defaultPlaybackRate = command.value; element.playbackRate = command.value; }
      if (command.type === "intervals") { state.backward = command.backward; state.forward = command.forward; }
      if (command.type === "speed" || command.type === "intervals") {
        try { localStorage.setItem("shravanam.playback.settings", JSON.stringify({ speed: state.speed, backward: state.backward, forward: state.forward })); }
        catch { storageError(); }
      }
      emit();
    },
    dispose() {
      savePosition();
      disposed = true;
      loadVersion++;
      for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
      window.removeEventListener("pagehide", savePosition);
      document.removeEventListener("visibilitychange", visibilityChanged);
      element.pause();
      element.removeAttribute("src");
      element.load();
      for (const url of sources.values()) URL.revokeObjectURL(url);
    },
  };
}
