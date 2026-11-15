import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { checkedDownloadPath, createDownloads, downloadFormat } from "../desktop/downloads.js";
import { youtubeSource } from "../desktop/youtube.js";

test("download formats are bounded and do not accept page-supplied selectors", () => {
  expect(downloadFormat(true, 720)).toContain("bestaudio");
  expect(downloadFormat(false, 480)).toContain("height<=480");
  expect(() => downloadFormat(false, "bestvideo")).toThrow();
  expect(() => downloadFormat("false", 1080)).toThrow();
});

test("failed downloads retain their actionable error after host restart", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "download-errors-"));
  const source = youtubeSource("https://youtu.be/dQw4w9WgXcQ");
  const id = createHash("sha256").update([source.id, false, 720].join("\0")).digest("hex");
  const error = "Install ffmpeg and retry. / Установите ffmpeg и повторите попытку.";
  await writeFile(join(profile, "downloads.json"), JSON.stringify([{ id, url: source.url, name: "Video", audioOnly: false, quality: 720, status: "failed", error }]));
  const downloads = await createDownloads(profile, {});
  try { expect(downloads.snapshot()[0]).toMatchObject({ status: "failed", error }); }
  finally { await downloads.close(); }
});

test("download paths must resolve to a media file inside the owned directory", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const fixture = await mkdtemp(join(resolve("tmp"), "download-paths-"));
  const root = join(fixture, "downloads");
  await mkdir(join(root, "entry"), { recursive: true });
  const media = join(root, "entry", "media.m4a");
  await writeFile(media, "fixture");
  const outside = join(fixture, "outside.m4a");
  await writeFile(outside, "outside");
  expect(await checkedDownloadPath(root, "entry/media.m4a")).toBe(await realpath(media));
  await expect(checkedDownloadPath(root, "../outside.m4a")).rejects.toThrow();
  await expect(checkedDownloadPath(root, outside)).rejects.toThrow();
  if (process.platform !== "win32") {
    await symlink(outside, join(root, "entry", "escape.m4a"));
    await expect(checkedDownloadPath(root, "entry/escape.m4a")).rejects.toThrow();
  }
});
