import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { downloaderArguments, findDownloader, youtubeSource } from "./youtube.js";
import { mediaKind } from "../src/playback.ts";
import { sourceFailure } from "../src/sources.ts";

export function downloadFormat(audioOnly, quality) {
  if (typeof audioOnly !== "boolean" || ![480, 720, 1080].includes(quality)) throw new Error("Choose audio or video up to 480p, 720p or 1080p. / Выберите аудио или видео до 480p, 720p или 1080p.");
  return audioOnly ? "bestaudio[ext=m4a][protocol=https]/bestaudio[protocol=https]" : `bestvideo[height<=${quality}][protocol=https]+bestaudio[protocol=https]/best[height<=${quality}][protocol=https]`;
}

export async function checkedDownloadPath(root, filename) {
  if (typeof filename !== "string" || isAbsolute(filename) || filename.includes("\0")) throw new Error("Invalid saved download");
  const rootPath = await realpath(root);
  const path = await realpath(resolve(rootPath, filename));
  const metadata = await stat(path);
  if (!path.startsWith(rootPath + sep) || !mediaKind(path) || !metadata.isFile() || metadata.size === 0) throw new Error("Invalid saved download");
  return path;
}

async function findFfmpeg() {
  const binary = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const candidate of [join(dirname(process.execPath), binary), Bun.which(binary), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(Boolean)) {
    try { await access(candidate, constants.X_OK); return candidate; }
    catch { /* Try another installed copy. */ }
  }
  throw new Error("Video download needs ffmpeg to join audio and video. Install ffmpeg and add it to PATH, then retry, or choose audio. / Для объединения видео и звука нужен ffmpeg. Установите ffmpeg и добавьте его в PATH, затем повторите попытку или выберите аудио.");
}

