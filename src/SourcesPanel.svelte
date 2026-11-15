<script lang="ts">
  import { onMount } from "svelte";
  import { sourceBridge, sourceErrorText } from "./source-client";
  import type { SourceCommand, SourceState } from "./sources";
  import { releasePointerFocus } from "./pointer-input";
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  const template = "// ==UserScript==\n// @name My site cleanup\n// @match https://www.youtube.com/*\n// @run-at document-end\n// @grant none\n// ==/UserScript==\n\n";
  let sources: SourceState = $state({ browser: { open: false, url: "", title: "" }, scripts: [], downloads: [] });
  let ready = $state(false);
  let busy = $state(false);
  let failure = $state("");
  let url = $state("");
  let audioOnly = $state(true);
  let quality = $state(720);
  let scriptName = $state("cleanup.user.js");
  let scriptSource = $state(template);
  let scriptId = $state<string | undefined>();
  let scriptInput: HTMLInputElement;
  async function action(command: SourceCommand) {
    busy = true; failure = "";
    try {
      sources = await sourceBridge()!.command(command);
      if (sources.script) { scriptId = sources.script.id; scriptSource = sources.script.source; scriptName = `${sources.script.name.replace(/\.js$/, "")}.user.js`; }
      if (command.type === "import-script") { scriptId = undefined; scriptSource = template; scriptName = "cleanup.user.js"; }
    } catch (error) { failure = sourceErrorText(error); }
    finally { busy = false; }
  }
  async function loadScript(file?: File) {
    if (!file) return;
    try {
      if (!file.name.endsWith(".js") || file.size > 128 * 1024) throw new Error("Choose a .js file under 128 KiB, for example cleanup.user.js. / Выберите файл .js размером до 128 КиБ, например cleanup.user.js.");
      scriptSource = await file.text(); scriptName = file.name; scriptId = undefined; failure = "";
    } catch (error) { failure = sourceErrorText(error); }
    finally { scriptInput.value = ""; }
  }
  onMount(() => {
    let active = true;
    let polling = false;
    const refresh = async () => {
      const bridge = sourceBridge();
      if (!bridge || polling || document.hidden) return;
      polling = true;
      try { const next = await bridge.getState(); if (active) { sources = next; ready = true; } }
      catch (error) { if (active) failure = sourceErrorText(error); }
      finally { polling = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { active = false; clearInterval(timer); };
  });
  const status = (value: string) => ({ downloading: text("Downloading", "Скачивается"), ready: text("Ready offline", "Доступно без сети"), interrupted: text("Interrupted", "Прервано"), failed: text("Failed", "Ошибка") })[value] ?? value;
</script>

<section aria-label={text("Sources and downloads", "Источники и загрузки")}>
  <h2>{text("Sources and downloads", "Источники и загрузки")}</h2>
  <button type="button" disabled={!ready || busy} onclick={() => action({ type: "open-browser" })} onpointerup={releasePointerFocus}>{text("Find on YouTube", "Найти на YouTube")}</button>
  {#if sources.browser.open}<button type="button" disabled={busy} onclick={() => action({ type: "close-browser" })} onpointerup={releasePointerFocus}>{text("Close source browser", "Закрыть браузер источников")}</button>{/if}
  <form onsubmit={event => { event.preventDefault(); void action({ type: "download", url, audioOnly, quality }); }}>
    <label class="link">YouTube<input type="url" required maxlength="2048" bind:value={url} placeholder="https://www.youtube.com/watch?v=…" /></label>
    <select aria-label={text("Download format", "Формат загрузки")} bind:value={audioOnly}><option value={true}>{text("Audio", "Аудио")}</option><option value={false}>{text("Video", "Видео")}</option></select>
    {#if !audioOnly}<select aria-label={text("Maximum video quality", "Максимальное качество видео")} bind:value={quality}>{#each [480, 720, 1080] as height}<option value={height}>{text("Up to", "До")} {height}p</option>{/each}</select>{/if}
    <button disabled={!ready || busy} onpointerup={releasePointerFocus}>{text("Download", "Скачать")}</button>
  </form>
  {#if failure}<p class="error" role="alert">{failure}</p>{/if}
  {#if sources.downloads.length}<ul>{#each sources.downloads as item (item.id)}<li>
    <span>{item.name} · {item.audioOnly ? text("Audio", "Аудио") : `≤${item.quality}p`} · {item.status === "downloading" && item.percent >= 100 ? text("Finishing", "Завершение") : status(item.status)}{item.status === "downloading" && item.percent < 100 ? ` ${Math.floor(item.percent)}%` : ""}</span>
    {#if item.status === "ready"}<button disabled={busy} onclick={() => action({ type: "open-download", id: item.id })} onpointerup={releasePointerFocus}>{text("Play offline", "Открыть без сети")}</button>
    {:else if item.status === "downloading"}<button disabled={busy} onclick={() => action({ type: "cancel-download", id: item.id })} onpointerup={releasePointerFocus}>{text("Cancel", "Отмена")}</button>
    {:else}<button disabled={busy} onclick={() => action({ type: "retry-download", id: item.id })} onpointerup={releasePointerFocus}>{text("Retry", "Повторить")}</button>{/if}
    {#if item.error}<p class="error">{sourceErrorText(new Error(item.error))}</p>{/if}
  </li>{/each}</ul>{/if}
  <details>
    <summary>{text("Site scripts", "Скрипты сайтов")}</summary>
    <p>{text("Scripts run in matching HTTPS pages. Supported: @match, @exclude-match, @run-at and @grant none. GM APIs and external @require are not supported. Saving or switching a script reloads the source page.", "Скрипты работают на подходящих HTTPS-страницах. Поддерживаются @match, @exclude-match, @run-at и @grant none. API GM и внешние @require пока не поддерживаются. Сохранение или переключение скрипта перезагружает страницу источника.")}</p>
    <div class="actions"><button type="button" disabled={busy} onclick={() => scriptInput.click()} onpointerup={releasePointerFocus}>{text("Import .user.js", "Импорт .user.js")}</button><button type="button" disabled={busy} onclick={() => { scriptId = undefined; scriptSource = template; scriptName = "cleanup.user.js"; }} onpointerup={releasePointerFocus}>{text("New script", "Новый скрипт")}</button></div>
    <input type="file" hidden accept=".js,text/javascript,application/javascript" bind:this={scriptInput} onchange={() => void loadScript(scriptInput.files?.[0])} />
    <form class="editor" onsubmit={event => { event.preventDefault(); void action({ type: "import-script", id: scriptId, name: scriptName, source: scriptSource }); }}>
      <label>{text("Filename", "Имя файла")}<input required maxlength="256" pattern=".+\.js" bind:value={scriptName} /></label>
      <textarea aria-label={text("Site JavaScript", "JavaScript для сайтов")} spellcheck="false" maxlength={128 * 1024} bind:value={scriptSource}></textarea>
      <button disabled={!ready || busy} onpointerup={releasePointerFocus}>{text("Save and enable", "Сохранить и включить")}</button>
    </form>
    <ul>{#each sources.scripts as script (script.id)}<li><label><input type="checkbox" checked={script.enabled} disabled={busy} onchange={event => action({ type: "toggle-script", id: script.id, enabled: event.currentTarget.checked })} />{script.name}</label><span class="matches">{script.matches.join(", ")}</span><button disabled={busy} onclick={() => action({ type: "read-script", id: script.id })} onpointerup={releasePointerFocus}>{text("Edit", "Изменить")}</button></li>{/each}</ul>
  </details>
</section>

<style>
  section { margin-top: 28px; padding: 16px; border-radius: 10px; background: #141414; }
  h2 { margin-top: 0; font-size: 18px; font-weight: 500; }
  form, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
  button { padding: 8px 12px; border-radius: 6px; background: #292929; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  input:not([type="checkbox"]), select, textarea { padding: 6px; background: #292929; color: #eee; border: none; border-radius: 4px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #aaa; }
  .link { flex: 1; min-width: 200px; }
  .link input { flex: 1; min-width: 0; }
  p, summary, li { font-size: 13px; line-height: 1.5; color: #bbb; }
  summary { cursor: pointer; }
  details { margin-top: 20px; }
  ul { list-style: none; padding: 0; }
  li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; overflow-wrap: anywhere; }
  .matches { color: #aaa; overflow-wrap: anywhere; }
  .editor { align-items: stretch; flex-direction: column; }
  textarea { box-sizing: border-box; width: 100%; min-height: 220px; resize: vertical; font-family: monospace; }
  .editor button { align-self: start; }
  .error { color: #ffb3a7; }
</style>
