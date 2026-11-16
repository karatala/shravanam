import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
