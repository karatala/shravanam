import { expect, test } from "bun:test";
import { parseSubtitles, parseTime, TimedTextError } from "../src/timed-text";
import { primaryRecords, validLibraryCommand } from "../src/library";

test("SRT and WebVTT preserve timing and multiline text without executable markup", () => {
  expect(parseSubtitles("\uFEFF1\r\n00:01:02,250 --> 00:01:04,500\r\n<b>Первый</b> &amp; второй\r\nДругая строка\r\n")).toEqual([{ start: 62.25, end: 64.5, text: "Первый & второй\nДругая строка" }]);
  expect(parseSubtitles("WEBVTT\n\nNOTE ignored\nmetadata\n\ncue-one\n00:01.000 --> 00:02.000 align:start\nHello\n\n00:01.500 --> 00:03.000\nOverlap")).toEqual([{ start: 1, end: 2, text: "Hello" }, { start: 1.5, end: 3, text: "Overlap" }]);
});

test("invalid subtitles and invalid clock values fail before saving", () => {
  for (const source of ["", "WEBVTT\n\n", "1\n00:00:03,000 --> 00:00:01,000\nReversed", "1\n00:60:00,000 --> 01:00:01,000\nInvalid minute", "1\n00:00:01,000 --> 00:00:03,000"]) expect(() => parseSubtitles(source)).toThrow(TimedTextError);
  expect(() => parseSubtitles("я".repeat(500001))).toThrow(TimedTextError);
  expect(parseTime("1:02:03.250")).toBe(3723.25);
  expect(parseTime("90")).toBe(90);
  for (const value of ["-1", "1:60", "abc", "1:2:3:4"]) expect(() => parseTime(value)).toThrow(TimedTextError);
});

test("library editing commands validate all record fields and preserve first variant selection", () => {
  expect(validLibraryCommand({ type: "save", kind: "note", value: { targetId: "book-one", text: "Test", time: 12 } })).toBe(true);
  expect(validLibraryCommand({ type: "save", kind: "note", value: { targetId: "edited-record", text: "Test", time: null } })).toBe(true);
  expect(validLibraryCommand({ type: "save", kind: "text", value: { targetId: "book-one", role: "subtitle", language: "ru", original: "Original", edited: "Edited", cues: [{ start: 1, end: 2, text: "Edited" }] } })).toBe(true);
  expect(validLibraryCommand({ type: "save", kind: "chapter", value: { mediaId: "book-one", start: 12, end: 1, title: "Bad" } })).toBe(false);
  expect(validLibraryCommand({ type: "save", kind: "playlist", value: { title: "Books", mediaIds: ["../file"] } })).toBe(false);
  expect(validLibraryCommand({ type: "play", mediaId: "book-one", playlistId: "playlist-one" })).toBe(true);
  expect(validLibraryCommand({ type: "play", mediaId: "book-one", path: "/tmp/book.mp3" })).toBe(false);
  const first = { id: "list-one", kind: "playlist" as const, updatedAt: 2, value: { title: "Current", mediaIds: [] } };
  const second = { ...first, updatedAt: 1, value: { title: "Alternative", mediaIds: [] } };
  expect(primaryRecords({ schemaVersion: 1, records: [first, second] })).toEqual([first]);
});
