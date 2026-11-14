import { existsSync } from "node:fs";

const platform = Bun.argv[2];
if (platform !== "android" && platform !== "ios") throw new Error(`Cannot prepare mobile target '${platform ?? ""}'. Use android or ios, for example: bun run prepare:android.`);
if (platform === "ios" && process.platform !== "darwin") throw new Error("Cannot prepare iOS on this system. Use macOS with Xcode and run bun run prepare:ios.");
if (!existsSync("dist/index.html")) throw new Error("Cannot find the web app. Run bun run build, then prepare the mobile app again.");
async function run(args) {
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(`Cannot prepare ${platform}. Fix the errors above and run bun run prepare:${platform} again.`);
}
if (!existsSync(platform)) await run([process.execPath, "x", "--no-install", "cap", "add", platform]);
await run([process.execPath, "x", "--no-install", "cap", "sync", platform]);
console.log(`Mobile project ready. Run bun run open:${platform} to open it in the native IDE.`);
