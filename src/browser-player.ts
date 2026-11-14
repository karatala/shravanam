import { initialPlaybackState, mediaKind, validPlaybackCommand, type PlaybackState, type PlaybackCommand } from "./playback";
import { browserLibrary, type Binding } from "./data/browser-store";
import { DataError } from "./data/model";

export async function createBrowserPlayer(element: HTMLVideoElement, publish: (state: PlaybackState) => void) {
  const library = await browserLibrary();
  const state = initialPlaybackState();
  const { settings, generation } = await library.playbackDefaults();
  Object.assign(state, settings);
  const sources = new Map<string, string>();
  const bindings = new Map<string, Binding>();
  let lastSave = 0;
  let loadVersion = 0;
  let resumeTime: number | null = null;
  let disposed = false;
  const emit = () => { if (!disposed) publish({ ...state, items: [...state.items] }); };
  const storageError = (error: unknown) => {
    console.error("Library write failed", error);
    const changed = error instanceof DataError && error.code === "changed";
    if (changed) element.pause();
    state.error = { code: changed ? "library-changed" : "storage" };
    emit();
  };

  function persistPosition(): Promise<void> {
    if (disposed || !state.currentId || resumeTime !== null || state.loading || element.error || !element.readyState) return Promise.resolve();
    const binding = bindings.get(state.currentId);
    if (!binding) return Promise.resolve();
    lastSave = Date.now();
    return library.saveProgress(binding, element.currentTime, Number.isFinite(element.duration) ? element.duration : 0, element.ended);
  }
  function savePosition() { void persistPosition().catch(storageError); }
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
  async function select(id: string) {
    const url = sources.get(id);
    const binding = bindings.get(id);
    if (!url || !binding || disposed) return;
    state.error = null;
    const version = ++loadVersion;
    await persistPosition();
    if (version !== loadVersion || disposed) return;
    state.loading = true;
    element.pause();
    state.currentId = id;
    state.time = 0;
    state.duration = 0;
    state.paused = true;
    resumeTime = 0;
    resumeTime = await library.position(binding);
    if (version !== loadVersion || disposed) return;
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
    async addFiles(files: File[]) {
      let firstId: string | undefined;
      let invalidName: string | undefined;
      for (const file of files) {
        const kind = mediaKind(file.name);
        if (!kind) { invalidName ??= file.name; continue; }
        const binding = await library.openMedia({ name: file.name, size: file.size, lastModified: file.lastModified }, kind, generation);
        if (disposed) return;
        if (binding.generation !== generation) throw new DataError("changed");
        const id = binding.mediaId;
        bindings.set(id, binding);
        if (!sources.has(id)) {
          sources.set(id, URL.createObjectURL(file));
          state.items.push({ id, name: file.name, kind });
        }
        firstId ??= id;
      }
      if (firstId) await select(firstId);
      if (invalidName) state.error = { code: "format", name: invalidName };
      emit();
    },
    async command(command: PlaybackCommand) {
      if (!validPlaybackCommand(command)) return;
      if (command.type === "select") await select(command.id);
      if (command.type === "toggle" && state.currentId) {
        state.error = null;
        if (element.paused) await play(); else element.pause();
      }
      if (command.type === "seek" && state.currentId && !state.loading) element.currentTime = Math.min(command.time, state.duration);
      if (command.type === "speed") { state.speed = command.value; element.defaultPlaybackRate = command.value; element.playbackRate = command.value; }
      if (command.type === "intervals") { state.backward = command.backward; state.forward = command.forward; }
      if (command.type === "speed" || command.type === "intervals") {
        await library.saveSettings({ speed: state.speed, backward: state.backward, forward: state.forward }, generation);
      }
      emit();
    },
    flush: persistPosition,
    dispose() {
      if (disposed) return Promise.resolve();
      const saved = persistPosition();
      disposed = true;
      loadVersion++;
      for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
      window.removeEventListener("pagehide", savePosition);
      document.removeEventListener("visibilitychange", visibilityChanged);
      element.pause();
      element.removeAttribute("src");
      element.load();
      for (const url of sources.values()) URL.revokeObjectURL(url);
      return saved;
    },
  };
}
