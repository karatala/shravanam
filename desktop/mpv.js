import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

export class MpvPlayer {
  constructor(profile, onChange) {
    this.profile = profile;
    this.onChange = onChange;
    this.state = { time: 0, duration: 0, paused: true, speed: 1, loading: false };
    this.pending = new Map();
    this.sequence = 0;
    this.socket = null;
    this.process = null;
    this.starting = null;
    this.closed = false;
    this.loaded = false;
    this.waitForLoad = null;
    this.backend = null;
    this.audioOnly = true;
  }

  async start() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.starting) return this.starting;
    this.starting = this.startProcess(this.backend === "iina");
    try { await this.starting; }
    finally { this.starting = null; }
  }

  async startProcess(iinaOnly = false) {
    if (this.closed) throw new Error("Player is closed");
    const binaryName = process.platform === "win32" ? "mpv.exe" : "mpv";
    const candidates = [join(dirname(process.execPath), "mpv", binaryName), join(dirname(process.execPath), "..", "Resources", "mpv", "bin", binaryName), Bun.which(binaryName)];
    if (process.platform === "darwin") candidates.push("/opt/homebrew/bin/mpv", "/usr/local/bin/mpv", "/Applications/mpv.app/Contents/MacOS/mpv", join(homedir(), "Applications/mpv.app/Contents/MacOS/mpv"));
    let executable;
    for (const candidate of iinaOnly ? [] : candidates.filter(Boolean)) {
      try { await access(candidate, constants.X_OK); executable = candidate; break; }
      catch { /* Try the next supported installation location. */ }
    }
    this.backend = "mpv";
    if (!executable && process.platform === "darwin") {
      for (const application of ["/Applications/IINA.app", join(homedir(), "Applications/IINA.app")]) {
        const candidate = join(application, "Contents/MacOS/IINA");
        try { await access(candidate, constants.X_OK); executable = candidate; this.backend = "iina"; break; }
        catch { /* Try the next IINA installation location. */ }
      }
    }
    if (!executable) { this.backend = null; throw Object.assign(new Error("No supported player was found"), { code: "missing-player" }); }
    const configDirectory = join(this.profile, "mpv");
    await mkdir(configDirectory, { recursive: true });
    const defaults = {
      "mpv.conf": "# Shravanam playback defaults. Edit this file while the app is closed.\ncache=yes\ncache-on-disk=no\ndemuxer-max-bytes=128MiB\ndemuxer-max-back-bytes=32MiB\n",
      "input.conf": "# Bindings for the mpv video window. These are not global shortcuts.\nSPACE cycle pause\nLEFT seek -15\nRIGHT seek 30\n",
    };
    for (const [filename, content] of Object.entries(defaults)) {
      try { await writeFile(join(configDirectory, filename), content, { flag: "wx" }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\shravanam-${process.pid}-${randomBytes(12).toString("hex")}` : join(await mkdtemp(join(tmpdir(), "shravanam-mpv-")), "ipc");
    let args = [`--config-dir=${configDirectory}`, `--input-ipc-server=${socketPath}`, "--idle=yes", "--keep-open=yes", "--terminal=no", "--input-terminal=no", "--force-window=no", "--resume-playback=no", "--save-position-on-quit=no", "--pause=yes", "--vid=no"];
    let bootstrap;
    if (this.backend === "iina") {
      // IINA applies command-line mpv properties only when it opens an input.
      // Bootstrap with silence, never the user's file, until IPC is connected.
      const silence = Buffer.alloc(16044);
      silence.write("RIFF", 0); silence.writeUInt32LE(silence.length - 8, 4); silence.write("WAVEfmt ", 8);
      silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22);
      silence.writeUInt32LE(8000, 24); silence.writeUInt32LE(16000, 28); silence.writeUInt16LE(2, 32); silence.writeUInt16LE(16, 34);
      silence.write("data", 36); silence.writeUInt32LE(silence.length - 44, 40);
      bootstrap = join(this.profile, "iina-bootstrap.wav");
      await writeFile(bootstrap, silence, { mode: 0o600 });
      // Spawn the application binary directly, as iina-cli does, to own its PID.
      // Single-dash arguments override preferences for this process only.
      args = [
        "-recordPlaybackHistory", "NO", "-recordRecentFiles", "NO", "-resumeLastPosition", "NO", "-enableThumbnailPreview", "NO", "-enableAdvancedSettings", "NO",
        "-playlistAutoPlayNext", "NO", "-pauseWhenInactive", "NO", "-pauseWhenMinimized", "NO", "-quitWhenNoOpenedWindow", "NO", "-NSQuitAlwaysKeepsWindows", "NO",
        `--mpv-input-ipc-server=${socketPath}`, "--mpv-idle=yes", "--mpv-keep-open=yes", "--mpv-pause=yes", "--mpv-mute=yes", "--mpv-vid=no",
        "--mpv-resume-playback=no", "--mpv-save-position-on-quit=no", bootstrap,
      ];
    }
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    this.process = child;
    let startupError;
    const backend = this.backend;
    child.stderr.on("data", chunk => console.error(`[${backend}] ${chunk.toString().trim().replace(/https?:\/\/[^\s"'<>]+/g, "[stream URL]")}`));
    child.on("error", error => { startupError = error; if (this.process === child) this.disconnected(error); });
    child.on("exit", () => { if (this.process === child) this.disconnected(new Error("mpv exited")); });
    try {
      for (let attempt = 0; attempt < (this.backend === "iina" ? 300 : 100); attempt++) {
        if (startupError) throw startupError;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error("mpv stopped during startup");
        try {
          this.socket = await new Promise((resolve, reject) => {
            const socket = createConnection(socketPath);
            socket.once("error", error => { socket.destroy(); reject(error); });
            socket.once("connect", () => resolve(socket));
          });
          break;
        } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
      }
      if (!this.socket || this.socket.destroyed) throw new Error("Cannot connect to mpv");
      const socket = this.socket;
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", chunk => {
        if (this.socket !== socket) return;
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try { this.receive(JSON.parse(line)); }
          catch (error) { console.error("Invalid mpv response", error); }
        }
      });
      socket.on("error", error => { if (this.socket === socket) this.disconnected(error); });
      socket.on("close", () => { if (this.socket === socket) this.disconnected(new Error("mpv connection closed")); });
      if (bootstrap) {
        // IPC can be ready before IINA opens its launch file. Wait before replacing it.
        const loaded = new Promise((resolve, reject) => { this.waitForLoad = { path: bootstrap, resolve, reject }; });
        void loaded.catch(() => {});
        const timer = setTimeout(() => this.waitForLoad?.reject(new Error("IINA startup media loading timed out")), 15000);
        try {
          const path = await this.request(["get_property", "path"]).catch(() => null);
          const duration = await this.request(["get_property", "duration"]).catch(() => null);
          if (path === bootstrap && Number.isFinite(duration) && duration > 0) this.waitForLoad.resolve();
          await loaded;
        } finally { clearTimeout(timer); this.waitForLoad = null; }
      }
      for (const [idx, name] of ["time-pos", "duration", "pause", "speed", "eof-reached"].entries()) await this.request(["observe_property", idx + 1, name]);
      await this.setAudioOnly(this.audioOnly);
    } catch (error) {
      // Clear the failed process and socket before starting another backend.
      // Late exit/close events from this attempt must not stop its replacement.
      this.disconnected(error);
      if (backend === "mpv" && process.platform === "darwin" && !this.closed) {
        console.warn("mpv could not start. Trying installed IINA.");
        try { return await this.startProcess(true); }
        catch (fallbackError) { if (fallbackError.code !== "missing-player") throw fallbackError; }
      }
      if (backend === "iina") error.code = "iina-player";
      throw error;
    }
  }

  receive(message) {
    const pending = this.pending.get(message.request_id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(message.request_id);
      if (message.error === "success") pending.resolve(message.data);
      else pending.reject(new Error(message.error));
    }
    if (message.event === "property-change") {
      // Ignore bootstrap and shutdown properties outside an active media load.
      if (!this.loaded && !this.waitForLoad) return;
      if (message.name === "time-pos" && Number.isFinite(message.data)) this.state.time = Math.max(0, message.data);
      if (message.name === "duration" && Number.isFinite(message.data)) this.state.duration = Math.max(0, message.data);
      if (message.name === "pause" && typeof message.data === "boolean") this.state.paused = message.data;
      if (message.name === "speed" && Number.isFinite(message.data)) this.state.speed = message.data;
      if (message.name === "eof-reached" && message.data === true) { this.state.time = this.state.duration; this.state.paused = true; }
      this.onChange();
    }
    if (message.event === "file-loaded") {
      const waiting = this.waitForLoad;
      if (waiting) void this.request(["get_property", "path"]).then(path => {
        if (this.waitForLoad === waiting && path === waiting.path) waiting.resolve();
      }).catch(error => waiting.reject(error));
    }
    if (message.event === "end-file" && this.loaded && ["stop", "quit"].includes(message.reason)) {
      this.loaded = false;
      this.state.paused = true;
      this.onChange("player-closed");
    }
    if (message.event === "end-file" && message.reason === "error") {
      this.loaded = false;
      this.state.loading = false;
      this.state.paused = true;
      this.waitForLoad?.reject(new Error(message.file_error ?? "Cannot open media"));
      this.onChange("play");
    }
  }

  disconnected(error) {
    this.socket?.destroy();
    this.socket = null;
    const child = this.process;
    this.process = null;
    child?.kill();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.waitForLoad?.reject(error);
    this.loaded = false;
    this.state.paused = true;
    this.state.loading = false;
    if (!this.closed && !this.starting) this.onChange("player-closed");
  }

  request(command, timeout = 5000) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error("mpv is not connected"));
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("mpv command timed out")); }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ command, request_id: requestId }) + "\n");
    });
  }

  async setAudioOnly(audioOnly) {
    if (this.socket && !this.socket.destroyed) {
      if (this.backend === "iina") {
        await this.request(["set_property", "cache", "yes"]);
        await this.request(["set_property", "cache-on-disk", false]);
        await this.request(["set_property", "demuxer-max-bytes", (audioOnly ? 32 : 128) * 1024 * 1024]);
        await this.request(["set_property", "demuxer-max-back-bytes", (audioOnly ? 8 : 32) * 1024 * 1024]);
        await this.request(["set_property", "hwdec", "auto-safe"]);
      }
      await this.request(["set_property", "vid", audioOnly ? "no" : "auto"]);
    }
    this.audioOnly = audioOnly;
  }

  async load(path, speed, position = 0, autoplay = true, stream = null) {
    this.loaded = false;
    await this.start();
    this.state = { time: 0, duration: 0, paused: true, loading: true, speed };
    const loaded = new Promise((resolve, reject) => { this.waitForLoad = { path, resolve, reject }; });
    // Observe rejection immediately, including a process exit before loadfile replies.
    void loaded.catch(() => {});
    const timer = setTimeout(() => this.waitForLoad?.reject(new Error("Media loading timed out")), 15000);
    try {
      if (this.backend === "iina") await this.request(["set_property", "mute", true]);
      await this.request(["set_property", "pause", true]);
      await this.request(["set_property", "http-header-fields", stream?.headers ?? []]);
      await this.request(["set_property", "ytdl", false]);
      if (stream) {
        await this.request(["set_property", "cache", "yes"]);
        await this.request(["set_property", "cache-on-disk", false]);
        await this.request(["set_property", "hwdec", "auto-safe"]);
      }
      await this.request(["loadfile", path, "replace"]);
      await loaded;
      if (stream?.audio) {
        await this.request(["set_property", "http-header-fields", stream.audio.headers]);
        await this.request(["audio-add", stream.audio.url, "select"], 30000);
      }
      const duration = await this.request(["get_property", "duration"]).catch(() => 0);
      if (Number.isFinite(duration)) this.state.duration = duration;
      if (position > 0 && (!this.state.duration || position < this.state.duration)) { await this.request(["seek", position, "absolute+exact"]); this.state.time = position; }
      await this.request(["set_property", "speed", speed]);
      await this.request(["set_property", "pause", !autoplay]);
      if (this.backend === "iina") await this.request(["set_property", "mute", false]);
      this.state.speed = speed;
      this.state.paused = !autoplay;
      this.loaded = true;
    } finally {
      clearTimeout(timer);
      this.waitForLoad = null;
      this.state.loading = false;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try { if (this.socket && !this.socket.destroyed) await this.request(["quit"]); }
    catch { /* A quit command can close IPC before its reply. */ }
    this.socket?.destroy();
    this.process?.kill();
  }
}
