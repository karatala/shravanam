import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manifest = Bun.file("dist/asset-list.json");
if (!await manifest.exists()) throw new Error("Cannot find the web assets. Run bun run build, then bun run build:desktop.");
const suffix = process.platform === "win32" ? `win32-${process.arch}-msvc` : process.platform === "linux" ? `linux-${process.arch}-gnu` : `darwin-${process.arch}`;
const addon = require.resolve(`@webviewjs/webview-${suffix}`);
const imports = [`import addon from ${JSON.stringify(addon)} with { type: "file" };`];
const entries = [];
const files = await manifest.json();
for (const [idx, filename] of files.entries()) {
  imports.push(`import asset${idx} from ${JSON.stringify(resolve("dist", filename))} with { type: "file" };`);
  entries.push(`${JSON.stringify(`/${filename}`)}: asset${idx}`);
}
const generated = resolve("tmp/native-desktop/entry.js");
await mkdir(dirname(generated), { recursive: true });
await writeFile(generated, `${imports.join("\n")}\nprocess.env.NAPI_RS_NATIVE_LIBRARY_PATH = addon;\nconst { runDesktop } = await import(${JSON.stringify(resolve("desktop/main.js"))});\nawait runDesktop({${entries.join(",")}});\n`);
const output = resolve("release", `desktop-${process.platform}-${process.arch}`);
const executable = resolve(output, process.platform === "darwin" ? "Shravanam.app/Contents/MacOS/Shravanam" : process.platform === "win32" ? "Shravanam.exe" : "shravanam");
await mkdir(dirname(executable), { recursive: true });
const child = Bun.spawn([process.execPath, "build", "--compile", generated, "--outfile", executable, ...(process.platform === "win32" ? ["--windows-hide-console"] : [])], { stdout: "inherit", stderr: "inherit" });
if (await child.exited !== 0) throw new Error("Cannot build the desktop app. Fix the reported errors and run bun run build:desktop again.");
if (process.platform === "darwin") {
  const { version } = await Bun.file("package.json").json();
  await writeFile(resolve(output, "Shravanam.app/Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Shravanam</string><key>CFBundleIdentifier</key><string>org.karatala.shravanam</string><key>CFBundleName</key><string>Shravanam</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
}
console.log(`Desktop output: ${output}`);
