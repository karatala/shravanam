import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { defaultSleepSettings, defaultSpeechSettings, validSleepCommand, validSleepSettings, validSpeechSettings } from "../src/sleep.ts";

const clone = value => structuredClone(value);
const volumeValue = value => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 100));
const badSettings = () => new Error("Cannot save timer settings. Use minutes from 1 to 240 and a time such as 21:00. / Не удалось сохранить настройки таймера. Укажите от 1 до 240 минут и время в виде 21:00.");

export function scheduleKey(date, schedule) {
  if (!schedule.enabled) return schedule.days.includes(date.getDay()) ? "all" : null;
  const minute = date.getHours() * 60 + date.getMinutes();
  const toMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  const anchor = new Date(date);
  if (start < end && (minute < start || minute >= end)) return null;
  if (start > end) {
    if (minute >= end && minute < start) return null;
    if (minute < end) anchor.setDate(anchor.getDate() - 1);
  }
  if (!schedule.days.includes(anchor.getDay())) return null;
  return `${anchor.getFullYear()}-${anchor.getMonth()}-${anchor.getDate()}`;
}

export function spokenTime(date, settings) {
  const hour = settings.hourFormat === 12 ? date.getHours() % 12 || 12 : date.getHours();
  return settings.phrase.replaceAll("{hour}", String(hour)).replaceAll("{minute}", String(date.getMinutes()).padStart(2, "0"));
}

export function sleepSignalFilter(seconds, gain, speed = 1) {
  const duration = Math.min(30, Math.max(0.1, seconds)) * Math.min(3, Math.max(0.25, speed));
  const amplitude = Math.min(1, Math.max(0, gain));
  const fade = Math.min(0.2 * speed, duration / 2);
  const graph = `anoisesrc=color=brown:amplitude=${amplitude}:duration=${duration}:sample_rate=48000,afade=t=in:d=${fade},afade=t=out:st=${duration - fade}:d=${fade}[noise];[in][noise]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`;
  return `@shravanam-sleep:lavfi=graph=%${Buffer.byteLength(graph)}%${graph}`;
}

