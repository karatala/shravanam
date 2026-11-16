import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AdaptiveSleepTimer, createSleepController, scheduleKey, sleepSignalFilter, spokenTime } from "../desktop/sleep.js";
import { createSpeechService } from "../desktop/speech.js";
import { defaultSleepSettings, defaultSpeechSettings, validSleepCommand } from "../src/sleep.ts";
import { MpvPlayer } from "../desktop/mpv.js";

const mpvBinary = Bun.which(process.platform === "win32" ? "mpv.exe" : "mpv");

function simulation(settings = defaultSleepSettings, speech = defaultSpeechSettings) {
  const timer = new AdaptiveSleepTimer(settings, speech);
  const context = { mediaId: "media-one", time: 0, playing: true, volume: 100 };
  let now = 0;
  const effects = [];
  function apply(incoming) {
    effects.push(...incoming);
    for (const effect of incoming) {
      if (effect.type === "volume") context.volume = effect.value;
      if (effect.type === "pause") context.playing = false;
      if (effect.type === "resume") context.playing = true;
    }
    return incoming;
  }
  return { timer, context, effects, start() { return apply(timer.start(context, now)); }, step(seconds = 1, wallDate = new Date(2026, 10, 15, 12, 1)) { now += seconds * 1000; if (context.playing) context.time += seconds; return apply(timer.tick(context, now, wallDate)); }, advance(seconds) { for (let idx = 0; idx < seconds; idx++) this.step(); }, respond() { return apply(timer.respond(context, now)); } };
}

test("adaptive timer uses playing time, mixes three signals and preserves both sleep positions", () => {
  const check = simulation();
  check.start();
  check.advance(900);
  expect(check.timer.phase).toBe("signal");
  expect(check.context.volume).toBe(100);
  expect(check.timer.snapshot().marker).toEqual({ mediaId: "media-one", time: 900, pausedAt: null });
  check.advance(5 + 300);
  expect(check.timer.repeatsDone).toBe(1);
  expect(check.context.volume).toBeCloseTo(70);
  check.advance(5 + 300);
  expect(check.timer.repeatsDone).toBe(2);
  expect(check.context.volume).toBeCloseTo(49);
  check.advance(5);
  expect(check.context.playing).toBe(false);
  expect(check.timer.phase).toBe("paused");
  expect(check.timer.snapshot().marker).toEqual({ mediaId: "media-one", time: 900, pausedAt: 1515 });
  expect(check.effects.filter(effect => effect.type === "signal-start")).toHaveLength(3);
  check.step(181);
  expect(check.timer.phase).toBe("expired");
  check.context.volume = 60;
  check.step();
  expect(check.timer.phase).toBe("expired");
  check.context.playing = true;
  check.step();
  expect(check.timer.phase).toBe("countdown");
  expect(check.context.volume).toBe(100);
});

test("manual pause freezes countdown, seeking does not reset it, response restores volume", () => {
  const check = simulation();
  check.start();
  check.advance(20);
  check.context.playing = false;
  check.step(1000);
  expect(check.timer.remainingSeconds).toBe(880);
  check.context.time = 5000;
  check.context.playing = true;
  check.step();
  check.step();
  expect(check.timer.remainingSeconds).toBe(879);
  check.respond();
  expect(check.timer.remainingSeconds).toBe(900);
  check.advance(900 + 5 + 300);
  expect(check.context.volume).toBeCloseTo(70);
  check.context.volume = 75;
  check.step();
  expect(check.timer.phase).toBe("countdown");
  expect(check.timer.remainingSeconds).toBe(900);
  expect(check.context.volume).toBe(100);
});

test("a three-minute timer with two one-minute repeats stays playing until the third signal ends", () => {
  const check = simulation({ ...structuredClone(defaultSleepSettings), firstMinutes: 3, repeatMinutes: 1, repeats: 2 });
  check.start();
  check.advance(185);
  expect(check.context.playing).toBe(true);
  expect(check.timer.phase).toBe("repeat");
  check.advance(65);
  expect(check.context.playing).toBe(true);
  expect(check.timer.repeatsDone).toBe(1);
  check.advance(65);
  expect(check.context.playing).toBe(false);
  expect(check.timer.phase).toBe("paused");
  expect(check.effects.filter(effect => effect.type === "signal-start")).toHaveLength(3);
  expect(check.timer.snapshot().marker).toEqual({ mediaId: "media-one", time: 180, pausedAt: 315 });
});

