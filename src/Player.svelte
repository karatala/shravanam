<script lang="ts">
  import { onMount } from "svelte";
  import { Capacitor } from "@capacitor/core";
  import { androidPlayer } from "./android-player";
  import { createBrowserPlayer } from "./browser-player";
  import { formatTime, initialPlaybackState, mediaAccept, type PlaybackState, type PlaybackCommand, type PlaybackError } from "./playback";
  import { releasePointerFocus } from "./pointer-input";
  import { DataError } from "./data/model";
  import LibraryTools from "./LibraryTools.svelte";
  import { droppedBrowserFiles, pickBrowserFiles, type BrowserMediaFile } from "./browser-files";
  import { BunPlayerError, createBunPlayer } from "./bun-player";
  import LibraryPanel from "./LibraryPanel.svelte";
  import NativeLibraryTools from "./NativeLibraryTools.svelte";
  import { requestLibrary, libraryFailure, type NativeLibraryState } from "./library-client";
  import type { LibraryCommand } from "./library";
  import SleepPanel from "./SleepPanel.svelte";
  import SourcesPanel from "./SourcesPanel.svelte";

  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  const desktop = Boolean(window.shravanamDesktopHost);
  const bunPlayer = window.shravanamBunHost ? createBunPlayer(window.shravanamBunHost.token) : null;
  const nativeDesktop = desktop || Boolean(bunPlayer);
  const desktopPlayer = () => bunPlayer ?? window.shravanamDesktop;
  const android = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const nativePlayer = nativeDesktop || android;
  let playback: PlaybackState = $state(initialPlaybackState());
  const youtubeAvailable = $derived(nativeDesktop || (android && playback.youtubeSupported === true));
  let interfaceError = $state<PlaybackError | null>(null);
  let mediaElement = $state<HTMLVideoElement>();
  let fileInput: HTMLInputElement;
  let browserPlayer: Awaited<ReturnType<typeof createBrowserPlayer>> | undefined;
  let mounted = false;
  let browserVersion = 0;
  let dragging = $state(false);
  let ready = $state(false);
  let link = $state("");
  let openingLink = $state(false);
  let nativeLibrary = $state.raw<NativeLibraryState | null>(null);
  let libraryError = $state("");
  let libraryLoading = $state(false);
  let libraryTarget: string | null | undefined;
  let backgroundError = $state("");
  let mpvPath = $state("");
  let savingMpvPath = $state(false);
  let panel = $state("library");
  const savedMpvPath = $derived(playback.mpvPath ?? "");
  const mpvExample = navigator.platform.startsWith("Win") ? "C:\\Players\\mpv\\mpv.exe" : "/usr/local/bin/mpv";
  const playerPathFailure = $derived(["missing-player", "player-path", "player-settings"].includes((interfaceError ?? playback.error)?.code ?? ""));
  $effect(() => { mpvPath = savedMpvPath; });
  $effect(() => { if (playerPathFailure) panel = "settings"; });
  const current = $derived(playback.items.find(item => item.id === playback.currentId));
  const errorText = $derived.by(() => {
    const failure = interfaceError ?? playback.error ?? playback.videoError;
    if (!failure) return "";
    const name = failure.name ? ` «${failure.name}»` : "";
    if (failure.code === "video") return text("Cannot open video. Audio playback continues. Check the connection and yt-dlp, then select Listen and Watch to retry.", "Не удалось подключить видео. Звук продолжает воспроизводиться. Проверьте соединение и yt-dlp, затем переключите «Слушать» и «Смотреть» для повторной попытки.");
    if (failure.code === "youtube-link") return text(`Cannot open link${name}. Paste an HTTPS link to one YouTube video, for example https://www.youtube.com/watch?v=dQw4w9WgXcQ. Playlist-only links and other sites are not supported yet.`, `Не удалось открыть ссылку${name}. Вставьте HTTPS-ссылку на один ролик YouTube, например https://www.youtube.com/watch?v=dQw4w9WgXcQ. Ссылки только на плейлист и другие сайты пока не поддерживаются.`);
    if (failure.code === "missing-downloader") return text("Cannot open YouTube: yt-dlp was not found. Add a current yt-dlp executable to PATH, or update IINA in Applications, then open the link again.", "Не удалось открыть YouTube: yt-dlp не найден. Добавьте актуальный исполняемый файл yt-dlp в PATH или обновите IINA в папке «Программы», затем откройте ссылку снова.");
    if (failure.code === "youtube" && android) return text(`Cannot open YouTube${name}. Check the connection and that the video plays without signing in, then open the link again. If it still fails, update the Android app.`, `Не удалось открыть YouTube${name}. Проверьте соединение и доступность ролика без входа в аккаунт, затем откройте ссылку снова. Если ошибка остаётся, обновите Android-приложение.`);
    if (failure.code === "youtube") return text(`Cannot open YouTube${name}. Check the connection and that the video plays without signing in. Update yt-dlp (or IINA if using its copy) and ensure a supported JavaScript runtime, for example Deno, is installed, then open the link again.`, `Не удалось открыть YouTube${name}. Проверьте соединение и доступность ролика без входа в аккаунт. Обновите yt-dlp (или IINA, если используется его копия) и проверьте наличие поддерживаемой среды JavaScript, например Deno, затем откройте ссылку снова.`);
    if (failure.code === "youtube-live") return text("Cannot open this live or upcoming stream yet. Open a recorded YouTube video instead.", "Прямой эфир или запланированная трансляция пока не поддерживается. Откройте записанный ролик YouTube.");
    if (failure.code === "format") return text(`Cannot open${name}. Choose a supported audio or video file, for example book.mp3 or chapter.m4b.`, `Не удалось открыть${name}. Выберите аудио или видео поддерживаемого формата, например book.mp3 или chapter.m4b.`);
    if (failure.code === "missing-player") return text("Cannot start playback: no supported player was found. Enter the full path to mpv in Player settings below, apply it, then press Play or open the file again.", "Не удалось начать воспроизведение: плеер не найден. Укажите полный путь к mpv в настройках плеера ниже, примените его и нажмите «Воспроизвести» или откройте файл снова.");
    if (failure.code === "player-settings") return text("Cannot read or save the mpv path. Check free space and access to the application data folder, then apply the path again.", "Не удалось прочитать или сохранить путь к mpv. Проверьте свободное место и доступ к папке данных приложения, затем примените путь снова.");
    if (failure.code === "player-path") return text(`Cannot use mpv${name}. Enter the full path to its executable file, for example ${mpvExample}, without quotes or arguments. Check that it exists and can run, apply the path, then press Play. Clear the field to use automatic search.`, `Не удалось использовать mpv${name}. Укажите полный путь к исполняемому файлу, например ${mpvExample}, без кавычек и параметров. Проверьте, что файл существует и запускается, примените путь и нажмите «Воспроизвести». Очистите поле для автоматического поиска.`);
    if (failure.code === "iina-player") return text("Cannot connect to the IINA player started by Shravanam. Restart Shravanam and open the file again. If this continues, open IINA from Applications to check that macOS allows it to run.", "Не удалось подключиться к IINA, запущенному из Shravanam. Перезапустите Shravanam и откройте файл снова. Если ошибка осталась, откройте IINA из папки «Программы» и проверьте, что macOS разрешает его запуск.");
    if (failure.code === "player-closed") return text("Playback stopped or the player closed. Press Play to reopen the file at the last saved position.", "Воспроизведение остановлено или плеер закрыт. Нажмите «Воспроизвести», чтобы открыть файл с последней сохранённой позиции.");
    if (failure.code === "host") return text("Cannot connect to the local player. Start or restart bun run dev in the terminal, then reload this page.", "Нет связи с локальным плеером. Запустите или перезапустите bun run dev в терминале и обновите страницу.");
    if (failure.code === "picker") return text("Cannot open the system file dialog. Close any existing dialog and try again. On Linux, install zenity or kdialog if neither is available.", "Не удалось открыть системный диалог выбора файла. Закройте уже открытый диалог и повторите попытку. На Linux установите zenity или kdialog, если их нет.");
    if (failure.code === "native-drop") return text("Use Open files to select this file on the computer. A browser drop does not provide its disk path to the local player. File drops are supported in the desktop app window.", "Выберите этот файл через «Открыть файлы». При перетаскивании браузер не передаёт локальному плееру путь на диске. Перетаскивание доступно в окне desktop-приложения.");
    if (failure.code === "android-player") return text("Cannot connect to the Android player. Close and reopen the app. If this continues, install a current app build.", "Не удалось подключиться к плееру Android. Закройте и снова откройте приложение. Если ошибка повторяется, установите свежую сборку приложения.");
    if (failure.code === "access") return text(`Cannot access${name}. Select the file again with Open files and allow read access.`, `Нет доступа к файлу${name}. Выберите его снова через «Открыть файлы» и разрешите чтение.`);
    if (failure.code === "recent-access") return text(`Cannot reopen${name} automatically. Click it in Recent files to allow access, or select it again with Open files.`, `Не удалось автоматически открыть${name}. Нажмите на файл в списке последних, чтобы разрешить доступ, или выберите его снова через «Открыть файлы».`);
    if (failure.code === "changed-file") return text(`File${name} has changed. Select it again with Open files to open the current version.`, `Файл${name} изменился. Выберите его снова через «Открыть файлы», чтобы открыть текущую версию.`);
    if (failure.code === "library-changed") return text("Library data changed in another window. Reload this page, then reopen the media file.", "Данные библиотеки изменены в другом окне. Перезагрузите страницу и откройте медиафайл снова.");
    if (failure.code === "storage") return text("Cannot save playback progress or settings. Check free space and storage access, then try again.", "Не удалось сохранить позицию или настройки. Проверьте свободное место и доступ к хранилищу, затем повторите попытку.");
    if (failure.code === "open") return text(`Cannot read${name}. Check that the file exists and is accessible, then open it again.`, `Не удалось прочитать${name}. Проверьте, что файл существует и доступен, затем откройте его снова.`);
    if (playback.recentLinks?.some(item => item.id === playback.currentId)) return text("Cannot play the YouTube stream. Check the connection and press Play to get a fresh stream address and resume.", "Не удалось воспроизвести поток YouTube. Проверьте соединение и нажмите «Воспроизвести», чтобы получить новый адрес потока и продолжить.");
    return text(`Cannot play${name}. Press Play to retry. If playback still fails, check the file and try another format, for example MP3.`, `Не удалось воспроизвести${name}. Нажмите «Воспроизвести» для повторной попытки. Если ошибка осталась, проверьте файл или попробуйте другой формат, например MP3.`);
  });

  function browserFailure(error: unknown) {
    console.error(error);
    playback = { ...playback, loading: false, error: { code: error instanceof DataError && error.code === "changed" ? "library-changed" : "storage" } };
  }
  async function startBrowser(restore = false) {
    if (!mediaElement) return;
    const version = ++browserVersion;
    ready = false;
    const player = await createBrowserPlayer(mediaElement, next => { if (mounted && version === browserVersion) playback = next; });
    if (!mounted || version !== browserVersion) { await player.dispose(); return; }
    browserPlayer = player;
    if (restore) await player.restoreLast();
    if (!mounted || version !== browserVersion) return;
    ready = true;
  }
  async function stopBrowser() {
    ready = false;
    browserVersion++;
    const player = browserPlayer;
    browserPlayer = undefined;
    await player?.dispose();
  }
  function addFiles(files: BrowserMediaFile[]) { void browserPlayer?.addFiles(files).catch(browserFailure); }

  async function command(action: PlaybackCommand) {
    interfaceError = null;
    try {
      if (nativeDesktop) playback = await desktopPlayer()!.playbackCommand(action);
      else if (android) playback = await androidPlayer.playbackCommand({ command: action });
      else await browserPlayer?.command(action);
    } catch (error) {
      if (!nativePlayer) browserFailure(error);
      else { console.error(error); interfaceError = { code: error instanceof BunPlayerError ? error.code : "player", name: current?.name }; }
    }
  }
  async function refreshLibrary() {
    if (!nativeDesktop) return;
    try { nativeLibrary = await requestLibrary({ type: "state" }); libraryError = ""; }
    catch (error) { libraryError = libraryFailure(error).split(" / ")[russian ? 1 : 0] ?? libraryFailure(error); }
  }
  async function browseMpv() {
    savingMpvPath = true;
    try {
      const { path } = await desktopPlayer()!.chooseMpv();
      if (path) { mpvPath = path; interfaceError = null; }
    } catch (error) { console.error(error); interfaceError = { code: error instanceof BunPlayerError ? error.code : "picker" }; }
    finally { savingMpvPath = false; }
  }
  async function backgroundWindow() {
    backgroundError = "";
    try { await window.shravanamDesktop!.backgroundWindow(russian ? "ru" : "en"); }
    catch (error) { const message = error instanceof Error ? error.message : "Cannot enter background mode. Keep the window open and try again. / Не удалось перейти в фон. Оставьте окно открытым и повторите попытку."; backgroundError = message.split(" / ")[russian ? 1 : 0] ?? message; }
  }
  async function libraryCommand(action: LibraryCommand) {
    libraryLoading = true;
    try {
      nativeLibrary = await requestLibrary({ type: "command", command: action });
      playback = await desktopPlayer()!.getPlaybackState();
      libraryError = "";
    } catch (error) { libraryError = libraryFailure(error).split(" / ")[russian ? 1 : 0] ?? libraryFailure(error); throw error; }
    finally { libraryLoading = false; }
  }
  async function openFiles() {
    interfaceError = null;
    if (!nativePlayer) {
      try {
        const files = await pickBrowserFiles();
        if (files === null) fileInput.click(); else addFiles(files);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) { console.error(error); playback = { ...playback, error: { code: "open" } }; }
      }
      return;
    }
    try { playback = await (android ? androidPlayer.chooseMedia() : desktopPlayer()!.chooseMedia()); }
    catch (error) { console.error(error); interfaceError = { code: error instanceof BunPlayerError ? error.code : "open" }; }
  }
  async function openLink(event: SubmitEvent) {
    event.preventDefault();
    if (openingLink) return;
    openingLink = true;
    try { await command({ type: "open-youtube", url: link.trim() }); }
    finally { openingLink = false; }
  }
  onMount(() => {
    mounted = true;
    let active = true;
    let polling = false;
    let dragDepth = 0;
    if (!nativePlayer) void startBrowser(true).catch(browserFailure);
    const poll = async () => {
      if (!nativePlayer || polling || document.hidden || (nativeDesktop && !desktopPlayer())) return;
      polling = true;
      try { const next = await (android ? androidPlayer.getPlaybackState() : desktopPlayer()!.getPlaybackState()); if (active) { playback = next; ready = true; if (interfaceError?.code === "host") interfaceError = null; if (nativeDesktop && libraryTarget !== next.libraryMediaId) { libraryTarget = next.libraryMediaId; void refreshLibrary(); } } }
      catch (error) { if (active) { console.error(error); playback = { ...playback, error: { code: android ? "android-player" : bunPlayer ? "host" : "player" } }; } }
      finally { polling = false; }
    };
    void poll();
    const interval = nativePlayer ? setInterval(() => void poll(), 500) : undefined;
    const visibilityChanged = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", visibilityChanged);
    const acceptsFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => { if (acceptsFiles(event)) { event.preventDefault(); dragDepth++; dragging = !bunPlayer; } };
    const over = (event: DragEvent) => { if (acceptsFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = bunPlayer ? "none" : "copy"; } };
    const leave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragging = false; };
    const drop = (event: DragEvent) => {
      if (!acceptsFiles(event)) return;
      event.preventDefault();
      dragging = false;
      dragDepth = 0;
      if (bunPlayer) { interfaceError = { code: "native-drop" }; return; }
      if (!nativePlayer && ready && event.dataTransfer) void droppedBrowserFiles(event.dataTransfer).then(addFiles).catch(browserFailure);
    };
    const nativeDrag = (event: Event) => { dragging = Boolean((event as CustomEvent<boolean>).detail); };
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !playback.currentId) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="menu"]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="slider"], [role="textbox"]'))) return;
      if (!["Space", "ArrowLeft", "ArrowRight"].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Space") { if (!event.repeat) void command({ type: "toggle" }); }
      else void command({ type: "seek", time: Math.max(0, playback.time + (event.code === "ArrowLeft" ? -playback.backward : playback.forward)) });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("shravanam-file-drag", nativeDrag);
    window.addEventListener("keydown", keydown, true);
    return () => {
      active = false;
      mounted = false;
      browserVersion++;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityChanged);
      void browserPlayer?.dispose().catch(error => console.error(error));
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("shravanam-file-drag", nativeDrag);
      window.removeEventListener("keydown", keydown, true);
    };
  });
