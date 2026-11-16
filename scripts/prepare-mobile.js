import { existsSync } from "node:fs";
import { applyAndroidPlayer } from "./prepare-android.js";
import { resolveAndroidDevUrl } from "./android-dev.js";

const platform = Bun.argv[2];
if (platform !== "android" && platform !== "ios") throw new Error(`Cannot prepare mobile target '${platform ?? ""}'. Use android or ios, for example: bun run prepare:android.`);
const options = Bun.argv.slice(3);
let development = false;
let explicitUrl;
const usage = "Use bun run prepare:android:dev [--url http://192.168.1.20:3001], or prepare:android / prepare:ios without options.";
for (let idx = 0; idx < options.length; idx++) {
  const option = options[idx];
  if (platform === "android" && option === "--dev" && !development) development = true;
  else if (platform === "android" && option === "--url" && explicitUrl === undefined && options[idx + 1] !== undefined && !options[idx + 1].startsWith("--")) explicitUrl = options[++idx];
  else throw new Error(`Cannot use mobile preparation option '${option}'. ${usage}`);
}
if (explicitUrl !== undefined && !development) throw new Error(`Cannot use --url without --dev. ${usage}`);
const developmentUrl = development ? resolveAndroidDevUrl(explicitUrl ?? process.env.SHRAVANAM_ANDROID_DEV_URL) : undefined;
const childEnv = { ...process.env };
delete childEnv.SHRAVANAM_ANDROID_DEV_URL;
if (developmentUrl) childEnv.SHRAVANAM_ANDROID_DEV_URL = developmentUrl;
if (platform === "ios" && process.platform !== "darwin") throw new Error("Cannot prepare iOS on this system. Use macOS with Xcode and run bun run prepare:ios.");
if (!existsSync("dist/index.html")) throw new Error("Cannot find the web app. Run bun run build, then prepare the mobile app again.");
async function run(args) {
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit", env: childEnv });
  if (await child.exited !== 0) throw new Error(`Cannot prepare ${platform}. Fix the errors above and run bun run prepare:${platform}${development ? ":dev" : ""} again.`);
}
if (!existsSync(platform)) await run([process.execPath, "x", "--no-install", "cap", "add", platform]);
await run([process.execPath, "x", "--no-install", "cap", "sync", platform]);
if (platform === "android") await applyAndroidPlayer();
if (developmentUrl) console.log(`Android development URL: ${developmentUrl}. Start bun run dev:android and keep the phone on the same local network.`);
console.log(`Mobile project ready. Run bun run open:${platform} to open it in the native IDE.`);
