import { expect, test } from "bun:test";
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

async function fixture() {
  await mkdir(resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(join(resolve("tmp"), "android-prepare-"));
  await Promise.all(["scripts", "dist", "android"].map(name => mkdir(join(directory, name))));
  for (const filename of ["scripts/prepare-mobile.js", "scripts/android-dev.js", "capacitor.config.ts"]) await copyFile(filename, join(directory, filename));
  await writeFile(join(directory, "dist/index.html"), "fixture");
  await writeFile(join(directory, "scripts/prepare-android.js"), 'export async function applyAndroidPlayer() { await Bun.write("overlay-applied", "yes"); }');
  await writeFile(join(directory, "record-commands.js"), `
    import { readFileSync, writeFileSync, existsSync } from "node:fs";
    Bun.spawn = (args, options) => {
      const calls = existsSync("calls.json") ? JSON.parse(readFileSync("calls.json", "utf8")) : [];
      calls.push({ args, url: options.env.SHRAVANAM_ANDROID_DEV_URL ?? null });
      writeFileSync("calls.json", JSON.stringify(calls));
      return { exited: Promise.resolve(0) };
    };
  `);
  return directory;
}

async function run(directory, args, developmentUrl) {
  const env = { ...process.env };
  delete env.SHRAVANAM_ANDROID_DEV_URL;
  if (developmentUrl !== undefined) env.SHRAVANAM_ANDROID_DEV_URL = developmentUrl;
  const child = Bun.spawn([process.execPath, ...args], { cwd: directory, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

function prepareArgs(...options) {
  return ["--preload", "./record-commands.js", "scripts/prepare-mobile.js", "android", ...options];
}

test("normal Android preparation removes a stale dev URL before sync and applies the native overlay", async () => {
  const directory = await fixture();
  const result = await run(directory, prepareArgs(), "invalid inherited value");
  expect(result.code).toBe(0);
  const calls = JSON.parse(await readFile(join(directory, "calls.json"), "utf8"));
  expect(calls).toHaveLength(1);
  expect(calls[0].args.slice(-3)).toEqual(["cap", "sync", "android"]);
  expect(calls[0].url).toBeNull();
  expect(await readFile(join(directory, "overlay-applied"), "utf8")).toBe("yes");
});

test("Android dev preparation passes the explicit URL to Capacitor, ahead of an environment override", async () => {
  const directory = await fixture();
  const result = await run(directory, prepareArgs("--dev", "--url", "http://192.168.1.20:3001/"), "http://10.1.2.3:3001");
  expect(result.code).toBe(0);
  const calls = JSON.parse(await readFile(join(directory, "calls.json"), "utf8"));
  expect(calls[0].url).toBe("http://192.168.1.20:3001");
  expect(result.stdout).toContain("Android development URL: http://192.168.1.20:3001");
});

test("Android dev preparation accepts a local environment URL", async () => {
  const directory = await fixture();
  const result = await run(directory, prepareArgs("--dev"), "http://10.1.2.3:3001");
  expect(result.code).toBe(0);
  expect(JSON.parse(await readFile(join(directory, "calls.json"), "utf8"))[0].url).toBe("http://10.1.2.3:3001");
});

test("invalid dev URLs and preparation options fail before invoking Capacitor", async () => {
  for (const options of [["--dev", "--url", "https://example.com"], ["--url", "http://192.168.1.20:3001"], ["--dev", "--dev"], ["--dev", "--url"]]) {
    const directory = await fixture();
    const result = await run(directory, prepareArgs(...options));
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Cannot use");
    expect(await Bun.file(join(directory, "calls.json")).exists()).toBe(false);
    expect(await Bun.file(join(directory, "overlay-applied")).exists()).toBe(false);
  }
});

test("Capacitor config enables remote HTTP only with a validated dev URL", async () => {
  const directory = await fixture();
  const args = ["-e", 'console.log(JSON.stringify((await import("./capacitor.config.ts")).default))'];
  const bundled = await run(directory, args);
  expect(bundled.code).toBe(0);
  expect(JSON.parse(bundled.stdout).server).toBeUndefined();
  const development = await run(directory, args, "http://192.168.1.20:3001/");
  expect(development.code).toBe(0);
  expect(JSON.parse(development.stdout).server).toEqual({ url: "http://192.168.1.20:3001", cleartext: true });
  const invalid = await run(directory, args, "http://example.com:3001");
  expect(invalid.code).not.toBe(0);
  expect(invalid.stderr).toContain("Cannot use Android development URL");
});

test("standard Android preparation includes runtime server settings and the debug-only HTTP overlay", async () => {
  const directory = await fixture();
  await mkdir(join(directory, "src"));
  await mkdir(join(directory, "native"));
  await cp("native/android", join(directory, "native/android"), { recursive: true });
  await copyFile("src/playback.ts", join(directory, "src/playback.ts"));
  await copyFile("scripts/prepare-android.js", join(directory, "scripts/prepare-android.js"));
  await writeFile(join(directory, "android/settings.gradle"), "// fixture settings\n");
  await mkdir(join(directory, "android/app"));
  await writeFile(join(directory, "android/app/build.gradle"), "// fixture app\n");
  const result = await run(directory, prepareArgs());
  expect(result.code).toBe(0);
  const modulePath = join(directory, "android/shravanam-player");
  const debugManifest = await readFile(join(modulePath, "src/debug/AndroidManifest.xml"), "utf8");
  expect(debugManifest).toContain('android:usesCleartextTraffic="true"');
  const mainManifest = await readFile(join(modulePath, "src/main/AndroidManifest.xml"), "utf8");
  expect(mainManifest).not.toContain("usesCleartextTraffic");
  expect(mainManifest).toContain('android:extractNativeLibs="true"');
  expect(mainManifest).toContain('android:name="org.karatala.shravanam.player.NativeVideoActivity" android:exported="false"');
  expect(mainManifest).toContain('android:name="org.karatala.shravanam.player.SourceBrowserActivity" android:exported="false"');
  expect(mainManifest).toContain('android:name="org.karatala.shravanam.player.DownloadService" android:exported="false" android:foregroundServiceType="dataSync"');
  expect(mainManifest).toContain('android.permission.FOREGROUND_SERVICE_DATA_SYNC');
  expect(mainManifest).toContain('android.permission.POST_NOTIFICATIONS');
  expect(mainManifest).toContain('android:name="org.karatala.shravanam.player.ResumeMediaButtonReceiver" android:exported="true"');
  expect(mainManifest).toContain('android:name="android.intent.action.MEDIA_BUTTON"');
  expect(await readFile(join(modulePath, "src/main/res/layout/shravanam_video.xml"), "utf8")).toContain('app:surface_type="texture_view"');
  expect(await readFile(join(directory, "android/app/build.gradle"), "utf8")).toContain("useLegacyPackaging = true");
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/YouTubeResolver.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/DevelopmentServer.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/test/java/org/karatala/shravanam/player/DevelopmentServerUrlTest.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/test/java/org/karatala/shravanam/player/SystemControlsTest.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/test/java/org/karatala/shravanam/player/PlaybackResumeTest.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/test/java/org/karatala/shravanam/player/DiagnosticLogTest.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/PlaybackDiagnostics.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/DiagnosticLog.java")).exists()).toBe(true);
  for (const name of ["DownloadService", "OfflineDownloads", "DownloadProtocol"]) expect(await Bun.file(join(modulePath, `src/main/java/org/karatala/shravanam/player/${name}.java`)).exists()).toBe(true);
  for (const name of ["OfflineDownloadsTest", "DownloadProtocolTest"]) expect(await Bun.file(join(modulePath, `src/test/java/org/karatala/shravanam/player/${name}.java`)).exists()).toBe(true);
  expect(await readFile(join(modulePath, "build.gradle"), "utf8")).toContain("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1");
  expect(await readFile(join(modulePath, "build.gradle"), "utf8")).toContain("androidx.media3:media3-inspector:1.11.1");
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/ResumeMediaButtonReceiver.java")).exists()).toBe(true);
  expect(await Bun.file(join(modulePath, "src/main/java/org/karatala/shravanam/player/SavedPlayback.java")).exists()).toBe(true);
  expect(await readFile(join(modulePath, "src/main/res/values/strings.xml"), "utf8")).toContain('name="shravanam_playback_channel"');
  expect(await readFile(join(modulePath, "src/main/res/values-ru/strings.xml"), "utf8")).toContain('name="shravanam_playback_channel"');
  expect(await readFile(join(modulePath, "src/main/res/values/strings.xml"), "utf8")).toContain('name="shravanam_download_channel"');
  expect(await readFile(join(modulePath, "src/main/res/values-ru/strings.xml"), "utf8")).toContain('name="shravanam_download_channel"');
  expect(await readFile(join(directory, "android/app/src/main/java/org/karatala/shravanam/MainActivity.java"), "utf8")).toContain("DevelopmentServer.configuration(this)");
});
