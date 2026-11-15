import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

function runSourceScript(script, execute) {
  if (window.top !== window.self) return;
  const escape = value => value.split("*").map(part => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
  const matches = patterns => patterns.some(pattern => {
      const parts = /^(?:https|\*):\/\/([^/]+)(\/.*)$/i.exec(pattern);
      const hostname = parts[1].toLowerCase();
      const host = hostname === "*" || (hostname.startsWith("*.") ? location.hostname === hostname.slice(2) || location.hostname.endsWith(hostname.slice(1)) : location.hostname === hostname);
      return location.protocol === "https:" && host && new RegExp("^" + escape(parts[2]) + "$").test(location.pathname + location.search);
  });
  if (!matches(script.matches) || matches(script.excludes)) return;
  const run = () => { try { execute(); } catch { console.error("Shravanam site script failed: " + script.id); } };
  const ready = () => script.runAt === "document-idle" ? setTimeout(run, 0) : run();
  if (script.runAt === "document-start") run();
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
}

export function parseSourceScript(source, filename) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 128 * 1024 || source.includes("\0")) throw new Error(`Cannot import «${filename}». Use a UTF-8 .js file under 128 KiB. / Не удалось импортировать «${filename}». Выберите UTF-8 файл .js размером до 128 КиБ.`);
  const metadata = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  const matches = [...(metadata?.[1] ?? "").matchAll(/^\s*\/\/\s*@match\s+(\S+)\s*$/gm)].map(match => match[1]);
  const excludes = [...(metadata?.[1] ?? "").matchAll(/^\s*\/\/\s*@exclude(?:-match)?\s+(\S+)\s*$/gm)].map(match => match[1]);
  if (!matches.length || matches.length + excludes.length > 32 || [...matches, ...excludes].some(pattern => !/^(?:https|\*):\/\/(?:\*|(?:\*\.)?[a-z\d](?:[a-z\d.-]*[a-z\d])?)\/[^\s]*$/i.test(pattern))) throw new Error(`Cannot import «${filename}». Use HTTPS site rules, for example // @match https://www.youtube.com/*, inside a ==UserScript== header. / Не удалось импортировать «${filename}». Укажите HTTPS-правила сайтов, например // @match https://www.youtube.com/*, в заголовке ==UserScript==.`);
  const runAt = metadata[1].match(/^\s*\/\/\s*@run-at\s+(\S+)/m)?.[1] ?? "document-end";
  if (!["document-start", "document-end", "document-idle"].includes(runAt)) throw new Error("Use @run-at document-start, document-end or document-idle. / Используйте @run-at document-start, document-end или document-idle.");
  if (/^\s*\/\/\s*@(?:require|resource)\s/m.test(metadata[1]) || [...metadata[1].matchAll(/^\s*\/\/\s*@grant\s+(\S+)/gm)].some(match => match[1] !== "none")) throw new Error(`Cannot import «${filename}»: GM APIs and remote dependencies are not supported. Use @grant none and place the required code in the .js file. / Не удалось импортировать «${filename}»: API GM и внешние зависимости пока не поддерживаются. Используйте @grant none и поместите нужный код в сам файл .js.`);
  try { new Function(source); }
  catch { throw new Error(`Cannot import «${filename}»: JavaScript syntax is invalid. Fix the .js file and import it again. / Не удалось импортировать «${filename}»: ошибка синтаксиса JavaScript. Исправьте файл .js и импортируйте снова.`); }
  const name = metadata[1].match(/^\s*\/\/\s*@name\s+(.+)$/m)?.[1]?.trim().slice(0, 160) || filename.slice(0, 160);
  const namespace = metadata[1].match(/^\s*\/\/\s*@namespace\s+(.+)$/m)?.[1]?.trim() ?? "";
  return { id: createHash("sha256").update(`${namespace}\0${name}`).digest("hex"), name, matches, excludes, runAt, source, enabled: true };
}

export async function createSourceScripts(profile) {
  const path = join(profile, "source-scripts.json");
  let scripts = [];
  try {
    const saved = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(saved) || saved.length > 32) throw new Error("Invalid script store");
    scripts = saved.map(entry => ({ ...parseSourceScript(entry.source, entry.name), enabled: entry.enabled === true }));
  } catch (error) { if (error.code !== "ENOENT") throw new Error("Cannot read saved site scripts. Keep source-scripts.json for recovery and repair it while Shravanam is closed. / Не удалось прочитать скрипты сайтов. Сохраните source-scripts.json для восстановления и исправьте его при закрытом Shravanam."); }
  async function save(next) {
    await mkdir(profile, { recursive: true, mode: 0o700 });
    try { await copyFile(path, `${path}.previous`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeFile(`${path}.pending`, JSON.stringify(next), { mode: 0o600 });
    await rename(`${path}.pending`, path);
    scripts = next;
  }
  return {
    snapshot: () => scripts.map(({ id, name, matches, enabled }) => ({ id, name, matches, enabled })),
    read(id) { const script = scripts.find(entry => entry.id === id); return script ? { id: script.id, name: script.name, source: script.source } : undefined; },
    async import(files, previousId) {
      const incoming = files.map(({ source, name }) => parseSourceScript(source, name));
      const next = scripts.filter(script => script.id !== previousId);
      for (const script of incoming) {
        const idx = next.findIndex(entry => entry.id === script.id);
        if (idx >= 0) next[idx] = script;
        else next.push(script);
      }
      if (next.length > 32) throw new Error("Cannot save more than 32 site scripts. Combine scripts before importing. / Нельзя сохранить больше 32 скриптов сайтов. Объедините скрипты перед импортом.");
      await save(next);
    },
    async toggle(id, enabled) { await save(scripts.map(script => script.id === id ? { ...script, enabled } : script)); },
    preload() {
      return scripts.filter(script => script.enabled).map(({ source, ...metadata }) => `(${runSourceScript.toString()})(${JSON.stringify(metadata)}, () => {\n${source}\n});`).join("\n");
    },
  };
}