(mpvBinary ? test : test.skip)("mixing a sleep signal into native playback keeps the media timeline after noise ends and removal", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "sleep-filter-native-"));
  await mkdir(join(profile, "mpv"));
  await writeFile(join(profile, "mpv/mpv.conf"), "ao=null\n");
  const fixture = join(profile, "silent.wav");
  const silence = Buffer.alloc(8000 * 2 * 60 + 44);
  silence.write("RIFF", 0); silence.writeUInt32LE(silence.length - 8, 4); silence.write("WAVEfmt ", 8);
  silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22);
  silence.writeUInt32LE(8000, 24); silence.writeUInt32LE(16000, 28); silence.writeUInt16LE(2, 32); silence.writeUInt16LE(16, 34);
  silence.write("data", 36); silence.writeUInt32LE(silence.length - 44, 40);
  await writeFile(fixture, silence);
  const player = new MpvPlayer(profile, () => {});
  player.executablePath = mpvBinary;
  try {
    await player.load(fixture, 1, 30, true);
    const before = await player.request(["get_property", "time-pos"]);
    await player.request(["af", "add", sleepSignalFilter(0.4, 0)]);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const afterNoise = await player.request(["get_property", "time-pos"]);
    expect(afterNoise).toBeGreaterThan(before + 0.5);
    await player.request(["af", "remove", "@shravanam-sleep"]);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(await player.request(["get_property", "time-pos"])).toBeGreaterThanOrEqual(afterNoise - 0.1);
    expect(await player.request(["get_property", "pause"])).toBe(false);
    expect(await player.request(["get_property", "path"])).toBe(fixture);
    expect(player.loaded).toBe(true);
  } finally { await player.close(); }
});

test("switching media restores the starting volume and resets the cycle", () => {
  const check = simulation();
  check.start();
  check.advance(900 + 5 + 300);
  expect(check.context.volume).toBeCloseTo(70);
  check.context.mediaId = "media-two";
  check.context.time = 0;
  const effects = check.step();
  expect(effects).toContainEqual({ type: "signal-stop" });
  expect(check.context.volume).toBe(100);
  expect(check.timer.remainingSeconds).toBe(900);
  expect(check.timer.repeatsDone).toBe(0);
  expect(check.timer.snapshot().marker).toBeNull();
  expect(check.timer.markers["media-one"].time).toBe(900);
});

test("no media cannot start a timer and overnight schedules use the starting day", () => {
  const timer = new AdaptiveSleepTimer();
  expect(() => timer.start({ mediaId: null, playing: false, volume: 100, time: 0 })).toThrow("Open an audio or video file first");
  const schedule = { enabled: true, start: "21:00", end: "06:00", days: [0] };
  expect(scheduleKey(new Date(2026, 10, 15, 23), schedule)).toBe("2026-10-15");
  expect(scheduleKey(new Date(2026, 10, 16, 2), schedule)).toBe("2026-10-15");
  expect(scheduleKey(new Date(2026, 10, 16, 6), schedule)).toBeNull();
  expect(scheduleKey(new Date(2026, 10, 16, 23), schedule)).toBeNull();
});

