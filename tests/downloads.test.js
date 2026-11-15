import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkedDownloadPath, downloadFormat } from "../desktop/downloads.js";

test("download formats are bounded and do not accept page-supplied selectors", () => {
  expect(downloadFormat(true, 720)).toContain("bestaudio");
  expect(downloadFormat(false, 480)).toContain("height<=480");
  expect(() => downloadFormat(false, "bestvideo")).toThrow();
  expect(() => downloadFormat("false", 1080)).toThrow();
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