export class AdaptiveSleepTimer {
  constructor(settings = defaultSleepSettings, speech = defaultSpeechSettings, markers = {}) {
    this.settings = clone(settings);
    this.speech = clone(speech);
    this.markers = clone(markers);
    this.phase = "idle";
    this.remainingSeconds = 0;
    this.repeatsDone = 0;
    this.mediaId = null;
    this.baseVolume = 100;
    this.lastVolume = 100;
    this.lastNow = null;
    this.lastWall = null;
    this.lastPlaying = false;
    this.seenPlaying = false;
    this.signalActive = false;
    this.scheduleStarted = null;
    this.speechBucket = null;
  }
  snapshot() {
    return { settings: clone(this.settings), speech: clone(this.speech), phase: this.phase, remainingSeconds: Math.max(0, this.remainingSeconds), repeatsDone: this.repeatsDone, mediaId: this.mediaId, marker: this.mediaId ? clone(this.markers[this.mediaId] ?? null) : null, voices: [], error: "" };
  }
  configure(settings, speech) {
    if (!validSleepSettings(settings) || !validSpeechSettings(speech)) throw badSettings();
    this.settings = clone(settings);
    this.speech = clone(speech);
    this.speechBucket = null;
  }
  start(context, now = performance.now()) {
    if (!context.mediaId) throw new Error("Cannot start the sleep timer. Open an audio or video file first. / Не удалось включить таймер сна. Сначала откройте аудио или видео.");
    const effects = this.signalActive ? [{ type: "signal-stop" }] : [];
    this.phase = "countdown";
    this.remainingSeconds = this.settings.firstMinutes * 60;
    this.repeatsDone = 0;
    this.mediaId = context.mediaId;
    this.baseVolume = volumeValue(context.volume);
    this.lastVolume = this.baseVolume;
    this.lastNow = now;
    this.lastPlaying = context.playing;
    this.signalActive = false;
    return effects;
  }
  stop(context) {
    const effects = [{ type: "signal-stop" }, { type: "speech-stop" }];
    if (!["idle", "expired"].includes(this.phase)) effects.push({ type: "volume", value: this.baseVolume });
    this.phase = "idle";
    this.remainingSeconds = 0;
    this.signalActive = false;
    this.lastVolume = context.volume;
    return effects;
  }
  respond(context, now = performance.now()) {
    if (["idle", "expired"].includes(this.phase)) return [];
    const resume = this.phase === "paused";
    const baseVolume = this.baseVolume;
    const effects = this.start({ ...context, volume: baseVolume }, now);
    effects.push({ type: "volume", value: baseVolume });
    if (resume) effects.push({ type: "resume" });
    return effects;
  }
  tick(context, now = performance.now(), wallDate = new Date()) {
    const effects = [];
    let elapsed = this.lastNow === null ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    const wasPlaying = this.lastPlaying;
    const wallElapsed = this.lastWall === null ? 0 : Math.max(0, (wallDate.getTime() - this.lastWall) / 1000);
    const volume = volumeValue(context.volume);
    this.lastNow = now;
    this.lastWall = wallDate.getTime();
    this.lastPlaying = context.playing;
    if (context.mediaId !== this.mediaId) {
      this.seenPlaying = false;
      effects.push({ type: "speech-stop" });
      if (!["idle", "expired"].includes(this.phase) && context.mediaId) {
        const baseVolume = this.baseVolume;
        effects.push(...this.start({ ...context, volume: baseVolume }, now), { type: "volume", value: baseVolume });
      }
      else if (!context.mediaId) { this.phase = "idle"; this.remainingSeconds = 0; this.signalActive = false; this.mediaId = null; effects.push({ type: "signal-stop" }); }
      else this.mediaId = context.mediaId;
      elapsed = 0;
    }
    if (context.playing) this.seenPlaying = true;
    const window = scheduleKey(wallDate, this.settings.schedule);
    if (this.phase === "idle" && this.settings.schedule.enabled && window && window !== this.scheduleStarted && context.playing && context.mediaId) {
      this.scheduleStarted = window;
      effects.push(...this.start(context, now));
    }
    if (!["idle", "expired"].includes(this.phase) && volume > this.lastVolume + 0.5 && !effects.some(effect => effect.type === "volume")) { effects.push(...this.respond(context, now)); elapsed = 0; }
    this.lastVolume = effects.findLast(effect => effect.type === "volume")?.value ?? volume;
    if (["paused", "expired"].includes(this.phase) && context.playing && !wasPlaying) {
      const baseVolume = this.baseVolume;
      effects.push(...this.start({ ...context, volume: baseVolume }, now), { type: "volume", value: baseVolume });
      this.lastVolume = baseVolume;
    }
    if (this.phase === "paused") {
      this.remainingSeconds -= Math.max(elapsed, wallElapsed);
      if (this.remainingSeconds <= 0) { this.phase = "expired"; this.remainingSeconds = 0; }
    } else if (context.playing && wasPlaying && context.mediaId && !["idle", "expired"].includes(this.phase)) {
      this.remainingSeconds -= Math.min(2, elapsed);
      if (this.remainingSeconds <= 0) {
        if (this.phase === "signal") {
          effects.push({ type: "signal-stop" });
          this.signalActive = false;
          if (this.repeatsDone >= this.settings.repeats) {
            this.phase = "paused";
            this.remainingSeconds = this.settings.responseMinutes * 60;
            this.markers[context.mediaId] = { ...this.markers[context.mediaId], mediaId: context.mediaId, pausedAt: context.time };
            effects.push({ type: "speech-stop" }, { type: "pause" });
          } else { this.phase = "repeat"; this.remainingSeconds = this.settings.repeatMinutes * 60; }
        } else {
          if (this.phase === "repeat") {
            this.repeatsDone++;
            this.lastVolume = volume * (1 - this.settings.reductionPercent / 100);
            effects.push({ type: "volume", value: this.lastVolume });
          } else this.markers[context.mediaId] = { mediaId: context.mediaId, time: context.time, pausedAt: null };
          this.phase = "signal";
          this.remainingSeconds = this.settings.signalSeconds;
          this.signalActive = true;
          effects.push({ type: "speech-stop" }, { type: "signal-start", seconds: this.remainingSeconds, gain: this.settings.signalGain });
        }
      } else if (this.phase === "signal" && !this.signalActive) {
        this.signalActive = true;
        effects.push({ type: "signal-start", seconds: this.remainingSeconds, gain: this.settings.signalGain });
      }
    }
    if (!context.playing && this.signalActive) { this.signalActive = false; effects.push({ type: "signal-stop" }); }
    if (!context.playing && wasPlaying && !this.speech.whilePaused) effects.push({ type: "speech-stop" });
    const minute = wallDate.getHours() * 60 + wallDate.getMinutes();
    const bucket = `${wallDate.getFullYear()}-${wallDate.getMonth()}-${wallDate.getDate()}-${minute}`;
    if (minute % this.speech.intervalMinutes === 0 && bucket !== this.speechBucket) {
      this.speechBucket = bucket;
      if (this.speech.enabled && context.mediaId && context.available !== false && wallDate.getSeconds() < 2 && scheduleKey(wallDate, this.speech.schedule) && (context.playing || (this.speech.whilePaused && this.seenPlaying)) && !["signal", "paused", "expired"].includes(this.phase) && !effects.some(effect => effect.type === "pause")) effects.push({ type: "speech", text: spokenTime(wallDate, this.speech), voice: this.speech.voice });
    }
    return effects;
  }
}

