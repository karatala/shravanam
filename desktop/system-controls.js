import { spawn } from "node:child_process";
import windowsScript from "../native/windows/system-controls.ps1" with { type: "text" };

const actions = new Set(["toggle", "back", "forward", "open"]);
const keyCodes = { Space: 0x20, Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22 };
const modifierCodes = { Ctrl: 2, Control: 2, Alt: 1, Shift: 4, Super: 8, Win: 8, Meta: 8 };

export function systemShortcut(shortcut) {
  if (!shortcut || !actions.has(shortcut.action) || typeof shortcut.key !== "string" || shortcut.key.length > 100) return null;
  const parts = shortcut.key.split("+").map(part => part.trim());
  const key = parts.pop();
  let modifiers = 0;
  for (const modifier of parts) {
    const code = Object.hasOwn(modifierCodes, modifier) ? modifierCodes[modifier] : 0;
    if (!code || (modifiers & code)) return null;
    modifiers |= code;
  }
  if (!(modifiers & (1 | 2 | 8))) return null;
  const virtualKey = Object.hasOwn(keyCodes, key) ? keyCodes[key] : /^[A-Z0-9]$/.test(key) ? key.charCodeAt(0) : /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ? 111 + Number(key.slice(1)) : 0;
  return virtualKey ? { action: shortcut.action, key: shortcut.key, modifiers, virtualKey } : null;
}

export function systemActionCommand(action, state) {
  if (!state?.currentId || state.loading) return null;
  const selected = typeof action === "string" ? { action } : action;
  if (selected.action === "play") return { type: "pause", value: false };
  if (selected.action === "pause" || selected.action === "stop") return { type: "pause", value: true };
  if (selected.action === "toggle") return { type: "toggle" };
  const time = Number.isFinite(state.time) ? Math.max(0, state.time) : 0;
  const duration = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : Number.MAX_SAFE_INTEGER;
  if (["back", "previous", "rewind"].includes(selected.action)) return { type: "seek", time: Math.max(0, time - state.backward) };
  if (["forward", "next", "fastforward"].includes(selected.action)) return { type: "seek", time: Math.min(duration, time + state.forward) };
  if (selected.action === "seek" && Number.isFinite(selected.position) && selected.position >= 0) return { type: "seek", time: Math.min(duration, selected.position) };
  if (selected.action === "speed" && Number.isFinite(selected.value) && selected.value >= 0.25 && selected.value <= 3) return { type: "speed", value: selected.value };
  return null;
}

export function createSystemControls({ getPlaybackState, command, openWindow = () => {}, shortcuts = [] }) {
  const supported = process.platform === "win32";
  let available = false;
  let disposed = false;
  let updating = false;
  let error = "";
  let child;
  let timer;
  let startupTimer;
  let output = "";
  let diagnostic = "";
  let failed = false;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const normalized = shortcuts.slice(0, 16).map(systemShortcut).filter(Boolean);
  let registered = shortcuts.slice(0, 16).map(shortcut => ({ action: shortcut.action, key: shortcut.key, registered: false }));
  function finishReady(value) { clearTimeout(startupTimer); resolveReady(value); }
  function fail(failure) {
    if (disposed || failed) return;
    failed = true;
    available = false;
    clearInterval(timer);
    registered = registered.map(shortcut => ({ ...shortcut, registered: false }));
    error = "Cannot use Windows media controls. Restart Shravanam and try again. / Не удалось включить системное управление Windows. Перезапустите Shravanam и повторите попытку.";
    if (failure) console.warn("Windows system controls unavailable", failure);
    finishReady(false);
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
  }
  function send(message) {
    if (!disposed && child?.stdin.writable) child.stdin.write(JSON.stringify(message) + "\n");
  }
  async function update() {
    if (disposed || !available || updating) return;
    updating = true;
    try {
      const state = await getPlaybackState();
      if (disposed) return;
      send({ type: "state", available: Boolean(state.currentId) && !state.loading, title: state.items.find(item => item.id === state.currentId)?.name ?? "Shravanam", paused: state.paused, position: state.time, duration: state.duration, speed: state.speed });
    } catch (failure) { fail(failure); }
    finally { updating = false; }
  }
  async function action(message) {
    if (disposed || !available) return;
    try {
      if (message.action === "open") await openWindow();
      else {
        const playbackCommand = systemActionCommand(message, await getPlaybackState());
        if (disposed || !playbackCommand) return;
        await command(playbackCommand);
        await update();
      }
    } catch (failure) { console.warn("Windows media action failed", failure); }
  }
  function receive(message) {
    if (disposed || failed || !message || typeof message !== "object") return;
    if (message.type === "ready") { available = true; send({ type: "configure", shortcuts: normalized }); void update(); }
    else if (message.type === "configured" && Array.isArray(message.shortcuts)) {
      registered = registered.map(shortcut => message.shortcuts.find(selected => selected.action === shortcut.action && selected.key === shortcut.key) ?? shortcut);
      const conflicts = registered.filter(shortcut => !shortcut.registered).map(shortcut => shortcut.key).join(", ");
      if (conflicts) error = `Cannot register global shortcuts: ${conflicts}. Another app may use them. Close that app and restart Shravanam. / Не удалось включить глобальные сочетания: ${conflicts}. Возможно, их использует другое приложение. Закройте его и перезапустите Shravanam.`;
      finishReady(true);
    } else if (message.type === "action") void action(message);
    else if (message.type === "error") fail(message.error);
  }
  if (!supported) finishReady(false);
  else {
    try {
      const bootstrap = "$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine()))))";
      child = spawn("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-EncodedCommand", Buffer.from(bootstrap, "utf16le").toString("base64")], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      child.stdin.on("error", failure => fail(failure));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        output += chunk;
        if (output.length > 65536) { fail("Unexpected helper output"); child.kill(); return; }
        let newline;
        while ((newline = output.indexOf("\n")) >= 0) {
          const line = output.slice(0, newline).trim(); output = output.slice(newline + 1);
          if (!line) continue;
          try { receive(JSON.parse(line)); } catch { fail("Invalid helper response"); child.kill(); }
        }
      });
      child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
      child.once("error", fail);
      child.once("exit", () => { if (!disposed) fail(diagnostic || "System-control helper exited"); });
      timer = setInterval(() => void update(), 1000);
      startupTimer = setTimeout(() => { fail("System-control helper did not start"); child.kill(); }, 10000);
      child.stdin.write(Buffer.from(windowsScript, "utf8").toString("base64") + "\n");
    } catch (failure) { fail(failure); }
  }
  return {
    ready: () => ready,
    snapshot: () => ({ supported, available: !disposed && available, error, shortcuts: registered.map(shortcut => ({ ...shortcut })) }),
    async close() {
      if (disposed) return;
      send({ type: "quit" });
      disposed = true; available = false; clearInterval(timer); finishReady(false);
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise(resolve => { const timeout = setTimeout(() => { child.kill(); resolve(); }, 1500); child.once("exit", () => { clearTimeout(timeout); resolve(); }); });
    },
    terminate() { if (disposed) return; disposed = true; available = false; clearInterval(timer); finishReady(false); child?.kill(); },
  };
}
