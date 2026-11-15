<script lang="ts">
  import { onMount } from "svelte";
  import { sourceBridge, sourceErrorText } from "./source-client";
  import type { SourceCommand } from "./sources";
  import { releasePointerFocus } from "./pointer-input";
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  let address = $state("");
  let title = $state("");
  let editing = $state(false);
  let busy = $state(false);
  let ready = $state(false);
  let failure = $state("");
  let audioOnly = $state(true);
  let quality = $state(720);
  async function action(command: SourceCommand) {
    busy = true; failure = "";
    try { await sourceBridge()!.command(command); }
    catch (error) { failure = sourceErrorText(error); }
    finally { busy = false; }
  }
  onMount(() => {
    let active = true;
    let polling = false;
    const refresh = async () => {
      const bridge = sourceBridge();
      if (!bridge || polling || document.hidden) return;
      polling = true;
      try { const state = await bridge.getState(); if (active) { ready = true; title = state.browser.title; if (!editing) address = state.browser.url; } }
      catch (error) { if (active) failure = sourceErrorText(error); }
      finally { polling = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 500);
    return () => { active = false; clearInterval(timer); };
  });
</script>

<div class="source-toolbar">
  <form onsubmit={event => { event.preventDefault(); editing = false; void action({ type: "navigate", address }); }}>
    <button type="button" disabled={!ready || busy} aria-label={text("Back", "Назад")} onclick={() => action({ type: "back" })} onpointerup={releasePointerFocus}>←</button>
    <button type="button" disabled={!ready || busy} aria-label={text("Forward", "Вперёд")} onclick={() => action({ type: "forward" })} onpointerup={releasePointerFocus}>→</button>
    <button type="button" disabled={!ready || busy} aria-label={text("Reload", "Обновить")} onclick={() => action({ type: "reload" })} onpointerup={releasePointerFocus}>↻</button>
    <input aria-label={text("HTTPS address or YouTube search", "HTTPS-адрес или поиск YouTube")} bind:value={address} onfocus={() => editing = true} onblur={() => editing = false} placeholder={text("Search YouTube or enter an HTTPS address", "Поиск YouTube или HTTPS-адрес")} />
    <button disabled={!ready || busy} onpointerup={releasePointerFocus}>{text("Go", "Перейти")}</button>
  </form>
  <div class="actions">
    <button disabled={!ready || busy} onclick={() => action({ type: "play", audioOnly: true })} onpointerup={releasePointerFocus}>{text("Listen", "Слушать")}</button>
    <button disabled={!ready || busy} onclick={() => action({ type: "play", audioOnly: false })} onpointerup={releasePointerFocus}>{text("Watch", "Смотреть")}</button>
    <select aria-label={text("Download format", "Формат загрузки")} bind:value={audioOnly}><option value={true}>{text("Audio", "Аудио")}</option><option value={false}>{text("Video", "Видео")}</option></select>
    {#if !audioOnly}<select aria-label={text("Maximum video quality", "Максимальное качество видео")} bind:value={quality}>{#each [480, 720, 1080] as height}<option value={height}>{text("Up to", "До")} {height}p</option>{/each}</select>{/if}
    <button disabled={!ready || busy} onclick={() => action({ type: "download", url: "", audioOnly, quality })} onpointerup={releasePointerFocus}>{text("Download", "Скачать")}</button>
    <span title={title}>{title}</span>
  </div>
  {#if failure}<p role="alert">{failure}</p>{:else}<p>{text("Downloads and site scripts are managed in the main Shravanam window.", "Загрузки и скрипты сайтов находятся в главном окне Shravanam.")}</p>{/if}
</div>

<style>
  .source-toolbar { box-sizing: border-box; padding: 44px 12px 8px; height: 160px; background: #141414; overflow: auto; }
  form, .actions { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  button { padding: 6px 10px; border-radius: 6px; background: #292929; white-space: nowrap; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  input, select { padding: 6px; background: #292929; color: #eee; border: none; border-radius: 4px; }
  input { flex: 1; min-width: 80px; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aaa; font-size: 13px; }
  p { margin: 0; color: #bbb; font-size: 12px; }
  p[role="alert"] { color: #ffb3a7; }
</style>
