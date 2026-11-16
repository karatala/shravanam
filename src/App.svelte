<script lang="ts">
  import { onMount } from "svelte";
  import { Capacitor } from "@capacitor/core";
  import { releasePointerFocus } from "./pointer-input";
  import Player from "./Player.svelte";
  import SourceTools from "./SourceTools.svelte";

  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  const desktop = Boolean(window.shravanamDesktopHost || window.shravanamSourceTools);
  const bunHost = Boolean(window.shravanamBunHost);
  const native = desktop || bunHost || Capacitor.isNativePlatform();
  let offlineStatus = $state(bunHost ? text("Local player controls. Keep the application terminal running.", "Управление локальным плеером. Оставьте терминал приложения запущенным.") : native ? text("Application is stored on this device", "Приложение хранится на этом устройстве") : text("Preparing application for offline use…", "Подготовка приложения к работе без сети…"));
  let online = $state(navigator.onLine);
  onMount(() => {
    let active = true;
    const updateConnection = () => { online = navigator.onLine; };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    if (!native) {
      if (!window.shravanamOfflineEnabled) offlineStatus = text("Development mode", "Режим разработки");
      else if (!("serviceWorker" in navigator) || !window.isSecureContext) offlineStatus = text("Offline setup needs HTTPS or localhost. Open the app at a secure address.", "Для офлайн-режима нужен HTTPS или localhost. Откройте приложение по защищённому адресу.");
      else void (async () => {
        try {
          const registration = await navigator.serviceWorker.register(new URL("./service-worker.js", document.baseURI), { scope: "./" });
          const worker = registration.installing ?? registration.waiting;
          if (!registration.active && worker) await new Promise<void>((resolve, reject) => {
            const stateChanged = () => {
              if (worker.state !== "activated" && worker.state !== "redundant") return;
              worker.removeEventListener("statechange", stateChanged);
              if (worker.state === "activated") resolve();
              else reject(new Error("Application cache installation failed"));
            };
            worker.addEventListener("statechange", stateChanged);
            stateChanged();
          });
          if (!registration.active) throw new Error("Application cache is not active");
          if (active) offlineStatus = text("Application is ready for offline use", "Приложение готово к работе без сети");
          if (registration.waiting && active) offlineStatus = text("Update ready. Close all app windows and reopen.", "Обновление готово. Закройте все окна приложения и откройте его снова.");
        } catch (error) {
          console.error("Offline setup failed", error);
          if (active) offlineStatus = text("Cannot prepare offline mode. Check your connection and free storage, then reload.", "Не удалось подготовить офлайн-режим. Проверьте подключение и свободное место, затем загрузите приложение снова.");
        }
      })();
    }
    return () => { active = false; window.removeEventListener("online", updateConnection); window.removeEventListener("offline", updateConnection); };
  });
</script>

<header class="page-header" data-webview-drag-region={desktop ? "deep" : undefined}>
  <span class="page-title">Shravanam</span>
  {#if desktop}
    <div class="window-controls" data-webview-drag-region="false">
      <button type="button" class="icon-button" aria-label={text("Minimize", "Свернуть")} title={text("Minimize", "Свернуть")} onpointerup={releasePointerFocus} onclick={() => window.shravanamDesktop?.minimizeWindow()}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 11h14v2H5z" /></svg></button>
      <button type="button" class="icon-button" aria-label={text("Maximize or restore", "Развернуть или восстановить")} title={text("Maximize or restore", "Развернуть или восстановить")} onpointerup={releasePointerFocus} onclick={() => window.shravanamDesktop?.toggleMaximized()}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5h14v14H5zm2 2v10h10V7z" /></svg></button>
      <button type="button" class="icon-button" aria-label={text("Close", "Закрыть")} title={text("Close", "Закрыть")} onpointerup={releasePointerFocus} onclick={() => window.shravanamDesktop?.requestWindowClose()}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6z" /></svg></button>
    </div>
  {/if}
</header>
{#if window.shravanamSourceTools}
  <SourceTools />
{:else}
<main>
  <Player />
  <div class="status" role="status" title={offlineStatus}>
    <span class:offline={!online}>{online ? text("Online", "В сети") : text("Offline", "Нет сети")}</span>
    <span>{bunHost ? text("Local player", "Локальный плеер") : offlineStatus}</span>
  </div>
</main>
{/if}

<style>
  :global(body) { font-size: 13px; }
  :global(button), :global(input), :global(select), :global(textarea) { font: inherit; }
  main { max-width: 1040px; margin: 0 auto; padding: 16px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  .status { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; font-size: 11px; color: #777; }
  .status span:first-child { color: #a3ad99; }
  .status span.offline { color: #d0ab73; }
  @media (max-width: 540px) { main { padding: 10px max(10px, env(safe-area-inset-right)) 12px max(10px, env(safe-area-inset-left)); } }
</style>
