import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function youtubeSource(input) {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error();
    const parts = url.pathname.split("/").filter(Boolean);
    let videoId;
    if (url.hostname === "youtu.be" && parts.length === 1) videoId = parts[0];
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (parts.length === 2 && ["shorts", "live", "embed"].includes(parts[0])) videoId = parts[1];
    }
    if (!/^[\w-]{11}$/.test(videoId ?? "")) throw new Error();
    const time = url.searchParams.get("t") ?? url.searchParams.get("start") ?? new URLSearchParams(url.hash.slice(1)).get("t");
    let start;
    if (time !== null) {
      if (/^\d+$/.test(time)) start = Number(time);
      else {
        const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
        if (!match || !time) throw new Error();
        start = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
      }
      if (!Number.isSafeInteger(start) || start < 0) throw new Error();
    }
    return { id: createHash("sha256").update(`youtube\0${videoId}`).digest("hex"), videoId, url: `https://www.youtube.com/watch?v=${videoId}`, start };
  } catch { throw Object.assign(new Error("Invalid YouTube link"), { code: "youtube-link", mediaName: String(input).slice(0, 200) }); }
}

export async function findDownloader() {
  const binary = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const candidates = [];
  if (process.platform === "darwin") candidates.push("/Applications/IINA.app/Contents/MacOS/youtube-dl", join(homedir(), "Applications/IINA.app/Contents/MacOS/youtube-dl"));
  candidates.push(join(dirname(process.execPath), binary), Bun.which(binary));
  if (process.platform === "darwin") candidates.push("/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp", "/opt/local/bin/yt-dlp");
  for (const candidate of candidates.filter(Boolean)) {
    try { await access(candidate, constants.X_OK); return candidate; }
    catch { /* Try the next installed downloader. */ }
  }
  throw Object.assign(new Error("yt-dlp was not found"), { code: "missing-downloader" });
}

function streamInfo(format, fallbackHeaders) {
  const url = new URL(format.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.endsWith(".googlevideo.com") || format.protocol !== "https") throw new Error("Unsupported stream address");
  const headers = Object.entries(format.http_headers ?? fallbackHeaders ?? {}).map(([name, value]) => {
    if (!/^[A-Za-z0-9-]+$/.test(name) || typeof value !== "string" || /[\r\n\0]/.test(value)) throw new Error("Invalid stream headers");
    return `${name}: ${value}`;
  });
  return { url: url.href, headers };
}

export function downloaderArguments() {
  const args = ["--ignore-config", "--no-plugin-dirs", "--no-remote-components", "--no-cache-dir", "--no-playlist", "--socket-timeout", "15", "--retries", "1", "--extractor-retries", "1"];
  // Enable installed runtimes only. Never download a runtime or helper code.
  for (const runtime of ["node", "bun"]) {
    const executablePath = Bun.which(runtime);
    if (executablePath) args.push("--js-runtimes", `${runtime}:${executablePath}`);
  }
  return args;
}

export function resolveYouTube(source, audioOnly, signal) { return resolveStreams(source, audioOnly ? "audio" : "watch", signal); }

export function resolveYouTubeVideo(source, signal) { return resolveStreams(source, "video", signal); }

async function resolveStreams(source, mode, signal) {
  const audioOnly = mode === "audio";
  const videoOnly = mode === "video";
  const executable = await findDownloader();
  // Metadata can contain streams that already return 403. Check selected formats before handing them to mpv.
  const format = audioOnly ? "bestaudio[protocol=https]/best[protocol=https]" : videoOnly ? "bestvideo[protocol=https]/best[protocol=https]" : "bestvideo[protocol=https]+bestaudio[protocol=https]/best[protocol=https]";
  const args = [...downloaderArguments(), "--check-formats", "--skip-download", "--dump-single-json", "-f", format, "-S", "res:1080,vcodec:h264", "--", source.url];
  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(executable, args, { signal, timeout: 60000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, output) => {
        // Do not log signed stream URLs or the full metadata response.
        if (error) reject(new Error("YouTube extraction failed")); else resolve(output);
      });
    });
    const info = JSON.parse(stdout);
    if (info.id !== source.videoId || info._type === "playlist") throw new Error("Unexpected source");
    if (info.is_live || info.live_status === "is_upcoming") throw Object.assign(new Error("Live streams are not supported yet"), { code: "youtube-live" });
    const formats = info.requested_formats ?? [info];
    const primary = audioOnly ? formats.find(format => format.acodec && format.acodec !== "none") : formats.find(format => format.vcodec && format.vcodec !== "none");
    if (!primary) throw new Error("No usable media stream");
    const audio = !audioOnly && !videoOnly && primary.acodec === "none" ? formats.find(format => format.acodec && format.acodec !== "none") : null;
    if (!audioOnly && !videoOnly && primary.acodec === "none" && !audio) throw new Error("No audio stream");
    return { ...streamInfo(primary, info.http_headers), hasVideo: Boolean(primary.vcodec && primary.vcodec !== "none"), audio: audio ? streamInfo(audio, info.http_headers) : null, title: typeof info.title === "string" ? info.title.slice(0, 300) : source.videoId, chapters: Array.isArray(info.chapters) ? info.chapters.slice(0, 2000) : [], description: typeof info.description === "string" ? info.description.slice(0, 1000000) : "" };
  } catch (error) {
    throw Object.assign(new Error("Cannot open YouTube media"), { code: error.code === "youtube-live" ? error.code : "youtube", mediaName: source.url });
  }
}
