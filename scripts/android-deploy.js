import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const android = join(root, "android");
const windows = process.platform === "win32";
const usage = "bun run android:deploy [--alongside]\nSet ANDROID_SERIAL to select a device when more than one is connected.";

function tools(env) {
  const home = env.USERPROFILE || env.HOME;
  const defaultSdk = windows ? env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Android", "Sdk")
    : home && join(home, process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk");
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (defaultSdk && existsSync(defaultSdk) ? defaultSdk : undefined);
  const sdkAdb = sdk && join(sdk, "platform-tools", windows ? "adb.exe" : "adb");
  const adb = sdkAdb && existsSync(sdkAdb) ? sdkAdb : Bun.which("adb");
  if (!adb) throw new Error("ADB was not found. Install Android SDK Platform-Tools in Android Studio, then set ANDROID_HOME to the SDK folder or put adb on PATH.");
  if (sdk && !env.ANDROID_HOME) env.ANDROID_HOME = sdk;

  const studioJdk = windows ? env.ProgramFiles && join(env.ProgramFiles, "Android", "Android Studio", "jbr")
    : process.platform === "darwin" ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home" : "/opt/android-studio/jbr";
  const javac = windows ? "javac.exe" : "javac";
  if (!env.JAVA_HOME && studioJdk && existsSync(join(studioJdk, "bin", javac))) env.JAVA_HOME = studioJdk;
  if (env.JAVA_HOME ? !existsSync(join(env.JAVA_HOME, "bin", javac)) : !Bun.which("javac")) {
    throw new Error("A Java JDK was not found. Set JAVA_HOME to a JDK 21 folder, for example the jbr folder in an Android Studio installation with Java 21.");
  }
  return adb;
}

async function deploy(alongside) {
  const env = { ...process.env };
  const adb = tools(env);

  async function run(args, { cwd = root, capture = false } = {}) {
    const child = Bun.spawn(args, { cwd, env, stdin: "inherit", stdout: capture ? "pipe" : "inherit", stderr: capture ? "pipe" : "inherit" });
    if (!capture) return { code: await child.exited };
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  }

  const devices = await run([adb, "devices"], { capture: true });
  if (devices.code !== 0) throw new Error(`Cannot list ADB devices. ${devices.stderr.trim()}`);
  const ready = devices.stdout.split(/\r?\n/).map(line => /^(\S+)\s+device\s*$/.exec(line)?.[1]).filter(Boolean);
  const selected = env.ANDROID_SERIAL;
  if (selected && !ready.includes(selected)) throw new Error(`ADB device '${selected}' is not ready. Check adb devices and unlock or reconnect the phone.`);
  if (!selected && ready.length === 0) throw new Error("No authorized Android device found. Connect by USB or Wireless debugging, accept the prompt on the phone, and check adb devices.");
  if (!selected && ready.length > 1) throw new Error(`Multiple Android devices are ready (${ready.join(", ")}). Set ANDROID_SERIAL to one listed serial and run again.`);
  const serial = selected || ready[0];
  const app = alongside ? "Shravanam Dev" : "Shravanam";
  console.log(`Building ${app} for ${serial}.`);

  const prepare = await run([process.execPath, "run", "prepare:android"]);
  if (prepare.code !== 0) throw new Error("Android preparation failed. Fix the error above and run the command again.");
  const gradle = windows ? ["cmd.exe", "/d", "/c", "gradlew.bat"] : ["sh", "./gradlew"];
  const build = await run([...gradle, ":app:assembleDebug", `-PshravanamAlongside=${alongside}`], { cwd: android });
  if (build.code !== 0) throw new Error("Android debug build failed. Fix the Gradle error above and run the command again.");
  const apk = join(android, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!await Bun.file(apk).exists()) throw new Error(`APK not found at '${apk}'. Check the Gradle build output above.`);

  const install = await run([adb, "-s", serial, "install", "-r", apk], { capture: true });
  process.stdout.write(install.stdout);
  process.stderr.write(install.stderr);
  if (install.code !== 0) {
    if (`${install.stdout}\n${install.stderr}`.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
      const recovery = alongside ? "Use the same debug keystore as the installed Shravanam Dev." : "Use the original signing key, or run bun run android:deploy --alongside to keep the installed app and its data.";
      throw new Error(`Android rejected the update because the APK signing keys differ. ${recovery}`);
    }
    throw new Error("ADB could not install the APK. Check the error above and any confirmation prompt on the phone.");
  }
  console.log(`${app} is ready on ${serial}.`);
}

const args = Bun.argv.slice(2);
try {
  if (args.length === 1 && args[0] === "--help") console.log(usage);
  else if (args.length === 0 || (args.length === 1 && args[0] === "--alongside")) await deploy(args.length === 1);
  else throw new Error(`Unknown Android deploy arguments. Use ${usage}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
