<script lang="ts">
  import { onMount } from "svelte";
  import { androidPlayer, type AndroidDownloadsState, type AndroidDownloadCommand } from "./android-player";
  import type { PlaybackState } from "./playback";
  import { releasePointerFocus } from "./pointer-input";

  let { link, sourceUrl, active, onplay }: { link: string; sourceUrl: string; active: boolean; onplay: (state: PlaybackState) => void } = $props();
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  let downloads = $state.raw<AndroidDownloadsState>({ items: [], activeId: null });
  let url = $state("");
  let mode = $state("audio");
  let pending = $state(false);
  let error = $state("");
  let loaded = $state(false);
  let refreshing = false;
  let disposed = false;
  let version = 0;
  $effect(() => { url = link.trim() || sourceUrl; });

  const bytes = (value: number) => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${Math.round(value / 1024)} KiB`;
  const status = (value: string) => ({ downloading: text("Downloading", "Загрузка"), finishing: text("Preparing file", "Подготовка файла"), cancelling: text("Cancelling", "Отмена"), cancelled: text("Cancelled", "Отменено"), interrupted: text("Interrupted", "Прервано"), ready: text("Available offline", "Доступно без сети"), failed: text("Failed", "Ошибка") })[value] ?? value;
  function failure(value: unknown): string {
    const code = value && typeof value === "object" && "code" in value ? value.code : "";
    if (code === "download-busy") return text("A download is running or stopping. Wait for it to finish or cancel it.", "Загрузка ещё идёт или останавливается. Дождитесь завершения или отмените её.");
    if (code === "download-missing") return text("The offline file is missing. Download it again.", "Офлайн-файл недоступен. Скачайте его снова.");
    if (code === "download-storage") return text("Cannot read or save downloads. Check free storage and reopen the app. Existing files are kept.", "Не удалось прочитать или сохранить загрузки. Проверьте свободное место и откройте приложение снова. Существующие файлы сохранены.");
    if (code === "download-background") return text("Android could not start the transfer. Keep the app open and press Retry.", "Android не разрешил запустить загрузку. Оставьте приложение открытым и нажмите «Повторить».");
    return text("Cannot complete the request. Use a link to one recorded YouTube video, for example https://youtu.be/dQw4w9WgXcQ, and try again.", "Не удалось выполнить запрос. Укажите ссылку на один записанный ролик YouTube, например https://youtu.be/dQw4w9WgXcQ, и повторите попытку.");
  }
  async function refresh(initial = false) {
    if (disposed || refreshing || pending || (!initial && (!active || document.visibilityState === "hidden"))) return;
    refreshing = true;
    const currentVersion = version;
    try {
      const state = await androidPlayer.getDownloads();
      if (!disposed && currentVersion === version) { downloads = state; loaded = true; }
    } catch (cause) { if (!disposed && currentVersion === version) error = failure(cause); }
    finally { refreshing = false; }
  }
  async function action(command: AndroidDownloadCommand) {
    pending = true;
    error = "";
    ++version;
    try { downloads = await androidPlayer.downloadCommand({ command }); }
    catch (cause) { error = failure(cause); }
    finally { pending = false; }
  }
  async function open(id: string, audioOnly: boolean) {
    pending = true;
    error = "";
    ++version;
    try { onplay(await androidPlayer.openDownload({ id, audioOnly })); }
    catch (cause) { error = failure(cause); }
    finally { pending = false; }
  }
  onMount(() => {
    void refresh(true);
    const timer = setInterval(() => void refresh(), 1000);
    const visible = () => void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; ++version; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  });
</script>

<section aria-label={text("Offline YouTube downloads", "Офлайн-загрузки YouTube")}>
  <form onsubmit={event => { event.preventDefault(); void action({ type: "start", url: url.trim(), audioOnly: mode === "audio", quality: mode === "audio" ? 720 : Number(mode) }); }}>
    <label class="link">YouTube<input type="url" required maxlength="2048" bind:value={url} placeholder="https://youtu.be/…" autocomplete="off" /></label>
    <select aria-label={text("Download format", "Формат загрузки")} bind:value={mode}><option value="audio">{text("Audio", "Аудио")}</option><option value="480">{text("Video ≤480p", "Видео ≤480p")}</option><option value="720">{text("Video ≤720p", "Видео ≤720p")}</option><option value="1080">{text("Video ≤1080p", "Видео ≤1080p")}</option></select>
    <button disabled={!loaded || pending || downloads.activeId !== null} onpointerup={releasePointerFocus}>{text("Download", "Скачать")}</button>
  </form>
  <p class="hint">{text("Downloads continue in the background. Online and offline copies share the saved position. Files stay in this app and are removed when it is uninstalled.", "Загрузка продолжается в фоне. Онлайн-ролик и офлайн-копии используют общую позицию. Файлы хранятся в приложении и удаляются при его удалении.")}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loaded && !downloads.items.length}<p>{text("No downloads yet. Paste a YouTube link or open a video to use its link here.", "Загрузок пока нет. Вставьте ссылку YouTube или откройте ролик, чтобы использовать его ссылку здесь.")}</p>{/if}
  <ul>{#each downloads.items as item (item.id)}
    <li>
      <div class="entry"><span class="title">{item.title}</span><span class="format">{item.audioOnly ? text("Audio", "Аудио") : `≤${item.quality}p`}</span></div>
      <div class="actions"><span class="status" aria-live="polite">{status(item.status)}{item.status === "downloading" && item.part > 0 ? ` · ${text("part", "часть")} ${item.part}${item.total > 0 ? `: ${item.percent}%` : ""}` : ""}</span>
        {#if item.status === "ready"}<span class="hint">{bytes(item.downloaded)}</span><button disabled={pending} onclick={() => open(item.id, true)} onpointerup={releasePointerFocus}>{text("Listen", "Слушать")}</button>{#if !item.audioOnly}<button disabled={pending} onclick={() => open(item.id, false)} onpointerup={releasePointerFocus}>{text("Watch", "Смотреть")}</button>{/if}
        {:else if downloads.activeId === item.id}<button disabled={pending || item.status === "cancelling"} onclick={() => action({ type: "cancel", id: item.id })} onpointerup={releasePointerFocus}>{text("Cancel", "Отмена")}</button>
        {:else}<button disabled={pending || downloads.activeId !== null} onclick={() => action({ type: "retry", id: item.id })} onpointerup={releasePointerFocus}>{text("Retry", "Повторить")}</button>{/if}
      </div>
      {#if item.status === "downloading"}<progress aria-label={text("Current part progress", "Прогресс текущей части")} max="100" value={item.total > 0 ? item.percent : undefined}></progress><small>{bytes(item.downloaded)}{item.total > 0 ? ` / ${bytes(item.total)}` : ""}{item.speed > 0 ? ` · ${bytes(item.speed)}/${text("s", "с")}` : ""}{item.eta > 0 ? ` · ${Math.ceil(item.eta / 60)} ${text("min left", "мин осталось")}` : ""}</small>{/if}
      {#if item.error}<p class="error">{item.error === "missing" ? text("File is missing or changed. Retry to download it again.", "Файл недоступен или изменён. Нажмите «Повторить», чтобы скачать его снова.") : item.error === "storage" ? text("Cannot save the file. Check free storage and retry.", "Не удалось сохранить файл. Проверьте свободное место и повторите попытку.") : item.error === "background" ? text("Android could not start the transfer. Open the app and retry.", "Android не разрешил запустить загрузку. Откройте приложение и повторите попытку.") : text("Download failed. Check the connection, free storage, and video availability, then retry. Details are in Playback diagnostics.", "Загрузка не завершилась. Проверьте соединение, свободное место и доступность ролика, затем повторите попытку. Подробности есть в диагностике плеера.")}</p>{/if}
    </li>
  {/each}</ul>
</section>

<style>
  form, .entry, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aaa; }
  .link { flex: 1; min-width: 180px; }
  input { flex: 1; min-width: 0; }
  input, select, button { box-sizing: border-box; min-height: 30px; padding: 5px 8px; border: none; border-radius: 5px; background: #242424; font-size: 12px; }
  input, select { color: #eee; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  ul { list-style: none; padding: 0; margin: 8px 0 0; }
  li { margin-top: 8px; padding: 8px; border-radius: 5px; background: #1d1d1d; }
  .title { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
  .format, .status, p, small { font-size: 12px; line-height: 1.45; color: #bbb; }
  .actions { margin-top: 6px; }
  .status { margin-right: auto; }
  p { margin: 8px 0; }
  .hint, small { color: #999; font-size: 11px; }
  .error { color: #efb0a8; }
  progress { display: block; width: 100%; height: 5px; margin: 8px 0 4px; accent-color: #fec965; }
</style>
