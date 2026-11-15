export type TimeWindow = { enabled: boolean; start: string; end: string; days: number[] };
export type SleepSettings = { firstMinutes: number; repeatMinutes: number; signalSeconds: number; signalGain: number; reductionPercent: number; repeats: number; responseMinutes: number; schedule: TimeWindow };
export type SpeechSettings = { enabled: boolean; intervalMinutes: number; voice: string; phrase: string; hourFormat: 12 | 24; whilePaused: boolean; schedule: TimeWindow };
export type SleepPhase = "idle" | "countdown" | "signal" | "repeat" | "paused" | "expired";
export type SleepMarker = { mediaId: string; time: number; pausedAt: number | null };
export type SpeechVoice = { id: string; name: string; language: string };
export type SleepState = { settings: SleepSettings; speech: SpeechSettings; phase: SleepPhase; remainingSeconds: number; repeatsDone: number; mediaId: string | null; marker: SleepMarker | null; voices: SpeechVoice[]; error: string };
export type SleepCommand = { type: "configure"; settings: SleepSettings; speech: SpeechSettings } | { type: "start" | "stop" | "respond" | "voices" | "test-voice" };
export type SleepEffect = { type: "signal-start"; seconds: number; gain: number } | { type: "signal-stop" | "pause" | "resume" | "speech-stop" } | { type: "volume"; value: number } | { type: "speech"; text: string; voice: string };
export const defaultSleepSettings: SleepSettings = { firstMinutes: 15, repeatMinutes: 5, signalSeconds: 5, signalGain: 1 / 3, reductionPercent: 30, repeats: 2, responseMinutes: 3, schedule: { enabled: false, start: "21:00", end: "06:00", days: [0, 1, 2, 3, 4, 5, 6] } };
export const defaultSpeechSettings: SpeechSettings = { enabled: false, intervalMinutes: 30, voice: "Milena", phrase: "Сейчас {hour}:{minute}", hourFormat: 24, whilePaused: false, schedule: { enabled: true, start: "09:00", end: "22:00", days: [0, 1, 2, 3, 4, 5, 6] } };
const finite = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
export function validTimeWindow(value: unknown): value is TimeWindow {
  if (!value || typeof value !== "object") return false;
  const window = value as TimeWindow;
  return typeof window.enabled === "boolean" && [window.start, window.end].every(time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) && Array.isArray(window.days) && window.days.length > 0 && window.days.length <= 7 && new Set(window.days).size === window.days.length && window.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
}
export function validSleepSettings(value: unknown): value is SleepSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as SleepSettings;
  return finite(settings.firstMinutes, 1, 240) && finite(settings.repeatMinutes, 1, 60) && finite(settings.signalSeconds, 1, 30) && finite(settings.signalGain, 0, 1) && finite(settings.reductionPercent, 0, 100) && Number.isInteger(settings.repeats) && finite(settings.repeats, 0, 10) && finite(settings.responseMinutes, 0, 30) && validTimeWindow(settings.schedule);
}
export function validSpeechSettings(value: unknown): value is SpeechSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as SpeechSettings;
  return typeof settings.enabled === "boolean" && Number.isInteger(settings.intervalMinutes) && finite(settings.intervalMinutes, 1, 120) && typeof settings.voice === "string" && settings.voice.length > 0 && settings.voice.length <= 256 && typeof settings.phrase === "string" && settings.phrase.trim().length > 0 && settings.phrase.length <= 256 && [12, 24].includes(settings.hourFormat) && typeof settings.whilePaused === "boolean" && validTimeWindow(settings.schedule);
}
export function validSleepCommand(value: unknown): value is SleepCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as SleepCommand;
  return ["start", "stop", "respond", "voices", "test-voice"].includes(command.type) || (command.type === "configure" && validSleepSettings(command.settings) && validSpeechSettings(command.speech));
}
