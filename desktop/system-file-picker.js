import { execFile } from "node:child_process";

// Same OS-dialog pattern as Rachana's project-folder-picker, without a WebView.
function runPicker(command, args, signal) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024, signal }, (error, stdout, stderr) => {
      if (!error) { resolve(stdout.replace(/\r?\n$/, "")); return; }
      if (["zenity", "kdialog"].includes(command) && [1, 130].includes(error.code) || command === "osascript" && stderr.includes("(-128)")) resolve("");
      else reject(error);
    });
  });
}

export async function chooseSystemMedia(signal) {
  if (process.platform === "darwin") {
    const result = await runPicker("osascript", ["-l", "JavaScript", "-e", 'const app = Application.currentApplication(); app.includeStandardAdditions = true; JSON.stringify(app.chooseFile({ withPrompt: "Open audio or video / Открыть аудио или видео", multipleSelectionsAllowed: true }).map(path => path.toString()));'], signal);
    return result ? JSON.parse(result) : [];
  }
  if (process.platform === "win32") {
    const result = await runPicker("powershell.exe", ["-NoProfile", "-STA", "-Command", '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; $mediaDialog = New-Object System.Windows.Forms.OpenFileDialog; $mediaDialog.Title = "Open audio or video"; $mediaDialog.Multiselect = $true; if ($mediaDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ConvertTo-Json -Compress -InputObject @($mediaDialog.FileNames) }; $mediaDialog.Dispose()'], signal);
    return result ? JSON.parse(result.replace(/^\uFEFF/, "")) : [];
  }
  const separator = "\u001f";
  let result;
  try { result = await runPicker("zenity", ["--file-selection", "--multiple", `--separator=${separator}`, "--title=Open audio or video"], signal); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    result = await runPicker("kdialog", ["--getopenfilename", ".", "", "--multiple", "--separate-output", "--title", "Open audio or video"], signal);
    return result ? result.split("\n") : [];
  }
  return result ? result.split(separator) : [];
}
