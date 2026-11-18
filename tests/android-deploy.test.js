import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

async function deploy({ args = [], devices = "phone\tdevice", serial = "", failure = "" } = {}) {
  await mkdir("tmp", { recursive: true });
  const directory = await mkdtemp(join(resolve("tmp"), "android-deploy-"));
  const sdk = join(directory, "sdk");
  const jdk = join(directory, "jdk");
  const sdkTools = join(sdk, "platform-tools");
  const jdkTools = join(jdk, "bin");
  const apkDirectory = join(directory, "android", "app", "build", "outputs", "apk", "debug");
  const suffix = process.platform === "win32" ? ".exe" : "";
  await Promise.all(["scripts", sdkTools, jdkTools, apkDirectory].map(path => mkdir(resolve(directory, path), { recursive: true })));
  await Promise.all([
    copyFile("scripts/android-deploy.js", join(directory, "scripts", "android-deploy.js")),
    writeFile(join(sdkTools, `adb${suffix}`), "fixture"),
    writeFile(join(jdkTools, `javac${suffix}`), "fixture"),
    writeFile(join(apkDirectory, "app-debug.apk"), "fixture APK"),
    writeFile(join(directory, "calls.jsonl"), ""),
    writeFile(join(directory, "mock.js"), `
      import { appendFileSync } from "node:fs";
      Bun.spawn = (args, options) => {
        appendFileSync("calls.jsonl", JSON.stringify({ args, cwd: options.cwd }) + "\\n");
        const output = (value) => new Response(value).body;
        if (args[1] === "devices") return { exited: Promise.resolve(0), stdout: output("List of devices attached\\n" + process.env.DEPLOY_TEST_DEVICES), stderr: output("") };
        if (args[3] === "install") {
          const mismatch = process.env.DEPLOY_TEST_FAILURE === "signature";
          return { exited: Promise.resolve(mismatch ? 1 : 0), stdout: output(mismatch ? "" : "Success\\n"), stderr: output(mismatch ? "INSTALL_FAILED_UPDATE_INCOMPATIBLE\\n" : "") };
        }
        const failed = args.includes(":app:assembleDebug") && process.env.DEPLOY_TEST_FAILURE === "gradle";
        return { exited: Promise.resolve(failed ? 1 : 0) };
      };
    `),
  ]);
  const env = { ...process.env, ANDROID_HOME: sdk, JAVA_HOME: jdk, ANDROID_SERIAL: serial, DEPLOY_TEST_DEVICES: devices, DEPLOY_TEST_FAILURE: failure };
  const child = Bun.spawn([process.execPath, "--preload", "./mock.js", "scripts/android-deploy.js", ...args], { cwd: directory, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const calls = (await readFile(join(directory, "calls.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  return { code, stdout, stderr, calls, directory };
}

test("local deployment prepares and builds the current tree before updating the selected phone", async () => {
  const result = await deploy({ args: ["--alongside"], devices: "emulator-5554\tdevice\nphone\tdevice\nother\tunauthorized", serial: "phone" });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Shravanam Dev is ready on phone.");
  expect(result.calls).toHaveLength(4);
  expect(result.calls[1].args.slice(1)).toEqual(["run", "prepare:android"]);
  expect(result.calls[2].cwd).toBe(join(result.directory, "android"));
  expect(result.calls[2].args.slice(-2)).toEqual([":app:assembleDebug", "-PshravanamAlongside=true"]);
  expect(result.calls[3].args.slice(1, -1)).toEqual(["-s", "phone", "install", "-r"]);
  expect(basename(result.calls[3].args.at(-1))).toBe("app-debug.apk");
});

test("local deployment requires a ready, unambiguous ADB target before building", async () => {
  for (const options of [{ devices: "phone\tunauthorized" }, { devices: "phone\tdevice\nother\tdevice" }, { serial: "other" }]) {
    const result = await deploy(options);
    expect(result.code).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.stderr).toMatch(/No authorized Android device|Multiple Android devices|is not ready/);
  }
});

test("a failed debug build does not install an APK left by an earlier build", async () => {
  const result = await deploy({ failure: "gradle" });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Android debug build failed");
  expect(result.calls).toHaveLength(3);
});

test("a signing mismatch stops after the in-place update attempt and offers the separate app", async () => {
  const result = await deploy({ failure: "signature" });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("bun run android:deploy --alongside");
  expect(result.calls).toHaveLength(4);
  expect(result.calls[2].args.slice(-2)).toEqual([":app:assembleDebug", "-PshravanamAlongside=false"]);
  expect(result.calls[3].args.slice(1, -1)).toEqual(["-s", "phone", "install", "-r"]);
});