export async function createDownloads(profile, media) {
  const root = join(profile, "downloads");
  const indexPath = join(profile, "downloads.json");
  let records = [];
  let active = null;
  let closing = false;
  let saving = Promise.resolve();
  try {
    const saved = JSON.parse(await readFile(indexPath, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Invalid download index");
    records = saved.map(entry => {
      const source = youtubeSource(entry.url);
      downloadFormat(entry.audioOnly, entry.quality);
      const id = createHash("sha256").update(`${source.id}\0${entry.audioOnly}\0${entry.quality}`).digest("hex");
      if (entry.id !== id || typeof entry.name !== "string" || entry.name.length > 300 || entry.filename && (isAbsolute(entry.filename) || !entry.filename.startsWith(id + "/") || entry.filename.includes(".."))) throw new Error("Invalid saved download");
      return { id, url: source.url, name: entry.name, audioOnly: entry.audioOnly, quality: entry.quality, filename: entry.filename, status: entry.status === "ready" ? "ready" : entry.status === "failed" ? "failed" : "interrupted", percent: entry.status === "ready" ? 100 : 0, error: typeof entry.error === "string" && entry.error.length <= 2048 ? entry.error : undefined };
    });
  } catch (error) { if (error.code !== "ENOENT") throw new Error("Cannot read saved downloads. Keep downloads.json for recovery and repair it while Shravanam is closed. / Не удалось прочитать список загрузок. Сохраните downloads.json для восстановления и исправьте его при закрытом Shravanam."); }
  function persist() {
    const contents = JSON.stringify(records);
    const next = saving.then(async () => {
      await mkdir(profile, { recursive: true, mode: 0o700 });
      await writeFile(`${indexPath}.pending`, contents, { mode: 0o600 });
      await rename(`${indexPath}.pending`, indexPath);
    });
    saving = next.catch(() => {});
    return next;
  }
  async function run(record, job) {
    try {
      await persist();
      const executable = await findDownloader();
      const ffmpeg = record.audioOnly ? null : await findFfmpeg();
      const directory = join(root, record.id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (job.cancelled) return;
      const args = [...downloaderArguments(), "--no-simulate", "--no-color", "--newline", "--progress", "--progress-delta", "0.5", "--progress-template", "download:PROGRESS:%(progress._percent_str)s", "--print", "before_dl:TITLE:%(title)j", "--print", "after_move:FILE:%(filepath)j", "--output", join(directory, "media.%(ext)s"), "-f", downloadFormat(record.audioOnly, record.quality)];
      if (ffmpeg) args.push("--ffmpeg-location", ffmpeg, "--merge-output-format", "mkv");
      args.push("--", record.url);
      let finalPath;
      const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
      job.child = child;
      const readLines = stream => {
        let buffer = "";
        stream.setEncoding("utf8");
        stream.on("data", chunk => {
          buffer += chunk;
          if (buffer.length > 32768) { buffer = ""; stop(job, true); return; }
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            const progress = /^PROGRESS:\s*([\d.]+)%/.exec(line);
            if (progress) record.percent = Math.min(100, Math.max(0, Number(progress[1])));
            try {
              if (line.startsWith("TITLE:")) { const title = JSON.parse(line.slice(6)); if (typeof title === "string") record.name = title.slice(0, 300); }
              if (line.startsWith("FILE:")) finalPath = JSON.parse(line.slice(5));
            } catch { /* Ignore unrelated extractor output. */ }
          }
        });
      };
      readLines(child.stdout);
      readLines(child.stderr);
      const code = await new Promise((resolveExit, reject) => { child.once("error", reject); child.once("close", resolveExit); });
      if (job.cancelled) return;
      if (code !== 0 || typeof finalPath !== "string") throw new Error("Download failed. Check the connection and free space, update yt-dlp, then retry. / Загрузка не завершена. Проверьте подключение и свободное место, обновите yt-dlp и повторите попытку.");
      const filename = relative(root, finalPath).split(sep).join("/");
      const checked = await checkedDownloadPath(root, filename);
      if (!checked.startsWith(await realpath(directory) + sep)) throw new Error("Download returned an invalid file");
      record.filename = filename;
      record.status = "ready";
      record.percent = 100;
    } catch (error) {
      if (!job.cancelled) {
        record.status = "failed";
        record.error = error.code === "missing-downloader" ? "Cannot download: yt-dlp was not found. Install yt-dlp or update IINA, then retry. / Не удалось скачать: yt-dlp не найден. Установите yt-dlp или обновите IINA и повторите попытку." : sourceFailure(error);
      }
    } finally {
      if (job.cancelled) record.status = "interrupted";
      clearTimeout(job.killTimer);
      active = null;
      try { await persist(); }
      catch { record.status = "failed"; record.error = "Cannot save the download list. Check free space and profile write access, then retry. / Не удалось сохранить список загрузок. Проверьте свободное место и доступ для записи, затем повторите попытку."; }
    }
  }
  function start(record) {
    if (closing || active) throw new Error("Another download is active. Wait or cancel it, then retry. / Другая загрузка ещё идёт. Дождитесь её завершения или отмените её, затем повторите попытку.");
    record.status = "downloading";
    record.percent = 0;
    delete record.error;
    const job = { cancelled: false, child: null, done: null, killTimer: null };
    active = job;
    job.done = run(record, job);
  }
  function cancel() {
    if (!active) return;
    const job = active;
    job.cancelled = true;
    stop(job);
    job.killTimer = setTimeout(() => stop(job, true), 3000);
    job.killTimer.unref();
  }
  function stop(job, force = false) {
    const child = job?.child;
    if (!child?.pid) return;
    if (process.platform === "win32") { execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {}); return; }
    try { process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") child.kill(force ? "SIGKILL" : "SIGTERM"); }
  }
  return {
    snapshot: () => records.map(({ filename, ...record }) => ({ ...record })),
    download(url, audioOnly, quality) {
      const source = youtubeSource(url);
      downloadFormat(audioOnly, quality);
      if (closing || active) throw new Error("Another download is active. Wait or cancel it first. / Другая загрузка ещё идёт. Дождитесь завершения или отмените её.");
      const id = createHash("sha256").update(`${source.id}\0${audioOnly}\0${quality}`).digest("hex");
      let record = records.find(entry => entry.id === id);
      if (record?.status === "ready") return;
      if (!record) { record = { id, url: source.url, name: source.videoId, audioOnly, quality }; records.unshift(record); }
      start(record);
    },
    retry(id) { const record = records.find(entry => entry.id === id); if (record && record.status !== "ready") start(record); },
    cancel(id) { if (records.find(entry => entry.id === id)?.status === "downloading") cancel(); },
    async open(id) {
      const record = records.find(entry => entry.id === id && entry.status === "ready");
      if (!record) throw new Error("This download is not ready. Complete or retry it first. / Загрузка ещё не готова. Дождитесь завершения или повторите её.");
      let path;
      try { path = await checkedDownloadPath(root, record.filename); }
      catch {
        record.status = "failed";
        record.error = "Cannot find the downloaded file. Restore it in the downloads folder, or retry the download. / Скачанный файл не найден. Верните его в папку downloads или повторите загрузку.";
        await persist();
        throw new Error(record.error);
      }
      await media.openDownloaded(path, record.url, record.audioOnly, record.name);
    },
    async close() { closing = true; const job = active; cancel(); await job?.done; await saving; },
    terminate() { stop(active, true); },
  };
}