</script>

<section class="player" class:dragging aria-label={text("Player", "Плеер")}>
  <div class="source-row">
    <button type="button" class="action" disabled={!ready} onclick={openFiles} onpointerup={releasePointerFocus}>{text("Open files", "Открыть файлы")}</button>
    {#if nativeDesktop || android}
      <form class="link-form" onsubmit={openLink}>
        <input type="url" aria-label={text("YouTube link", "Ссылка YouTube")} bind:value={link} required maxlength="2048" placeholder={text("YouTube link", "Ссылка YouTube")} />
        <button type="submit" class="action" disabled={!ready || !youtubeAvailable || playback.loading || openingLink} onpointerup={releasePointerFocus}>{text("Open", "Открыть")}</button>
      </form>
    {:else if !android}<span class="hint intake-hint">{text("or drop files here", "или перетащите файлы сюда")}</span>{/if}
  </div>
  <input bind:this={fileInput} type="file" accept={mediaAccept} multiple hidden onchange={() => { addFiles(Array.from(fileInput.files ?? [], file => ({ file }))); fileInput.value = ""; }} />

  <div class="track-heading">
    <h2 class:empty={!current} title={current?.name}>{current?.name ?? (nativeDesktop || android ? text("Open a file or a YouTube link", "Откройте файл или ссылку YouTube") : text("Open a file to start listening", "Откройте файл для воспроизведения"))}</h2>
    {#if playback.backend}<span class="backend">{playback.backend === "iina" ? "IINA" : "mpv"}</span>{/if}
  </div>
  {#if !nativePlayer}<video bind:this={mediaElement} class:audio-only={current?.kind !== "video"} playsinline preload="metadata"><track kind="captions" /></video>{/if}
  {#if current}
    <div class="timeline">
      <span>{formatTime(playback.time)}</span>
      <input aria-label={text("Playback position", "Позиция воспроизведения")} type="range" min="0" max={playback.duration || 1} step="0.1" value={playback.time} disabled={!playback.duration || playback.loading} onchange={event => command({ type: "seek", time: Number(event.currentTarget.value) })} />
      <span>{formatTime(playback.duration)}</span>
    </div>
  {/if}
  <div class="controls">
    {#if current}
      <div class="transport">
        <button type="button" class="action" disabled={playback.loading} title={text("Seek backward", "Перемотка назад")} onclick={() => command({ type: "seek", time: Math.max(0, playback.time - playback.backward) })} onpointerup={releasePointerFocus}>−{playback.backward} {text("s", "с")}</button>
        <button type="button" class="action primary" disabled={playback.loading} onclick={() => command({ type: "toggle" })} onpointerup={releasePointerFocus}>{playback.paused ? text("Play", "Воспроизвести") : text("Pause", "Пауза")}</button>
        <button type="button" class="action" disabled={playback.loading} title={text("Seek forward", "Перемотка вперёд")} onclick={() => command({ type: "seek", time: playback.time + playback.forward })} onpointerup={releasePointerFocus}>+{playback.forward} {text("s", "с")}</button>
      </div>
      <label class="speed">{text("Speed", "Скорость")}<select value={playback.speed} onchange={event => command({ type: "speed", value: Number(event.currentTarget.value) })}>{#each [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as speed}<option value={speed}>{speed}×</option>{/each}</select></label>
    {/if}
    {#if nativeDesktop && typeof playback.audioOnly === "boolean"}
      <select class="mode" aria-label={text("Playback mode", "Режим воспроизведения")} title={text("Video opens in the player window", "Видео открывается в окне плеера")} disabled={!ready || playback.loading} value={playback.audioOnly ? "audio" : "video"} onchange={event => command({ type: "audio-only", value: event.currentTarget.value === "audio" })}><option value="audio">{text("Listen", "Слушать")}</option><option value="video">{text("Watch", "Смотреть")}</option></select>
    {/if}
    {#if desktop}<button type="button" class="action background" title={text("Continue playback and reopen from the tray", "Продолжить воспроизведение и открыть окно из трея")} onclick={backgroundWindow} onpointerup={releasePointerFocus}>{text("Background", "В фон")}</button>{/if}
  </div>
  {#if dragging}<p class="hint" role="status">{text("Drop files here", "Отпустите файлы здесь")}</p>{/if}
  {#if playback.loading || openingLink}<p class="hint" role="status">{text("Opening media…", "Открытие медиа…")}</p>{/if}
  {#if android && ready && !youtubeAvailable}<p class="hint">{text("Install a new Android APK to open YouTube links. Reloading the interface does not update the native player.", "Для открытия ссылок YouTube установите новый Android APK. Перезагрузка интерфейса не обновляет нативный плеер.")}</p>{/if}
  {#if playback.videoLoading}<p class="hint" role="status">{text("Opening video; audio keeps playing.", "Подключение видео; звук продолжает идти.")}</p>{/if}
  {#if android && current?.kind === "video"}<p class="hint">{text("Audio only on Android for now.", "На Android пока воспроизводится только звук.")}</p>{/if}
  {#if current?.temporary}<p class="hint">{text("Temporary file access. Use Open files to request lasting access.", "Временный доступ к файлу. Выберите его через «Открыть файлы», чтобы сохранить доступ.")}</p>{/if}
  {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
  {#if backgroundError}<p class="error" role="alert">{backgroundError}</p>{/if}
</section>

<section class="workspace" aria-label={text("Library and tools", "Библиотека и инструменты")}>
  <nav class="workspace-nav" aria-label={text("Workspace", "Разделы")}>
    <button type="button" class:active={panel === "library"} aria-pressed={panel === "library"} onclick={() => panel = "library"} onpointerup={releasePointerFocus}>{text("Library", "Библиотека")}</button>
    {#if nativeDesktop}
      <button type="button" class:active={panel === "sources"} aria-pressed={panel === "sources"} onclick={() => panel = "sources"} onpointerup={releasePointerFocus}>{text("Sources", "Источники")}</button>
      <button type="button" class:active={panel === "sleep"} aria-pressed={panel === "sleep"} onclick={() => panel = "sleep"} onpointerup={releasePointerFocus}>{text("Sleep", "Сон")}{#if playback.sleep && !["idle", "expired"].includes(playback.sleep.phase)}<span class="badge">{formatTime(playback.sleep.remainingSeconds)}</span>{/if}</button>
    {/if}
    <button type="button" class:active={panel === "settings"} aria-pressed={panel === "settings"} onclick={() => panel = "settings"} onpointerup={releasePointerFocus}>{text("Settings", "Настройки")}</button>
  </nav>

  <div class="workspace-panel" hidden={panel !== "library"}>
    {#if nativeDesktop && nativeLibrary}
      <LibraryPanel library={nativeLibrary.library} currentMediaId={playback.libraryMediaId ?? null} time={playback.time} duration={playback.duration} loading={libraryLoading || playback.loading} oncommand={libraryCommand} onseek={time => command({ type: "seek", time })} onplay={(mediaId, playlistId) => libraryCommand({ type: "play", mediaId, ...(playlistId ? { playlistId } : {}) })} />
    {/if}
    <div class="record-groups">
      {#if playback.items.length > 1}
        <section class="record-group" aria-label={text("Current files", "Открытые файлы")}>
          <h3>{text("Current files", "Открытые файлы")} <span>{playback.items.length}</span></h3>
          <ul>{#each playback.items as item (item.id)}<li><button type="button" class="file" title={item.name} aria-current={item.id === playback.currentId ? "true" : undefined} onclick={() => command({ type: "select", id: item.id })} onpointerup={releasePointerFocus}>{item.name}</button></li>{/each}</ul>
        </section>
      {/if}
      {#if playback.recent?.length}
        <section class="record-group" aria-label={text("Recent files", "Последние файлы")}>
          <h3>{text("Recent files", "Последние файлы")} <span>{playback.recent.length}</span></h3>
          <ul>{#each playback.recent as item (item.id)}<li><button type="button" class="file" title={item.name} disabled={!ready} onclick={() => command({ type: "recent", id: item.id })} onpointerup={releasePointerFocus}>{item.name}{item.temporary ? " · !" : ""}</button></li>{/each}</ul>
        </section>
      {/if}
      {#if (nativeDesktop || android) && playback.recentLinks?.length}
        <section class="record-group" aria-label={text("Saved links", "Сохранённые ссылки")}>
          <h3>{text("Saved links", "Сохранённые ссылки")} <span>{playback.recentLinks.length}</span></h3>
          <ul>{#each playback.recentLinks as item (item.id)}<li><button type="button" class="file" title={item.name} disabled={!ready || playback.loading} onclick={() => command({ type: android ? "recent" : "select", id: item.id })} onpointerup={releasePointerFocus}>{item.name}</button></li>{/each}</ul>
        </section>
      {/if}
    </div>
  </div>
  {#if nativeDesktop}
    <div class="workspace-panel" hidden={panel !== "sources"}><SourcesPanel /></div>
    <div class="workspace-panel" hidden={panel !== "sleep"}>{#if playback.sleep}<SleepPanel state={playback.sleep} oncommand={async action => { playback = await desktopPlayer()!.sleepCommand(action); }} onseek={time => { void command({ type: "seek", time }); }} />{/if}</div>
  {/if}
  <div class="workspace-panel settings" hidden={panel !== "settings"}>
    {#if nativeDesktop}
      <h3>{text("Player", "Плеер")}</h3>
      <form class="controls" onsubmit={async event => { event.preventDefault(); savingMpvPath = true; try { await command({ type: "mpv-path", value: mpvPath }); } finally { savingMpvPath = false; } }}>
        <label class="path-field">mpv<input type="text" aria-label={text("Path to mpv", "Путь к mpv")} bind:value={mpvPath} maxlength="32768" placeholder={mpvExample} autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="action" disabled={!ready || playback.loading || savingMpvPath} onclick={browseMpv} onpointerup={releasePointerFocus}>{text("Browse…", "Обзор…")}</button>
        <button type="submit" class="action" disabled={!ready || playback.loading || savingMpvPath} onpointerup={releasePointerFocus}>{text("Apply", "Применить")}</button>
      </form>
      <p class="hint">{text("Empty path: automatic search. Restart the player to use a changed path.", "Пустой путь: автоматический поиск. Новый путь применяется после перезапуска плеера.")}</p>
    {/if}
    <h3>{text("Seek intervals", "Интервалы перемотки")}</h3>
    <div class="intervals">
      <label>{text("Back, sec", "Назад, сек")}<input type="number" required min="1" max="600" step="1" value={playback.backward} onchange={event => { if (event.currentTarget.reportValidity()) void command({ type: "intervals", backward: Number(event.currentTarget.value), forward: playback.forward }); }} /></label>
      <label>{text("Forward, sec", "Вперёд, сек")}<input type="number" required min="1" max="600" step="1" value={playback.forward} onchange={event => { if (event.currentTarget.reportValidity()) void command({ type: "intervals", backward: playback.backward, forward: Number(event.currentTarget.value) }); }} /></label>
    </div>
    {#if playback.systemControls?.supported}
      <h3>{text("System controls", "Системное управление")}</h3>
      <p class="hint">{playback.systemControls.available ? text("Connected. Media Previous/Next use the seek intervals above.", "Подключено. Медиаклавиши «Назад/Вперёд» используют интервалы выше.") : playback.systemControls.error ? text("Unavailable", "Недоступно") : text("Connecting…", "Подключение…")}</p>
      <div class="shortcuts">{#each playback.systemControls.shortcuts as shortcut}<span><kbd>{shortcut.key}</kbd>{({ toggle: text("Play/Pause", "Пауза"), back: text("Back", "Назад"), forward: text("Forward", "Вперёд"), open: text("Open window", "Открыть окно") } as Record<string, string>)[shortcut.action]}{playback.systemControls.available && !shortcut.registered ? text(" · occupied", " · занято") : ""}</span>{/each}</div>
      {#if playback.systemControls.error}<p class="error" role="alert">{playback.systemControls.error.split(" / ")[russian ? 1 : 0] ?? playback.systemControls.error}</p>{/if}
    {/if}
    {#if nativeDesktop && nativeLibrary}<NativeLibraryTools state={nativeLibrary} onrefresh={refreshLibrary} />{/if}
    {#if !nativeDesktop && !Capacitor.isNativePlatform()}<LibraryTools enabled={ready} beforeExport={async () => { await browserPlayer?.flush(); }} beforeChange={stopBrowser} afterChange={startBrowser} />{/if}
  </div>
  {#if libraryError}<p class="error" role="alert">{libraryError}</p>{/if}
</section>

<style>
  .player, .workspace { padding: 12px; border-radius: 8px; background: #141414; }
  .player.dragging { background: #322a18; }
  .source-row, .link-form, .controls, .transport, .intervals { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .link-form { flex: 1; min-width: 200px; flex-wrap: nowrap; }
  .link-form input { width: 100%; }
  .action { min-height: 30px; padding: 5px 10px; border-radius: 5px; background: #262626; font-size: 12px; }
  .primary { color: #fec965; background: #332d20; min-width: 90px; }
  .background { margin-left: auto; }
  button:disabled { opacity: 0.45; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #333; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  .track-heading { display: flex; align-items: start; gap: 12px; margin: 12px 0 8px; }
  h2 { flex: 1; min-width: 0; margin: 0; font-size: 14px; line-height: 1.45; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  h2.empty { color: #888; font-size: 13px; }
  .backend { font-size: 11px; color: #888; padding-top: 3px; }
  video { display: block; width: 100%; max-height: 360px; margin: 8px 0; background: #000; }
  video.audio-only { display: none; }
  .timeline { display: flex; align-items: center; gap: 10px; margin: 8px 0; color: #aaa; font-size: 11px; font-variant-numeric: tabular-nums; }
  .timeline input { flex: 1; min-width: 30px; margin: 0; accent-color: #fec965; }
  label { display: flex; align-items: center; gap: 6px; color: #aaa; font-size: 12px; }
  select, input[type="number"], input[type="url"], input[type="text"] { min-height: 30px; padding: 5px 8px; background: #242424; color: #eee; border: none; border-radius: 5px; font-size: 12px; }
  input[type="url"], input[type="text"] { flex: 1; min-width: 0; }
  input[type="number"] { width: 64px; }
  .mode { margin-left: auto; }

  .workspace { margin-top: 10px; }
  .workspace-nav { display: flex; flex-wrap: wrap; gap: 4px; margin: -3px -3px 10px; }
  .workspace-nav button { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 10px; border-radius: 5px; background: transparent; color: #aaa; font-size: 12px; }
  .workspace-nav button.active { background: #2b271f; color: #fec965; }
  .badge { font-size: 10px; font-variant-numeric: tabular-nums; }
  .workspace-panel { min-width: 0; }
  .record-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
  .record-group { min-width: 0; }
  h3 { margin: 14px 0 8px; font-size: 12px; font-weight: 500; color: #aaa; }
  h3 span { color: #6f6f6f; margin-left: 4px; font-size: 11px; }
  .settings > h3:first-child { margin-top: 0; }
  .path-field { flex: 1; min-width: 180px; }
  .shortcuts { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11px; color: #aaa; }
  .shortcuts span { display: inline-flex; align-items: center; gap: 6px; }
  kbd { padding: 3px 5px; background: #242424; border-radius: 4px; font-family: inherit; font-size: 11px; color: #ccc; }
  ul { max-height: 156px; overflow: auto; padding: 0; list-style: none; margin: 0; }
  .file { display: block; width: 100%; text-align: left; padding: 6px 8px; border-radius: 4px; background: transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
  .file[aria-current="true"] { background: #29251c; color: #fec965; }
  .error { margin: 8px 0 0; color: #ffb3a7; font-size: 12px; line-height: 1.45; }
  .hint { margin: 8px 0 0; color: #888; font-size: 11px; line-height: 1.45; }
  .intake-hint { margin: 0; }
  @media (max-width: 540px) { .player, .workspace { padding: 10px; } .source-row { gap: 6px; } .link-form { min-width: 160px; gap: 6px; } .controls { gap: 6px; } .transport { gap: 4px; } .primary { min-width: 80px; } .speed { margin-left: auto; } .mode { margin-left: 0; } .workspace-nav { gap: 2px; } .workspace-nav button { padding: 5px 8px; } }
</style>
