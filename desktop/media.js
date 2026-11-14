import { realpath, stat, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import { initialPlaybackState, mediaKind, validPlaybackCommand } from "../src/playback.ts";
import { MpvPlayer } from "./mpv.js";

export async function createMediaPlayer(profile) {
  const state = initialPlaybackState();
  const paths = new Map();
  const settingsPath = join(profile, "playback.json");
  let currentId = null;
  let serial = Promise.resolve();
  let closing = false;
  let positions = {};
  let recent = [];
  let openedExplicitly = false;
  let audioOnly = true;
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!validPlaybackCommand({ type: "speed", value: settings.speed }) || !validPlaybackCommand({ type: "intervals", backward: settings.backward, forward: settings.forward })) throw new Error("Invalid playback settings");
    state.speed = settings.speed;
    state.backward = settings.backward;
    state.forward = settings.forward;
    if (typeof settings.audioOnly === "boolean") audioOnly = settings.audioOnly;
    if (settings.positions && typeof settings.positions === "object" && !Array.isArray(settings.positions)) positions = Object.fromEntries(Object.entries(settings.positions).filter(([id, time]) => /^[a-f0-9]{64}$/.test(id) && Number.isFinite(time) && time >= 0));
    if (Array.isArray(settings.recent)) recent = settings.recent.filter(entry => entry && /^[a-f0-9]{64}$/.test(entry.id) && typeof entry.path === "string" && isAbsolute(entry.path) && !entry.path.includes("\0") && typeof entry.name === "string" && mediaKind(entry.name) === entry.kind).slice(0, 20);
  } catch (error) { if (error.code !== "ENOENT") { console.error(error); state.error = { code: "storage" }; } }
  const player = new MpvPlayer(profile, code => { if (code) state.error = { code, name: state.items.find(item => item.id === currentId)?.name }; });
  player.state.speed = state.speed;
  player.audioOnly = audioOnly;
  const snapshot = () => ({ ...state, ...(currentId ? player.state : {}), currentId, audioOnly: player.audioOnly, backend: player.backend, items: [...state.items], recent: recent.map(({ id, name, kind }) => ({ id, name, kind })) });
  function queue(action) {
    const next = serial.then(async () => { if (!closing) await action(); }).catch(error => {
      console.error("Desktop media action failed", error);
      state.error = { code: ["missing-player", "iina-player", "open", "changed-file"].includes(error.code) ? error.code : "player", name: error.mediaName ?? state.items.find(item => item.id === currentId)?.name };
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
    return { id, path, name, kind };
  }
  function register(entry) {
    if (!paths.has(entry.id)) { paths.set(entry.id, entry.path); state.items.push({ id: entry.id, name: entry.name, kind: entry.kind }); }
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
    const path = paths.get(id);
    if (!path) return;
    let entry;
    try { entry = await inspectPath(path); }
    catch (error) { throw Object.assign(error, { code: "open", mediaName: basename(path) }); }
    if (entry.id !== id) throw Object.assign(new Error("File changed"), { code: "changed-file", mediaName: entry.name });
    state.error = null;
    await saveSettings();
    currentId = id;
    await player.load(path, state.speed, positions[id] ?? 0, autoplay);
    remember([entry]);
    await saveSettings();
  }
  async function openRecent(id, autoplay) {
    const entry = recent.find(item => item.id === id);
    if (!entry) return;
    register(entry);
    await select(id, autoplay);
  }
  async function saveSettings() {
    if (currentId && player.loaded && !player.state.loading) positions[currentId] = player.state.duration > 0 && player.state.time >= player.state.duration ? 0 : player.state.time;
    const temporary = `${settingsPath}.pending`;
    try {
      await writeFile(temporary, JSON.stringify({ speed: state.speed, backward: state.backward, forward: state.forward, audioOnly: player.audioOnly, positions, recent }), { mode: 0o600 });
      await rename(temporary, settingsPath);
    } catch (error) { console.error(error); state.error = { code: "storage" }; }
  }
  let saving = false;
  const interval = setInterval(() => {
    if (saving || closing || !player.loaded) return;
    saving = true;
    void queue(async () => {
      await saveSettings();
    }).finally(() => { saving = false; });
  }, 5000);
  return {
    snapshot,
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
            register(entry);
            entries.push(entry);
            firstId ??= entry.id;
          } catch (error) { console.error(error); failure ??= { code: "open", name }; }
        }
        if (entries.length) { remember(entries); await saveSettings(); }
        if (firstId) await select(firstId);
        if (failure) state.error = failure;
      });
    },
    command(command) {
      if (!validPlaybackCommand(command)) return Promise.resolve(snapshot());
      if (command.type === "select" || command.type === "recent") openedExplicitly = true;
      return queue(async () => {
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
          await saveSettings();
        }
        if (command.type === "intervals") { state.backward = command.backward; state.forward = command.forward; await saveSettings(); }
        if (command.type === "audio-only") { await player.setAudioOnly(command.value); await saveSettings(); }
      });
    },
    async close() {
      closing = true;
      clearInterval(interval);
      await serial;
      await saveSettings();
      await player.close();
    },
    terminate() { player.process?.kill(); },
  };
}
