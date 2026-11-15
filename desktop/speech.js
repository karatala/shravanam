import { spawn } from "node:child_process";

const unavailable = () => new Error("Speech is unavailable. Install a system voice, then try again. / Озвучивание недоступно. Установите системный голос и повторите.");
const windowsPrefix = "[Console]::InputEncoding = [Text.UTF8Encoding]::new(); [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Speech; $speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new(); ";

export function createSpeechService(options = {}) {
  const platform = options.platform ?? process.platform;
  const launch = options.spawn ?? spawn;
  const which = options.which ?? (name => Bun.which(name));
  let speaking = null;
  let voicesPromise;
  let closed = false;
  let generation = 0;
  function stop() { generation++; const child = speaking; speaking = null; child?.kill(); }
  function run(executable, args, input = "", speech = false) {
    return new Promise((resolve, reject) => {
      let output = "";
      let settled = false;
      const child = launch(executable, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
      if (speech) speaking = child;
      const timer = setTimeout(() => { child.kill(); finish(unavailable()); }, speech ? 30000 : 10000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (speaking === child) speaking = null;
        if (error) reject(error); else resolve(output);
      }
      child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 256 * 1024) { child.kill(); finish(unavailable()); } });
      child.on("error", () => finish(unavailable()));
      child.on("exit", (code, signal) => finish(code === 0 || (speech && signal) ? null : unavailable()));
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  }
  async function listVoices() {
    if (platform === "darwin") {
      const output = await run("/usr/bin/say", ["-v", "?"]);
      return output.split(/\r?\n/).flatMap(line => {
        const matched = line.match(/^(.+?)\s+([a-z]{2,3}_[A-Z]{2})\s+#/);
        return matched ? [{ id: matched[1].trim(), name: matched[1].trim(), language: matched[2].replace("_", "-") }] : [];
      });
    }
    if (platform === "win32") {
      const output = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${windowsPrefix} @($speaker.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{ id = $_.VoiceInfo.Name; name = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name } }) | ConvertTo-Json -Compress`]);
      let result;
      try { result = JSON.parse(output.replace(/^\uFEFF/, "")); }
      catch { throw unavailable(); }
      return Array.isArray(result) ? result : result ? [result] : [];
    }
    const binary = which("espeak-ng") ?? which("espeak");
    if (!binary) throw unavailable();
    const output = await run(binary, ["--voices"]);
    return output.split(/\r?\n/).slice(1).flatMap(line => {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 5 ? [{ id: parts[1], name: parts[3].replaceAll("_", " "), language: parts[1] }] : [];
    });
  }
  return {
    voices() {
      if (closed) return Promise.reject(unavailable());
      voicesPromise ??= listVoices().then(voices => voices.filter(voice => voice && typeof voice.id === "string" && voice.id.length <= 256 && typeof voice.name === "string" && typeof voice.language === "string").slice(0, 512)).catch(error => { voicesPromise = undefined; throw error; });
      return voicesPromise;
    },
    async speak({ text, voice }) {
      if (closed || typeof text !== "string" || !text.trim() || text.length > 512 || typeof voice !== "string") throw unavailable();
      stop();
      const requestGeneration = generation;
      const available = await this.voices();
      if (closed || generation !== requestGeneration) return;
      if (!available.some(item => item.id === voice)) throw new Error("The selected voice is unavailable. Choose an installed system voice. / Выбранный голос недоступен. Выберите установленный системный голос.");
      if (platform === "darwin") await run("/usr/bin/say", ["-v", voice, "-f", "-"], text, true);
      else if (platform === "win32") await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${windowsPrefix} $request = [Console]::In.ReadToEnd() | ConvertFrom-Json; $speaker.SelectVoice($request.voice); $speaker.Speak($request.text); $speaker.Dispose()`], JSON.stringify({ text, voice }), true);
      else {
        const binary = which("espeak-ng") ?? which("espeak");
        if (!binary) throw unavailable();
        await run(binary, ["-v", voice, "--stdin"], text, true);
      }
    },
    stop,
    close() { closed = true; stop(); },
  };
}
