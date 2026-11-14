export const mediaExtensions = ["mp3", "m4a", "m4b", "aac", "flac", "ogg", "opus", "wav", "mp4", "m4v", "webm", "mkv", "mov"];
export const mediaAccept = mediaExtensions.map(extension => `.${extension}`).join(",");

export function mediaKind(name: string): "audio" | "video" | null {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!mediaExtensions.includes(extension)) return null;
  return ["mp4", "m4v", "webm", "mkv", "mov"].includes(extension) ? "video" : "audio";
}

export type MediaItem = { id: string; name: string; kind: "audio" | "video"; temporary?: boolean };
export type PlaybackError = { code: "format" | "open" | "play" | "storage" | "missing-player" | "player" | "access" | "android-player" | "library-changed" | "recent-access" | "changed-file"; name?: string };
export type PlaybackState = {
  items: MediaItem[];
  recent: MediaItem[];
  currentId: string | null;
  time: number;
  duration: number;
  paused: boolean;
  loading: boolean;
  speed: number;
  backward: number;
  forward: number;
  error: PlaybackError | null;
};
export type PlaybackCommand = { type: "select" | "recent"; id: string } | { type: "toggle" } | { type: "seek"; time: number } | { type: "speed"; value: number } | { type: "intervals"; backward: number; forward: number };

export function initialPlaybackState(): PlaybackState {
  return { items: [], recent: [], currentId: null, time: 0, duration: 0, paused: true, loading: false, speed: 1, backward: 15, forward: 30, error: null };
}

export function validPlaybackCommand(command: PlaybackCommand): boolean {
  if (!command || typeof command !== "object") return false;
  if (command.type === "select" || command.type === "recent") return typeof command.id === "string";
  if (command.type === "toggle") return true;
  if (command.type === "seek") return Number.isFinite(command.time) && command.time >= 0;
  if (command.type === "speed") return Number.isFinite(command.value) && command.value >= 0.25 && command.value <= 3;
  if (command.type === "intervals") return [command.backward, command.forward].every(value => Number.isInteger(value) && value >= 1 && value <= 600);
  return false;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
