import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mediaExtensions, mediaKind } from "../src/playback.ts";

export async function applyAndroidPlayer() {
  const modulePath = "android/shravanam-player";
  await cp("native/android/player", modulePath, { recursive: true });
  const mediaTypes = `${modulePath}/src/main/res/raw/shravanam_media_types.json`;
  await mkdir(dirname(mediaTypes), { recursive: true });
  await writeFile(mediaTypes, JSON.stringify(Object.fromEntries(mediaExtensions.map(extension => [extension, mediaKind(`media.${extension}`)]))));
  const activity = "android/app/src/main/java/org/karatala/shravanam/MainActivity.java";
  await mkdir(dirname(activity), { recursive: true });
  await cp("native/android/MainActivity.java", activity);
  const entries = [
    ["android/settings.gradle", "// Shravanam native player", "include ':shravanam-player'\nproject(':shravanam-player').projectDir = new File('./shravanam-player/')"],
    ["android/app/build.gradle", "// Shravanam native player", "dependencies { implementation project(':shravanam-player') }"],
    ["android/app/build.gradle", "// Shravanam extraction runtime", "android { packaging { jniLibs { useLegacyPackaging = true } } }"],
  ];
  for (const [filename, marker, content] of entries) {
    const source = await readFile(filename, "utf8");
    if (!source.includes(marker)) await writeFile(filename, `${source}\n${marker}\n${content}\n`);
  }
}
