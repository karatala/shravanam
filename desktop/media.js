import { realpath, stat, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
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
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!validPlaybackCommand({ type: "speed", value: settings.speed }) || !validPlaybackCommand({ type: "intervals", backward: settings.backward, forward: settings.forward })) throw new Error("Invalid playback settings");
    state.speed = settings.speed;
    state.backward = settings.backward;
    state.forward = settings.forward;
    if (settings.positions && typeof settings.positions === "object" && !Array.isArray(settings.positions)) positions = Object.fromEntries(Object.entries(settings.positions).filter(([id, time]) => /^[a-f0-9]{64}$/.test(id) && Number.isFinite(time) && time >= 0));
  } catch (error) { if (error.code !== "ENOENT") { console.error(error); state.error = { code: "storage" }; } }
  const player = new MpvPlayer(profile, code => { if (code) state.error = { code, name: state.items.find(item => item.id === currentId)?.name }; });
  player.state.speed = state.speed;
  const snapshot = () => ({ ...state, ...(currentId ? player.state : {}), currentId, items: [...state.items] });
  function queue(action) {
    const next = serial.then(async () => { if (!closing) await action(); }).catch(error => {
      console.error("Desktop media action failed", error);
      state.error = { code: error.code === "missing-player" ? "missing-player" : "player", name: state.items.find(item => item.id === currentId)?.name };
    });
    serial = next;
    return next.then(snapshot);
  }
  async function select(id) {
    const path = paths.get(id);
    if (!path) return;
    state.error = null;
    await saveSettings();
    currentId = id;
    await player.load(path, state.speed, positions[id] ?? 0);
  }
  async function saveSettings() {
    if (currentId && player.loaded && !player.state.loading) positions[currentId] = player.state.duration > 0 && player.state.time >= player.state.duration ? 0 : player.state.time;
    const temporary = `${settingsPath}.pending`;
    try {
      await writeFile(temporary, JSON.stringify({ speed: state.speed, backward: state.backward, forward: state.forward, positions }), { mode: 0o600 });
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
    openPaths(incoming) {
      return queue(async () => {
        let firstId;
        let failure;
        for (const candidate of incoming) {
          if (typeof candidate !== "string" || candidate.includes("\0")) continue;
          const name = basename(candidate);
          const kind = mediaKind(name);
          if (!kind) { failure ??= { code: "format", name }; continue; }
          try {
            const path = await realpath(candidate);
            const metadata = await stat(path);
            if (!metadata.isFile()) throw new Error("Not a file");
            const id = createHash("sha256").update(path).update(`\0${metadata.size}\0${metadata.mtimeMs}`).digest("hex");
            if (!paths.has(id)) { paths.set(id, path); state.items.push({ id, name, kind }); }
            firstId ??= id;
          } catch (error) { console.error(error); failure ??= { code: "open", name }; }
        }
        if (firstId) await select(firstId);
        if (failure) state.error = failure;
      });
    },
    command(command) {
      if (!validPlaybackCommand(command)) return Promise.resolve(snapshot());
      return queue(async () => {
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
