import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

// Read a named entry in the pinned official zipimport file, retaining its shebang prefix in Git.
function zipEntry(archive, name) {
  const prefix = archive.indexOf(Buffer.from("PK\x03\x04", "binary"));
  const end = archive.lastIndexOf(Buffer.from("PK\x05\x06", "binary"));
  let offset = prefix + archive.readUInt32LE(end + 16);
  for (let idx = 0; idx < archive.readUInt16LE(end + 10); idx++) {
    const nameLength = archive.readUInt16LE(offset + 28);
    if (archive.subarray(offset + 46, offset + 46 + nameLength).toString() === name) {
      const local = prefix + archive.readUInt32LE(offset + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const bytes = archive.subarray(start, start + archive.readUInt32LE(offset + 20));
      return (archive.readUInt16LE(offset + 10) === 0 ? bytes : inflateRawSync(bytes, { maxOutputLength: 2 * 1024 * 1024 })).toString();
    }
    offset += 46 + nameLength + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing packaged extractor entry: ${name}`);
}

test("Android packages the pinned yt-dlp and matching EJS instead of the stale library default", async () => {
  const directory = "native/android/player/src/main/res/raw";
  const manifest = JSON.parse(await readFile(`${directory}/shravanam_extractor.json`, "utf8"));
  const archive = await readFile(`${directory}/shravanam_ytdlp.zip`);
  expect(createHash("sha256").update(archive).digest("hex")).toBe(manifest.sha256);
  expect(manifest.url).toBe(`https://github.com/yt-dlp/yt-dlp/releases/download/${manifest.version}/yt-dlp`);
  expect(zipEntry(archive, "yt_dlp/version.py")).toContain(`__version__ = '${manifest.version}'`);
  expect(zipEntry(archive, "yt_dlp_ejs/_version.py")).toContain(`__version__ = version = '${manifest.ejsVersion}'`);
  expect(zipEntry(archive, "yt_dlp_ejs/yt/solver/lib.min.js").length).toBeGreaterThan(1000);
  expect(zipEntry(archive, "yt_dlp/extractor/youtube/_base.py")).not.toContain("'android_sdkless'");
});
