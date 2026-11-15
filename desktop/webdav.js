import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonical, MAX_BYTES } from "../src/data/model.ts";
import { decodeArchive, encodeArchive, mergeLibraries } from "../src/data/archive.ts";

const message = (english, russian) => new Error(`${english} / ${russian}`);
const failure = () => message("Cannot synchronize with WebDAV. Check the address, login, network, and folder permissions, then retry.", "Не удалось выполнить синхронизацию WebDAV. Проверьте адрес, логин, сеть и права на папку, затем повторите попытку.");
function destination(value) {
  let url;
  try { url = new URL(value); } catch { throw failure(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw message("Use an HTTPS WebDAV folder address without a password or query, for example https://cloud.example.com/dav/books/.", "Укажите HTTPS-адрес папки WebDAV без пароля и параметров, например https://cloud.example.com/dav/books/.");
  url.pathname = url.pathname.replace(/\/*$/, "/") + "shravanam-v1/";
  return url;
}
async function boundedText(response, maximum = MAX_BYTES) {
  if (Number(response.headers.get("content-length")) > maximum) throw failure();
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > maximum) throw failure();
      chunks.push(result.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}
function filesFromListing(xml, base) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/^\s*(?:<\?xml[^?]*\?>\s*)?<((?:[\w.-]+:)?multistatus)\b[^>]*(?:\/\s*>|>[\s\S]*<\/\1\s*>)\s*$/i.test(xml)) throw failure();
  const files = new Set();
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href\s*>/gi)) {
    const href = match[1].trim().replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity]);
    let url;
    try { url = new URL(href, base); } catch { throw failure(); }
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
    const name = url.pathname.slice(base.pathname.length);
    if (/^d[a-f0-9]{32}\.json$/.test(name) && !url.search && !url.hash) files.add(name);
  }
  if (files.size > 128) throw message("This folder has more than 128 devices. Use a separate WebDAV folder.", "В папке больше 128 устройств. Выберите отдельную папку WebDAV.");
  return [...files].sort();
}

export async function createWebDav(profile, library, fetcher = fetch) {
  const settingsPath = join(profile, "webdav.json");
  let saved = { url: "", username: "", lastSync: null };
  try {
    const value = JSON.parse(await readFile(settingsPath, "utf8"));
    if (typeof value.url !== "string" || typeof value.username !== "string") throw failure();
    if (value.url) destination(value.url);
    saved = { url: value.url, username: value.username, lastSync: Number.isSafeInteger(value.lastSync) ? value.lastSync : null };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  let password = null;
  let preview = null;
  let busy = false;
  const state = () => ({ ...saved, connected: password !== null, busy, preview: preview ? { added: preview.added, conflicts: preview.conflicts, duplicates: preview.duplicates, devices: preview.devices, token: preview.token } : null });
  async function persist(value = saved) {
    try {
      await writeFile(`${settingsPath}.pending`, JSON.stringify(value), { mode: 0o600 });
      await rename(`${settingsPath}.pending`, settingsPath);
    } catch { throw message("Cannot save WebDAV connection settings. Check free disk space and write permission for the application data folder, then retry.", "Не удалось сохранить настройки WebDAV. Проверьте свободное место и права записи в папку данных приложения, затем повторите попытку."); }
  }
  async function request(url, options = {}) {
    let response;
    try { response = await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000), headers: { ...options.headers, Authorization: `Basic ${Buffer.from(`${saved.username}:${password}`).toString("base64")}` } }); }
    catch { throw failure(); }
    if (response.status === 401 || response.status === 403) throw message("WebDAV denied access. Check the login, app password, and read/write permission for this folder.", "WebDAV не разрешил доступ. Проверьте логин, пароль приложения и права чтения и записи в эту папку.");
    return response;
  }
  return {
    state,
    async configure({ url, username, password: nextPassword }) {
      if (busy) throw message("Wait for WebDAV synchronization to finish, then change the connection.", "Дождитесь завершения синхронизации WebDAV, затем измените подключение.");
      destination(url);
      if (typeof username !== "string" || username.includes(":") || username.length > 1024 || typeof nextPassword !== "string" || nextPassword.length > 4096) throw failure();
      const next = { url, username, lastSync: saved.url === url && saved.username === username ? saved.lastSync : null };
      busy = true;
      try {
        await persist(next);
        saved = next;
        password = nextPassword;
        preview = null;
      } finally { busy = false; }
      return state();
    },
    disconnect() {
      if (busy) throw message("Wait for WebDAV synchronization to finish, then disconnect.", "Дождитесь завершения синхронизации WebDAV, затем отключитесь.");
      password = null;
      preview = null;
      return state();
    },
    async inspect() {
      if (busy || password === null) throw message("Enter the WebDAV password and connect before synchronization.", "Перед синхронизацией введите пароль WebDAV и подключитесь.");
      busy = true;
      preview = null;
      try {
        const base = destination(saved.url);
        const created = await request(base, { method: "MKCOL" });
        if (![201, 405].includes(created.status)) throw failure();
        const listing = await request(base, { method: "PROPFIND", headers: { Depth: "1", "Content-Type": "application/xml" }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>' });
        if (listing.status !== 207) throw failure();
        const names = filesFromListing(await boundedText(listing, 1024 * 1024), base);
        const local = library.snapshot();
        let incoming = { schemaVersion: 1, records: [] };
        let ownEtag = null;
        const ownName = `${library.deviceId()}.json`;
        for (const name of names) {
          const response = await request(new URL(name, base));
          if (!response.ok) throw failure();
          const archive = await decodeArchive(await boundedText(response));
          incoming = mergeLibraries(incoming, archive.payload).library;
          if (name === ownName) {
            ownEtag = response.headers.get("etag");
            if (!ownEtag || ownEtag.length > 1024 || !/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(ownEtag)) throw message("This WebDAV server does not provide a strong file version. Use a server with ETag and conditional-write support.", "WebDAV-сервер не сообщает надёжную версию файла. Используйте сервер с поддержкой ETag и условной записи.");
          }
        }
        preview = { ...mergeLibraries(local, incoming), incoming, base: base.href, ownName, ownEtag, devices: names.length, localSignature: canonical(local) };
        preview.token = createHash("sha256").update(canonical({ incoming, base: base.href, ownEtag })).digest("hex");
      } finally { busy = false; }
      return state();
    },
    async apply(preferIncoming = false) {
      if (busy || !preview || password === null) throw message("Preview WebDAV data before applying synchronization.", "Перед синхронизацией откройте предпросмотр данных WebDAV.");
      busy = true;
      try {
        const selected = preview;
        const merged = mergeLibraries(library.snapshot(), selected.incoming, preferIncoming);
        const response = await request(new URL(selected.ownName, selected.base), { method: "PUT", headers: { "Content-Type": "application/json", ...(selected.ownEtag ? { "If-Match": selected.ownEtag } : { "If-None-Match": "*" }) }, body: await encodeArchive(merged.library) });
        if (response.status === 412) { preview = null; throw message("WebDAV data changed during synchronization. Preview and synchronize again. Local data is unchanged.", "Данные WebDAV изменились во время синхронизации. Откройте предпросмотр и повторите синхронизацию. Локальные данные не изменены."); }
        if (!response.ok) throw failure();
        await library.importLibrary(selected.incoming, preferIncoming);
        const next = { ...saved, lastSync: Date.now() };
        preview = null;
        await persist(next);
        saved = next;
      } finally { busy = false; }
      return state();
    },
  };
}
