import { access, realpath, stat, readFile, writeFile, rename } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname, isAbsolute, join } from "node:path";
import { initialPlaybackState, mediaKind, validPlaybackCommand } from "../src/playback.ts";
import { MpvPlayer } from "./mpv.js";
import { youtubeSource, resolveYouTube } from "./youtube.js";
import { createLibraryStore } from "./library-store.js";
import { createWebDav } from "./webdav.js";
import { primaryRecords, validLibraryCommand } from "../src/library.ts";
import { decodeArchive, mergeLibraries } from "../src/data/archive.ts";
import { createSleepController, sleepSignalFilter } from "./sleep.js";
import { createSpeechService } from "./speech.js";
import { validSleepCommand } from "../src/sleep.ts";
import { DataError } from "../src/data/model.ts";

export async function createMediaPlayer(profile, dependencies = {}) {
  const state = initialPlaybackState();
  const paths = new Map();
  const links = new Map();
  const resolverAbort = new AbortController();
  let resolving = false;
  const settingsPath = join(profile, "playback.json");
  const playerSettingsPath = join(profile, "player.json");
  let currentId = null;
  let serial = Promise.resolve();
  let closing = false;
  let positions = {};
  let sourceBindings = {};
  let recent = [];
  let openedExplicitly = false;
  let audioOnly = true;
  let mpvPath = "";
  let activePlaylist = null;
  let endedHandled = false;
  let importPreview = null;
  let rememberedProgress = null;
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!validPlaybackCommand({ type: "speed", value: settings.speed }) || !validPlaybackCommand({ type: "intervals", backward: settings.backward, forward: settings.forward })) throw new Error("Invalid playback settings");
    state.speed = settings.speed;
    state.backward = settings.backward;
    state.forward = settings.forward;
    if (typeof settings.audioOnly === "boolean") audioOnly = settings.audioOnly;
    if (settings.positions && typeof settings.positions === "object" && !Array.isArray(settings.positions)) positions = Object.fromEntries(Object.entries(settings.positions).filter(([id, time]) => /^[a-f0-9]{64}$/.test(id) && Number.isFinite(time) && time >= 0));
    if (settings.sourceBindings && typeof settings.sourceBindings === "object" && !Array.isArray(settings.sourceBindings)) sourceBindings = Object.fromEntries(Object.entries(settings.sourceBindings).filter(([id, sourceId]) => /^[a-f0-9]{64}$/.test(id) && typeof sourceId === "string" && /^[a-f0-9]{64}$/.test(sourceId)));
    if (Array.isArray(settings.recent)) recent = settings.recent.filter(entry => entry && /^[a-f0-9]{64}$/.test(entry.id) && typeof entry.path === "string" && isAbsolute(entry.path) && !entry.path.includes("\0") && typeof entry.name === "string" && mediaKind(entry.name) === entry.kind).slice(0, 20);
    for (const saved of Array.isArray(settings.links) ? settings.links.slice(0, 20) : []) {
      try {
        const source = youtubeSource(saved.url);
        links.set(source.id, { ...source, name: typeof saved.name === "string" ? saved.name.slice(0, 300) : source.videoId, kind: "video" });
      } catch { /* Ignore invalid saved links without removing local files. */ }
    }
  } catch (error) { if (error.code !== "ENOENT") { console.error(error); state.error = { code: "storage" }; } }
  try {
    const settings = JSON.parse(await readFile(playerSettingsPath, "utf8"));
    if (!validPlaybackCommand({ type: "mpv-path", value: settings.mpvPath })) throw new Error("Invalid player settings");
    mpvPath = settings.mpvPath;
  } catch (error) { if (error.code !== "ENOENT") { console.error(error); state.error = { code: "player-settings" }; } }
  const library = await createLibraryStore(profile);
  await library.migrateLegacy({ recent, links: [...links.values()], positions, sourceBindings, speed: state.speed, backward: state.backward, forward: state.forward });
  const portableSettings = primaryRecords(library.snapshot()).find(record => record.kind === "settings")?.value;
  if (portableSettings) { state.speed = portableSettings.speed; state.backward = portableSettings.backward; state.forward = portableSettings.forward; }
  const webdav = await createWebDav(profile, library, dependencies.fetch);
  const sleep = await createSleepController(profile);
  const speech = createSpeechService(dependencies.speech);
  let voices = [];
  let sleepError = "";
  const player = new (dependencies.Player ?? MpvPlayer)(profile, code => {
    rememberPosition();
    if (code) state.error = { code, name: state.items.find(item => item.id === currentId)?.name };
    if (code === "player-closed") void queue(saveSettings);
  });
  player.state.speed = state.speed;
  player.audioOnly = audioOnly;
  player.executablePath = mpvPath;
  const snapshot = () => ({ ...state, ...(currentId ? player.state : {}), loading: resolving || player.state.loading, currentId, libraryMediaId: library.binding(currentId)?.mediaId ?? null, sleep: { ...sleep.snapshot(), voices, error: sleepError || sleep.snapshot().error }, audioOnly: player.audioOnly, backend: player.backend, mpvPath, items: [...state.items], recent: recent.map(({ id, name, kind, title }) => ({ id, name: typeof title === "string" ? title : name, kind })), recentLinks: [...links.values()].reverse().map(({ id, name, kind }) => ({ id, name, kind })) });
  const sleepContext = () => ({ mediaId: library.binding(currentId)?.mediaId ?? null, time: player.state.time, available: Boolean(currentId && player.loaded && !player.state.loading && !resolving), playing: Boolean(currentId && player.loaded && !player.state.paused && !player.state.loading && !resolving), volume: player.state.volume ?? 100 });
  async function applySleepEffects(effects) {
    for (const effect of effects) {
      if (effect.type === "speech-stop") speech.stop();
      else if (effect.type === "speech") void speech.speak(effect).catch(error => { sleepError = error.message; });
      else if (effect.type === "signal-start" && player.loaded) {
        try { await player.request(["af", "add", sleepSignalFilter(effect.seconds, effect.gain, player.state.speed)]); }
        catch { sleepError = "Cannot play the sleep signal. Update mpv or IINA, or disable the timer. / Не удалось воспроизвести сигнал сна. Обновите mpv или IINA либо выключите таймер."; await applySleepEffects(await sleep.command({ type: "stop" }, sleepContext())); }
      } else if (effect.type === "signal-stop" && player.loaded) { try { await player.request(["af", "remove", "@shravanam-sleep"]); } catch { /* The labelled filter may already be absent. */ } }
      else if (effect.type === "volume" && player.loaded) { await player.request(["set_property", "volume", effect.value]); player.state.volume = effect.value; }
      else if ((effect.type === "pause" || effect.type === "resume") && player.loaded) { await player.request(["set_property", "pause", effect.type === "pause"]); player.state.paused = effect.type === "pause"; await saveSettings(); }
    }
  }
  function queue(action) {
    const next = serial.then(async () => { if (!closing) await action(); }).catch(error => {
      console.error("Desktop media action failed", error);
      state.error = { code: ["player-settings", "missing-player", "player-path", "iina-player", "open", "changed-file", "youtube-link", "missing-downloader", "youtube", "youtube-live"].includes(error.code) ? error.code : "player", name: error.mediaName ?? state.items.find(item => item.id === currentId)?.name };
    });
    serial = next;
    return next.then(snapshot);
  }
  async function inspectPath(candidate) {
    const path = await realpath(candidate);
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Not a file");
    const name = basename(path);
    const kind = mediaKind(name);
    if (!kind) throw new Error("Unsupported file");
    const id = createHash("sha256").update(path).update(`\0${metadata.size}\0${metadata.mtimeMs}`).digest("hex");
    return { id, path, name, kind, file: { name, size: metadata.size, lastModified: Math.trunc(metadata.mtimeMs) } };
  }
  function register(entry) {
    if (!paths.has(entry.id)) { paths.set(entry.id, entry.path); state.items.push({ id: entry.id, name: entry.title ?? entry.name, kind: entry.kind }); }
    else if (entry.title) { const item = state.items.find(item => item.id === entry.id); if (item) item.name = entry.title; }
  }
  function remember(entries) {
    const ordered = [];
    for (const entry of [...entries, ...recent]) {
      if (!ordered.some(saved => saved.path === entry.path)) ordered.push(entry);
      if (ordered.length === 20) break;
    }
    recent = ordered;
  }
  async function select(id, autoplay = true) {
    speech.stop();
    if (links.has(id)) return selectLink(links.get(id), autoplay);
    const path = paths.get(id);
    if (!path) return;
    let entry;
    try { entry = await inspectPath(path); }
    catch (error) { throw Object.assign(error, { code: "open", mediaName: basename(path) }); }
    if (entry.id !== id) throw Object.assign(new Error("File changed"), { code: "changed-file", mediaName: entry.name });
    const title = recent.find(item => item.id === id)?.title;
    if (typeof title === "string" && title.length <= 300) { entry.title = title; register(entry); }
    state.error = null;
    await saveSettings();
    const binding = await library.bindLocal({ key: id, name: entry.title ?? entry.name, kind: entry.kind, file: entry.file, path });
    currentId = id;
    endedHandled = false;
    await player.load(path, state.speed, library.position(binding), autoplay);
    await readChapters(binding.mediaId);
    remember([entry]);
    await saveSettings();
  }
  async function selectLink(source, autoplay = true, position, audioOnly = player.audioOnly) {
    speech.stop();
    resolving = true;
    state.error = null;
    try {
      const stream = await resolveYouTube(source, audioOnly, resolverAbort.signal);
      if (closing) return;
      await saveSettings();
      const binding = await bindLibrarySource(source, stream.title);
      const start = position ?? library.position(binding);
      if (player.loaded) { await player.request(["set_property", "pause", true]); player.state.paused = true; }
      await player.setAudioOnly(audioOnly);
      const entry = { id: source.id, videoId: source.videoId, url: source.url, name: stream.title, kind: "video" };
      links.delete(source.id);
      links.set(source.id, entry);
      if (links.size > 20) {
        const oldestId = links.keys().next().value;
        links.delete(oldestId);
        state.items = state.items.filter(item => item.id !== oldestId);
      }
      state.items = [...state.items.filter(item => item.id !== source.id), { id: source.id, name: stream.title, kind: "video" }];
      await saveSettings();
      currentId = source.id;
      endedHandled = false;
      await player.load(stream.url, state.speed, start, autoplay, stream);
      await readChapters(binding.mediaId, stream.chapters);
      if (stream.description && !primaryRecords(library.snapshot()).some(record => record.kind === "text" && record.value.targetId === binding.mediaId && record.value.role === "description")) await library.put("text", { targetId: binding.mediaId, role: "description", language: "", original: stream.description, edited: null, cues: [] });
      await saveSettings();
    } finally { resolving = false; }
  }
  async function openRecent(id, autoplay) {
    const entry = recent.find(item => item.id === id);
    if (!entry) return;
    register(entry);
    await select(id, autoplay);
  }
  function rememberPosition() {
    if (currentId && player.loaded && !player.state.loading) {
      const completed = player.state.duration > 0 && player.state.time >= player.state.duration;
      positions[sourceBindings[currentId] ?? currentId] = completed ? 0 : player.state.time;
      const binding = library.binding(currentId);
      if (binding) rememberedProgress = { binding, position: player.state.time, duration: player.state.duration, completed };
    }
  }
  async function readChapters(mediaId, supplied) {
    if (primaryRecords(library.snapshot()).some(record => record.kind === "chapter" && record.value.mediaId === mediaId)) return;
    let chapters = supplied;
    if (!chapters) { try { chapters = await player.request(["get_property", "chapter-list"]); } catch { return; } }
    if (!Array.isArray(chapters)) return;
    const valid = chapters.slice(0, 2000).filter(chapter => chapter && typeof chapter === "object").map(chapter => ({ start: chapter.start_time ?? chapter.time, end: chapter.end_time, title: typeof chapter.title === "string" ? chapter.title.slice(0, 4096) : "" })).filter(chapter => Number.isFinite(chapter.start) && chapter.start >= 0).sort((left, right) => left.start - right.start);
    for (let idx = 0; idx < valid.length; idx++) {
      const chapter = valid[idx];
      await library.put("chapter", { mediaId, start: chapter.start, end: Math.max(chapter.start, Number.isFinite(chapter.end) ? chapter.end : valid[idx + 1]?.start ?? player.state.duration ?? chapter.start), title: chapter.title || `Chapter ${idx + 1}` });
    }
  }
  async function bindLibrarySource(source, title) {
    const existing = library.binding(source.id);
    const binding = await library.bindSource({ key: source.id, title, url: source.url, kind: "video" });
    if (!existing && Number.isFinite(positions[source.id])) await library.saveProgress(binding, positions[source.id], 0, false);
    return binding;
  }
  async function pauseForDataChange() {
    await applySleepEffects(await sleep.command({ type: "stop" }, sleepContext()));
    if (player.loaded) { await player.request(["set_property", "pause", true]); player.state.paused = true; }
    activePlaylist = null;
    if (!await saveSettings()) throw new DataError("storage");
    currentId = null;
    rememberedProgress = null;
    state.paused = true;
    state.time = 0;
    state.duration = 0;
  }
  async function applyLibrarySettings() {
    const settings = primaryRecords(library.snapshot()).find(record => record.kind === "settings")?.value;
    if (settings) { state.speed = settings.speed; state.backward = settings.backward; state.forward = settings.forward; player.state.speed = settings.speed; }
  }
  async function playLibraryMedia(mediaId) {
    const record = primaryRecords(library.snapshot()).find(record => record.id === mediaId && record.kind === "media");
    if (!record) throw new Error("Cannot find this library item. Refresh the library. / Элемент библиотеки не найден. Обновите библиотеку.");
    const access = library.resolve(mediaId);
    if (access?.path) {
      const entry = await inspectPath(access.path);
      if (entry.id !== access.key) throw new Error("This file changed. Open it again with Open files. / Файл изменился. Выберите его снова через «Открыть файлы».");
      register(entry);
      return select(entry.id);
    }
    const source = primaryRecords(library.snapshot()).find(source => source.id === record.value.sourceId && source.kind === "source");
    if (source) return selectLink(youtubeSource(source.value.url));
    throw new Error("This device cannot access the file. Select the same file with Open files to link it again. / На устройстве нет доступа к файлу. Выберите тот же файл через «Открыть файлы», чтобы связать его с библиотекой.");
  }
  const libraryState = () => ({ library: library.snapshot(), recovery: library.recovery(), mediaId: library.binding(currentId)?.mediaId ?? null, webdav: webdav.state(), playlistId: activePlaylist?.id ?? null });
  async function saveSettings() {
    rememberPosition();
    const temporary = `${settingsPath}.pending`;
    try {
      await writeFile(temporary, JSON.stringify({ speed: state.speed, backward: state.backward, forward: state.forward, audioOnly: player.audioOnly, positions, sourceBindings, recent, links: [...links.values()] }), { mode: 0o600 });
      await rename(temporary, settingsPath);
      if (rememberedProgress) await library.saveProgress(rememberedProgress.binding, rememberedProgress.position, rememberedProgress.duration, rememberedProgress.completed);
      await library.put("settings", { speed: state.speed, backward: state.backward, forward: state.forward });
      if (state.error?.code === "storage") state.error = null;
      return true;
    } catch (error) { console.error(error); state.error = { code: "storage" }; return false; }
  }
  let saving = false;
  const interval = setInterval(() => {
    if (saving || closing || !player.loaded) return;
    saving = true;
    void queue(async () => {
      await saveSettings();
    }).finally(() => { saving = false; });
  }, 5000);
  let advancing = false;
  const queueInterval = setInterval(() => {
    if (closing || advancing) return;
    advancing = true;
    void queue(async () => {
      await applySleepEffects(await sleep.tick(sleepContext()));
      if (!activePlaylist || !player.ended || endedHandled) return;
      endedHandled = true;
      const next = activePlaylist.mediaIds[++activePlaylist.idx];
      if (next) await playLibraryMedia(next); else activePlaylist = null;
    }).finally(() => { advancing = false; });
  }, 250);
  return {
    snapshot,
    sleepCommand(command) {
      if (!validSleepCommand(command)) return Promise.reject(new Error("Use valid timer and voice settings, then save again. / Проверьте настройки таймера и голоса, затем сохраните снова."));
      return queue(async () => {
        sleepError = "";
        if (command.type === "voices") { try { voices = await speech.voices(); } catch (error) { sleepError = error.message; } }
        else { try { await applySleepEffects(await sleep.command(command, sleepContext())); } catch (error) { sleepError = error.message.includes(" / ") ? error.message : "Cannot save timer settings. Check free space and folder access, then retry. / Не удалось сохранить настройки таймера. Проверьте свободное место и доступ к папке, затем повторите попытку."; } }
      });
    },
    libraryRequest(request) {
      if (request.type === "sync-preview") {
        const prepared = serial.then(async () => { if (!await saveSettings()) throw new DataError("storage"); });
        serial = prepared.catch(() => {});
        return prepared.then(() => webdav.inspect()).then(libraryState);
      }
      const result = serial.then(async () => {
        if (closing) throw new Error("The player is closing. Reopen Shravanam. / Плеер закрывается. Откройте Shravanam снова.");
        if (request.type === "state") return libraryState();
        if (request.type === "export") { if (!await saveSettings()) throw new DataError("storage"); return { archive: await library.exportArchive() }; }
        if (request.type === "preview-import") {
          const archive = await decodeArchive(request.archive);
          importPreview = { ...archive, token: createHash("sha256").update(request.archive).digest("hex") };
          const { added, conflicts, duplicates } = mergeLibraries(library.snapshot(), archive.payload);
          return { added, conflicts, duplicates, createdAt: archive.createdAt, token: importPreview.token };
        }
        if (request.type === "import") {
          if (!importPreview || request.token !== importPreview.token) throw new DataError("changed");
          await pauseForDataChange();
          await library.importLibrary(importPreview.payload, request.preferIncoming === true);
          await applyLibrarySettings();
          importPreview = null;
        } else if (request.type === "restore") {
          await pauseForDataChange();
          await library.restorePrevious(request.expected);
          await applyLibrarySettings();
        } else if (request.type === "sync-configure") await webdav.configure(request);
        else if (request.type === "sync-preview") { if (!await saveSettings()) throw new DataError("storage"); await webdav.inspect(); }
        else if (request.type === "sync-apply") { if (!webdav.state().preview || request.token !== webdav.state().preview.token) throw new DataError("changed"); await pauseForDataChange(); await webdav.apply(request.preferIncoming === true); await applyLibrarySettings(); }
        else if (request.type === "sync-disconnect") webdav.disconnect();
        else if (request.type === "command" && validLibraryCommand(request.command)) {
          const command = request.command;
          if (command.type === "save") await library.put(command.kind, command.value, command.id);
          else {
            const playlist = command.playlistId ? primaryRecords(library.snapshot()).find(record => record.id === command.playlistId && record.kind === "playlist") : null;
            if (command.playlistId && (!playlist || !playlist.value.mediaIds.includes(command.mediaId))) throw new Error("Choose an item from this playlist. / Выберите элемент этого плейлиста.");
            activePlaylist = playlist ? { id: playlist.id, mediaIds: [...playlist.value.mediaIds], idx: playlist.value.mediaIds.indexOf(command.mediaId) } : null;
            await playLibraryMedia(command.mediaId);
          }
        } else throw new Error("Cannot use this library action. Reload and retry. / Не удалось выполнить действие с библиотекой. Обновите страницу и повторите попытку.");
        return libraryState();
      });
      serial = result.catch(() => {});
      return result;
    },
    openDownloaded(path, url, audioOnly, title) {
      openedExplicitly = true;
      return queue(async () => {
        activePlaylist = null;
        const source = youtubeSource(url);
        const entry = await inspectPath(path);
        if (typeof title === "string") entry.title = title.slice(0, 300);
        await saveSettings();
        register(entry);
        remember([entry]);
        sourceBindings[entry.id] = source.id;
        const binding = await bindLibrarySource(source, title ?? entry.name);
        await library.bindAlias(entry.id, binding.mediaId, entry.path);
        positions[source.id] ??= positions[entry.id] ?? 0;
        await player.setAudioOnly(audioOnly);
        await select(entry.id);
      });
    },
    restoreLast() { return queue(async () => { if (!openedExplicitly && !currentId && recent.length) await openRecent(recent[0].id, false); }); },
    openPaths(incoming) {
      if (incoming.length) openedExplicitly = true;
      return queue(async () => {
        let firstId;
        let failure;
        const entries = [];
        for (const candidate of incoming) {
          if (typeof candidate !== "string" || candidate.includes("\0")) continue;
          const name = basename(candidate);
          const kind = mediaKind(name);
          if (!kind) { failure ??= { code: "format", name }; continue; }
          try {
            const entry = await inspectPath(candidate);
            await library.bindLocal({ key: entry.id, name: entry.name, kind: entry.kind, file: entry.file, path: entry.path });
            register(entry);
            entries.push(entry);
            firstId ??= entry.id;
          } catch (error) { console.error(error); failure ??= { code: "open", name }; }
        }
        if (entries.length) { remember(entries); await saveSettings(); }
        if (firstId) { activePlaylist = null; await select(firstId); }
        if (failure) state.error = failure;
      });
    },
    command(command) {
      if (!validPlaybackCommand(command)) return Promise.resolve(snapshot());
      if (["select", "recent", "open-youtube"].includes(command.type)) openedExplicitly = true;
      return queue(async () => {
        if (["select", "recent", "open-youtube"].includes(command.type)) activePlaylist = null;
        if (command.type === "mpv-path") {
          const selected = command.value.trim();
          if (selected) {
            try {
              if (!isAbsolute(selected) || (process.platform === "win32" && extname(selected).toLowerCase() !== ".exe")) throw new Error("Choose an executable file");
              if (!(await stat(selected)).isFile()) throw new Error("Choose a file, not a folder");
              await access(selected, constants.X_OK);
            } catch (error) { throw Object.assign(error, { code: "player-path", mediaName: selected }); }
          }
          try {
            await writeFile(`${playerSettingsPath}.pending`, JSON.stringify({ mpvPath: selected }), { mode: 0o600 });
            await rename(`${playerSettingsPath}.pending`, playerSettingsPath);
          } catch (error) { throw Object.assign(error, { code: "player-settings" }); }
          mpvPath = selected;
          player.executablePath = selected;
          if (["missing-player", "player-path", "player-settings", "player"].includes(state.error?.code)) state.error = null;
        }
        if (command.type === "open-youtube") {
          const source = youtubeSource(command.url);
          await selectLink(source, true, source.start, command.audioOnly ?? player.audioOnly);
        }
        if (command.type === "recent") await openRecent(command.id, true);
        if (command.type === "select") await select(command.id);
        if (command.type === "toggle" && currentId) {
          if (!player.loaded) await select(currentId);
          else {
            state.error = null;
            const paused = !player.state.paused;
            if (player.state.duration && player.state.time >= player.state.duration) { await player.request(["seek", 0, "absolute+exact"]); player.state.time = 0; }
            await player.request(["set_property", "pause", paused]);
            player.state.paused = paused;
            if (paused) speech.stop();
            await saveSettings();
          }
        }
        if (command.type === "seek" && player.loaded) {
          const time = Math.min(command.time, player.state.duration || command.time);
          await player.request(["seek", time, "absolute+exact"]);
          player.state.time = time;
          await saveSettings();
        }
        if (command.type === "speed") {
          state.speed = command.value;
          if (player.loaded) await player.request(["set_property", "speed", command.value]);
          player.state.speed = command.value;
          const sleepState = sleep.snapshot();
          if (player.loaded && sleepState.phase === "signal") { await player.request(["af", "remove", "@shravanam-sleep"]); await player.request(["af", "add", sleepSignalFilter(sleepState.remainingSeconds, sleepState.settings.signalGain, command.value)]); }
          await saveSettings();
        }
        if (command.type === "intervals") { state.backward = command.backward; state.forward = command.forward; await saveSettings(); }
        if (command.type === "audio-only") {
          if (links.has(currentId) && command.value !== player.audioOnly) await selectLink(links.get(currentId), !player.state.paused, undefined, command.value);
          else await player.setAudioOnly(command.value);
          await saveSettings();
        }
      });
    },
    async close() {
      closing = true;
      resolverAbort.abort();
      clearInterval(interval);
      clearInterval(queueInterval);
      speech.close();
      sleep.close();
      await serial;
      await saveSettings();
      await player.close();
    },
    terminate() { resolverAbort.abort(); speech.close(); player.process?.kill(); },
  };
}