test("speech follows selected clock boundaries and is silent after a sleep pause", () => {
  const speech = { ...structuredClone(defaultSpeechSettings), enabled: true, intervalMinutes: 15, whilePaused: true, schedule: { enabled: false, start: "00:00", end: "00:00", days: [0] } };
  const check = simulation({ ...structuredClone(defaultSleepSettings), firstMinutes: 1, repeats: 0 }, speech);
  expect(check.step(1, new Date(2026, 10, 15, 21, 0))).toContainEqual({ type: "speech", text: "Сейчас 21:00", voice: "Milena" });
  expect(check.step(1, new Date(2026, 10, 15, 21, 0, 1)).some(effect => effect.type === "speech")).toBe(false);
  expect(check.step(1, new Date(2026, 10, 15, 21, 15, 5)).some(effect => effect.type === "speech")).toBe(false);
  check.start();
  check.advance(65);
  expect(check.timer.phase).toBe("paused");
  expect(check.step(1, new Date(2026, 10, 15, 21, 30)).some(effect => effect.type === "speech")).toBe(false);
  check.step(181);
  expect(check.timer.phase).toBe("expired");
  expect(check.step(1, new Date(2026, 10, 15, 21, 45)).some(effect => effect.type === "speech")).toBe(false);
  expect(spokenTime(new Date(2026, 10, 16, 0, 5), { ...speech, hourFormat: 12, phrase: "{hour} {minute}" })).toBe("12 05");
  expect(check.step(1, new Date(2026, 10, 16, 12, 0)).some(effect => effect.type === "speech")).toBe(false);
});

test("timer settings and sleep markers survive restart without starting playback", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "sleep-test-"));
  const controller = await createSleepController(profile);
  const context = { mediaId: "media-one", time: 0, playing: true, volume: 100 };
  await controller.command({ type: "configure", settings: { ...structuredClone(defaultSleepSettings), firstMinutes: 1, repeats: 0 }, speech: defaultSpeechSettings }, context);
  await controller.command({ type: "start" }, context, 0);
  for (let idx = 1; idx <= 65; idx++) { context.time = idx; await controller.tick(context, idx * 1000); }
  const saved = JSON.parse(await readFile(join(profile, "sleep.json"), "utf8"));
  expect(saved.markers["media-one"]).toEqual({ mediaId: "media-one", time: 60, pausedAt: 65 });
  const reopened = await createSleepController(profile);
  await reopened.tick({ ...context, playing: false }, 0);
  expect(reopened.snapshot().phase).toBe("idle");
  expect(reopened.snapshot().marker.pausedAt).toBe(65);
  expect(validSleepCommand({ type: "configure", settings: { ...defaultSleepSettings, firstMinutes: -1 }, speech: defaultSpeechSettings })).toBe(false);
  expect(sleepSignalFilter(5, 1 / 3)).toContain("anoisesrc=color=brown");
  expect(sleepSignalFilter(5, 1 / 3, 2)).toContain("duration=10:");
  expect(sleepSignalFilter(5, 1 / 3, 2)).toContain("afade=t=out:st=9.6:d=0.4");
  expect(sleepSignalFilter(30, 1 / 3, 3)).toContain("duration=90:");
});

test("speech during pause requires playback in the current session and an available player", () => {
  const speech = { ...structuredClone(defaultSpeechSettings), enabled: true, whilePaused: true, schedule: { enabled: false, start: "00:00", end: "00:00", days: [0] } };
  const check = simulation(defaultSleepSettings, speech);
  check.context.playing = false;
  expect(check.step(1, new Date(2026, 10, 15, 12, 0)).some(effect => effect.type === "speech")).toBe(false);
  check.context.playing = true;
  check.step(1, new Date(2026, 10, 15, 12, 1));
  check.context.playing = false;
  expect(check.step(1, new Date(2026, 10, 15, 12, 30))).toContainEqual({ type: "speech", text: "Сейчас 12:30", voice: "Milena" });
  check.context.available = false;
  expect(check.step(1, new Date(2026, 10, 15, 13, 0)).some(effect => effect.type === "speech")).toBe(false);
});

test("stopping speech during voice discovery cancels the pending announcement", async () => {
  const launches = [];
  const launch = (executable, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => {};
    child.kill = () => child.emit("exit", null, "SIGTERM");
    launches.push({ executable, args, child });
    return child;
  };
  const service = createSpeechService({ platform: "darwin", spawn: launch });
  const pending = service.speak({ text: "Сейчас 21:00", voice: "Milena" });
  expect(launches).toHaveLength(1);
  service.stop();
  launches[0].child.stdout.emit("data", Buffer.from("Milena ru_RU # Example\n"));
  launches[0].child.emit("exit", 0, null);
  await pending;
  expect(launches).toHaveLength(1);
  service.close();
});