export async function createSleepController(profile) {
  const path = join(profile, "sleep.json");
  let error = "";
  let saved = {};
  try {
    saved = JSON.parse(await readFile(path, "utf8"));
    if (!validSleepSettings(saved.settings) || !validSpeechSettings(saved.speech)) throw badSettings();
  } catch (failure) {
    if (failure.code !== "ENOENT") error = "Cannot read timer settings. Save the settings again. / Не удалось прочитать настройки таймера. Сохраните настройки снова.";
    saved = {};
  }
  const markers = Object.fromEntries(Object.entries(saved.markers ?? {}).filter(([mediaId, marker]) => /^[a-zA-Z0-9_-]{1,128}$/.test(mediaId) && marker && marker.mediaId === mediaId && Number.isFinite(marker.time) && marker.time >= 0 && (marker.pausedAt === null || (Number.isFinite(marker.pausedAt) && marker.pausedAt >= 0))));
  const timer = new AdaptiveSleepTimer(saved.settings, saved.speech, markers);
  let markerSignature = JSON.stringify(markers);
  async function save() {
    try {
      await writeFile(`${path}.pending`, JSON.stringify({ settings: timer.settings, speech: timer.speech, markers: timer.markers }), { mode: 0o600 });
      await rename(`${path}.pending`, path);
    } catch {
      error = "Cannot save timer settings. Check free disk space and folder access, then save again. / Не удалось сохранить настройки таймера. Проверьте свободное место и доступ к папке, затем сохраните снова.";
      throw new Error(error);
    }
    markerSignature = JSON.stringify(timer.markers);
    error = "";
  }
  return {
    snapshot() { return { ...timer.snapshot(), error }; },
    async command(command, context, now = performance.now(), wallDate = new Date()) {
      if (!validSleepCommand(command)) throw badSettings();
      let effects = [];
      if (command.type === "configure") { timer.configure(command.settings, command.speech); await save(); }
      if (command.type === "start") effects = timer.start(context, now);
      if (command.type === "stop") { effects = timer.stop(context); timer.scheduleStarted = scheduleKey(wallDate, timer.settings.schedule); }
      if (command.type === "respond") effects = timer.respond(context, now);
      if (command.type === "test-voice") effects = [{ type: "speech", text: spokenTime(wallDate, timer.speech), voice: timer.speech.voice }];
      return effects;
    },
    async tick(context, now = performance.now(), wallDate = new Date()) {
      const effects = timer.tick(context, now, wallDate);
      if (JSON.stringify(timer.markers) !== markerSignature) {
        try { await save(); }
        catch { error = "Cannot save the sleep position. Check free disk space and save the settings again. / Не удалось сохранить позицию сна. Проверьте свободное место и сохраните настройки снова."; }
      }
      return effects;
    },
    close() {},
  };
}
