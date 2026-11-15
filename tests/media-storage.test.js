import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";

const permissionTest = process.platform === "win32" || process.getuid?.() === 0 ? test.skip : test;
async function withMedia(check) {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "media-storage-"));
  const media = await createMediaPlayer(profile);
  try { await check({ profile, media }); }
  finally { await chmod(profile, 0o700); await media.close(); }
}

permissionTest("retrying a failed save clears the storage error and keeps the previous file until success", () => withMedia(async ({ profile, media }) => {
  await media.command({ type: "speed", value: 1.25 });
  const settingsPath = join(profile, "playback.json");
  const previous = await readFile(settingsPath, "utf8");
  await chmod(profile, 0o500);
  const failed = await media.command({ type: "speed", value: 1.5 });
  expect(failed.error?.code).toBe("storage");
  expect(await readFile(settingsPath, "utf8")).toBe(previous);

  await chmod(profile, 0o700);
  const recovered = await media.command({ type: "speed", value: 1.5 });
  expect(recovered.error).toBeNull();
  expect(JSON.parse(await readFile(settingsPath, "utf8")).speed).toBe(1.5);
}));

test("a successful save retains unrelated playback errors", () => withMedia(async ({ profile, media }) => {
  await media.openPaths([join(profile, "notes.txt")]);
  const saved = await media.command({ type: "speed", value: 1.5 });
  expect(saved.error?.code).toBe("format");
  expect(saved.error?.name).toBe("notes.txt");
}));
