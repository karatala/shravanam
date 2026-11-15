export type SubtitleCue = { start: number; end: number; text: string };
export class TimedTextError extends Error {
  constructor(public code: "size" | "format" | "time", public invalid = "") { super(code); }
}

export function parseTime(value: string): number {
  const source = value.trim();
  if (!/^\d+(?::\d{1,2}){0,2}(?:[.,]\d{1,3})?$/.test(source)) throw new TimedTextError("time", source.slice(0, 80));
  const parts = source.replace(",", ".").split(":").map(Number);
  if (parts.slice(1).some(part => part >= 60)) throw new TimedTextError("time", source.slice(0, 80));
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  if (!Number.isFinite(seconds) || seconds > Number.MAX_SAFE_INTEGER) throw new TimedTextError("time", source.slice(0, 80));
  return seconds;
}

export function parseSubtitles(source: string): SubtitleCue[] {
  if (new TextEncoder().encode(source).length > 1000000) throw new TimedTextError("size");
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const webvtt = /^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized);
  const blocks = normalized.split(/\n[ \t]*\n/);
  const cues: SubtitleCue[] = [];
  for (const [idx, block] of blocks.entries()) {
    if (webvtt && idx === 0) continue;
    if (webvtt && /^(?:NOTE(?:[ \t]|$)|STYLE$|REGION$)/.test(block.split("\n")[0])) continue;
    const lines = block.split("\n");
    const timingIdx = lines[0].includes("-->") ? 0 : 1;
    const timing = lines[timingIdx]?.match(/^(\S+)\s+-->\s+(\S+)(?:[ \t]+.*)?$/);
    if (!timing || lines.length <= timingIdx + 1) throw new TimedTextError("format", (lines[timingIdx] ?? block).slice(0, 80));
    const clock = webvtt ? /^\d{2,}:\d{2}(?::\d{2})?\.\d{3}$/ : /^\d{2,}:\d{2}:\d{2},\d{3}$/;
    if (!clock.test(timing[1]) || !clock.test(timing[2])) throw new TimedTextError("format", timing[0].slice(0, 80));
    const start = parseTime(timing[1]);
    const end = parseTime(timing[2]);
    if (end < start) throw new TimedTextError("time", timing[0].slice(0, 80));
    const text = lines.slice(timingIdx + 1).join("\n").replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity]!);
    cues.push({ start, end, text });
    if (cues.length > 100000) throw new TimedTextError("size");
  }
  if (!cues.length) throw new TimedTextError("format");
  return cues.sort((first, second) => first.start - second.start);
}

export function timedTextError(error: unknown, russian: boolean): string {
  if (!(error instanceof TimedTextError)) return russian ? "Не удалось сохранить данные. Проверьте свободное место и повторите попытку." : "Cannot save the data. Check free storage and try again.";
  if (error.code === "size") return russian ? "Субтитры превышают лимит 1 МБ. Выберите меньший файл .srt или .vtt." : "The subtitles exceed the 1 MB limit. Choose a smaller .srt or .vtt file.";
  if (error.code === "time") return russian ? `Некорректное время «${error.invalid}». Введите секунды или время, например 01:30. Конец должен быть не раньше начала.` : `Invalid time “${error.invalid}”. Enter seconds or a time, for example 01:30. The end must not precede the start.`;
  return russian ? `Не удалось прочитать субтитры${error.invalid ? `: «${error.invalid}»` : ""}. Выберите файл SRT или WebVTT с временем, например 00:00:01,000 --> 00:00:03,000 для SRT.` : `Cannot read the subtitles${error.invalid ? `: “${error.invalid}”` : ""}. Choose an SRT or WebVTT file with timing, for example 00:00:01,000 --> 00:00:03,000 for SRT.`;
}
