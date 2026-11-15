import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as childProcess from "node:child_process";
import * as youtube from "../desktop/youtube.js";
import { createDownloads } from "../desktop/downloads.js";

const nativeTest = process.platform === "win32" ? test.skip : test;
nativeTest("downloads publish only completed files, cancel, retry, persist, and open through owned IDs", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "download-lifecycle-"));
  const executable = join(profile, "fake-downloader.js");
  await writeFile(executable, `#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
const args = Bun.argv.slice(2);
const output = args[args.indexOf("--output") + 1].replace("%(ext)s", "m4a");
console.log('TITLE:"Test media"');
console.log('PROGRESS:35.0%');
await Bun.sleep(300);
await writeFile(output, "downloaded fixture");
console.log('FILE:' + JSON.stringify(output));
`, { mode: 0o700 });
  const spawnProcess = childProcess.spawn;
  const discovery = spyOn(youtube, "findDownloader").mockResolvedValue(executable);
  const spawning = spyOn(childProcess, "spawn").mockImplementation((path, args, options) => {
    if (path !== executable) throw new Error("Test must not run a real downloader");
    return spawnProcess(path, args, options);
  });
  const opened = [];
  const media = { async openDownloaded(...args) { opened.push(args); } };
  let downloads;
  async function waitFor(status) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) { if (downloads.snapshot()[0]?.status === status) return; await Bun.sleep(20); }
    throw new Error(`Expected ${status}: ${JSON.stringify(downloads.snapshot())}`);
  }
  try {
    downloads = await createDownloads(profile, media);
    downloads.download("https://youtu.be/dQw4w9WgXcQ", true, 720);
    const id = downloads.snapshot()[0].id;
    expect(downloads.snapshot()[0].status).toBe("downloading");
    await expect(downloads.open(id)).rejects.toThrow("not ready");
    downloads.cancel(id);
    await waitFor("interrupted");
    downloads.retry(id);
    await waitFor("ready");
    expect(downloads.snapshot()[0].name).toBe("Test media");
    expect(downloads.snapshot()[0]).not.toHaveProperty("filename");
    await downloads.close();
    downloads = await createDownloads(profile, media);
    await downloads.open(id);
    expect(opened[0][1]).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(opened[0][2]).toBe(true);
    expect(await readFile(opened[0][0], "utf8")).toBe("downloaded fixture");
    const saved = JSON.parse(await readFile(join(profile, "downloads.json"), "utf8"));
    expect(saved[0].status).toBe("ready");
    expect(spawning).toHaveBeenCalledTimes(1);
  } finally { await downloads?.close(); spawning.mockRestore(); discovery.mockRestore(); }
});
