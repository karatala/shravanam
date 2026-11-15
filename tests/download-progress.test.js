import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMediaPlayer } from "../desktop/media.js";
import { MpvPlayer } from "../desktop/mpv.js";
import { youtubeSource } from "../desktop/youtube.js";

test("downloaded copies share source progress and restore locally without a network request", async () => {
  await mkdir(resolve("tmp"), { recursive: true });
  const profile = await mkdtemp(join(resolve("tmp"), "download-progress-"));
  const path = join(profile, "saved.m4a");
  await writeFile(path, "local fixture");
  const source = youtubeSource("https://youtu.be/dQw4w9WgXcQ");
  await writeFile(join(profile, "playback.json"), JSON.stringify({ speed: 1.25, backward: 15, forward: 30, positions: { [source.id]: 42 }, recent: [], links: [] }));
  const loads = [];
  const loading = spyOn(MpvPlayer.prototype, "load").mockImplementation(async function(path, speed, position, autoplay) {
    loads.push({ path, speed, position, autoplay });
    this.loaded = true; this.state = { time: position, duration: 120, speed, paused: !autoplay, loading: false };
  });
  let media;
  try {
    media = await createMediaPlayer(profile);
    await media.openDownloaded(path, source.url, true, "Saved source title");
    expect(loads[0]).toMatchObject({ path, position: 42, autoplay: true });
    await media.close();
    media = await createMediaPlayer(profile);
    await media.restoreLast();
    expect(loads[1]).toMatchObject({ path, position: 42, autoplay: false });
    expect(media.snapshot().paused).toBe(true);
    expect(media.snapshot().items[0].name).toBe("Saved source title");
    const saved = JSON.parse(await readFile(join(profile, "playback.json"), "utf8"));
    expect(Object.values(saved.sourceBindings)).toContain(source.id);
    expect(saved.positions[source.id]).toBe(42);
    await media.close();
    const fileId = Object.keys(saved.sourceBindings)[0];
    delete saved.positions[source.id];
    saved.positions[fileId] = 17;
    saved.sourceBindings = {};
    await writeFile(join(profile, "playback.json"), JSON.stringify(saved));
    media = await createMediaPlayer(profile);
    await media.openDownloaded(path, source.url, true, "Saved source title");
    // Once migration is complete, the shared library owns progress. Retained legacy data cannot replace it.
    expect(loads[2].position).toBe(42);
  } finally { await media?.close(); loading.mockRestore(); }
});
