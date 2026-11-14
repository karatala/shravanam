import { copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mediaExtensions } from "../src/playback.ts";

export const macDocumentTypes = `<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Audio and video</string><key>CFBundleTypeRole</key><string>Viewer</string><key>LSHandlerRank</key><string>Alternate</string><key>CFBundleTypeExtensions</key><array>${mediaExtensions.map(extension => `<string>${extension}</string>`).join("")}</array></dict></array>`;

export async function writeDesktopAssociations(output) {
  if (process.platform === "win32") {
    const extensions = mediaExtensions.map(extension => `'.${extension}'`).join(", ");
    await writeFile(resolve(output, "Register file types.ps1"), `$ErrorActionPreference = 'Stop'
$exePath = Join-Path $PSScriptRoot 'Shravanam.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw 'Keep this script next to Shravanam.exe and run it again.' }
$classRoot = 'HKCU:\\Software\\Classes'
$progId = 'Shravanam.Media'
New-Item "$classRoot\\$progId\\shell\\open\\command" -Force | Out-Null
Set-Item "$classRoot\\$progId" -Value 'Shravanam media'
Set-Item "$classRoot\\$progId\\shell\\open\\command" -Value ('"' + $exePath + '" "%1"')
foreach ($extension in @(${extensions})) {
  New-Item "$classRoot\\$extension\\OpenWithProgids" -Force | Out-Null
  New-ItemProperty "$classRoot\\$extension\\OpenWithProgids" -Name $progId -PropertyType String -Value '' -Force | Out-Null
}
Write-Output 'Shravanam is available in Open with. Keep this folder at its current location. Choose the default app in Windows settings.'
`);
  } else if (process.platform === "linux") {
    const mimeTypes = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/x-m4b", "audio/aac", "audio/flac", "audio/x-flac", "audio/ogg", "audio/opus", "audio/x-wav", "audio/wav", "video/mp4", "video/x-m4v", "video/webm", "video/x-matroska", "video/quicktime"];
    await writeFile(resolve(output, "file-types.json"), JSON.stringify(mimeTypes));
    await copyFile("native/linux/register-file-types.py", resolve(output, "register-file-types.py"));
  }
}
