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

  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  const desktop = Boolean(window.shravanamDesktopHost);
  const bunPlayer = window.shravanamBunHost ? createBunPlayer(window.shravanamBunHost.token) : null;
  const nativeDesktop = desktop || Boolean(bunPlayer);
  const desktopPlayer = () => bunPlayer ?? window.shravanamDesktop;
  const android = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const nativePlayer = nativeDesktop || android;
  let playback: PlaybackState = $state(initialPlaybackState());
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
  const savedMpvPath = $derived(playback.mpvPath ?? "");
  const mpvExample = navigator.platform.startsWith("Win") ? "C:\\Players\\mpv\\mpv.exe" : "/usr/local/bin/mpv";
  const playerPathFailure = $derived(["missing-player", "player-path", "player-settings"].includes((interfaceError ?? playback.error)?.code ?? ""));
  $effect(() => { mpvPath = savedMpvPath; });
  const current = $derived(playback.items.find(item => item.id === playback.currentId));
  const errorText = $derived.by(() => {
    const failure = interfaceError ?? playback.error ?? playback.videoError;
    if (!failure) return "";
    const name = failure.name ? ` «${failure.name}»` : "";
    if (failure.code === "video") return text("Cannot open video. Audio playback continues. Check the connection and yt-dlp, then select Listen and Watch to retry.", "Не удалось подключить видео. Звук продолжает воспроизводиться. Проверьте соединение и yt-dlp, затем переключите «Слушать» и «Смотреть» для повторной попытки.");
    if (failure.code === "youtube-link") return text(`Cannot open link${name}. Paste an HTTPS link to one YouTube video, for example https://www.youtube.com/watch?v=dQw4w9WgXcQ. Playlist-only links and other sites are not supported yet.`, `Не удалось открыть ссылку${name}. Вставьте HTTPS-ссылку на один ролик YouTube, например https://www.youtube.com/watch?v=dQw4w9WgXcQ. Ссылки только на плейлист и другие сайты пока не поддерживаются.`);
    if (failure.code === "missing-downloader") return text("Cannot open YouTube: yt-dlp was not found. Add a current yt-dlp executable to PATH, or update IINA in Applications, then open the link again.", "Не удалось открыть YouTube: yt-dlp не найден. Добавьте актуальный исполняемый файл yt-dlp в PATH или обновите IINA в папке «Программы», затем откройте ссылку снова.");
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

<section class:dragging aria-label={text("Player", "Плеер")}>
  <div class="open-row">
    <button type="button" class="action" disabled={!ready} onclick={openFiles} onpointerup={releasePointerFocus}>{text("Open files", "Открыть файлы")}</button>
    {#if bunPlayer}<span>{text("Select files through the system dialog", "Выберите файлы через системный диалог")}</span>
    {:else if !android}<span>{dragging ? text("Drop files here", "Отпустите файлы здесь") : text("Or drop files from your file manager", "Или перетащите файлы из файлового менеджера")}</span>{/if}
  </div>
  <input bind:this={fileInput} type="file" accept={mediaAccept} multiple hidden onchange={() => { addFiles(Array.from(fileInput.files ?? [], file => ({ file }))); fileInput.value = ""; }} />
  {#if nativeDesktop}
    <form class="open-row playback-mode" onsubmit={openLink}>
      <label class="link-field">YouTube<input type="url" bind:value={link} required maxlength="2048" placeholder="https://www.youtube.com/watch?v=…" /></label>
      <button type="submit" class="action" disabled={!ready || playback.loading || openingLink} onpointerup={releasePointerFocus}>{text("Open link", "Открыть ссылку")}</button>
    </form>
    {#if playback.loading || openingLink}<p class="hint" role="status">{text("Opening media…", "Открытие медиа…")}</p>{/if}
  {/if}
  {#if nativeDesktop && typeof playback.audioOnly === "boolean"}
    <div class="controls playback-mode">
      <label>{text("Mode", "Режим")}<select disabled={!ready || playback.loading} value={playback.audioOnly ? "audio" : "video"} onchange={event => command({ type: "audio-only", value: event.currentTarget.value === "audio" })}><option value="audio">{text("Listen", "Слушать")}</option><option value="video">{text("Watch", "Смотреть")}</option></select></label>
      {#if playback.backend}<span class="hint">{text("Player", "Плеер")}: {playback.backend === "iina" ? "IINA" : "mpv"}</span>{/if}
    </div>
  {/if}
  {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
  {#if playback.videoLoading}<p class="hint" role="status">{text("Opening video. Audio keeps playing; the picture will join at the current position.", "Подключение видео. Звук продолжает идти; изображение появится на текущей позиции.")}</p>{/if}
  {#if nativeDesktop}
    <details open={playerPathFailure}>
      <summary>{text("Player settings", "Настройки плеера")}</summary>
      <form class="controls playback-mode" onsubmit={async event => { event.preventDefault(); savingMpvPath = true; try { await command({ type: "mpv-path", value: mpvPath }); } finally { savingMpvPath = false; } }}>
        <label class="link-field">{text("Path to mpv", "Путь к mpv")}<input type="text" bind:value={mpvPath} maxlength="32768" placeholder={mpvExample} autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="action" disabled={!ready || playback.loading || savingMpvPath} onclick={browseMpv} onpointerup={releasePointerFocus}>{text("Browse…", "Обзор…")}</button>
        <button type="submit" class="action" disabled={!ready || playback.loading || savingMpvPath} onpointerup={releasePointerFocus}>{text("Apply", "Применить")}</button>
      </form>
      <p class="hint">{text("Leave empty for automatic search. After applying the path, press Play or reopen the file. If the player is already running, restart Shravanam to use the new path.", "Оставьте поле пустым для автоматического поиска. После применения пути нажмите «Воспроизвести» или откройте файл снова. Если плеер уже запущен, перезапустите Shravanam для использования нового пути.")}</p>
      {#if playback.systemControls?.supported}
        <p class="hint">{text("System media controls", "Системное управление")}: {playback.systemControls.available ? text("connected", "подключено") : text("unavailable", "недоступно")}. {text("Media Previous/Next use the configured time jumps.", "Медиаклавиши «Назад/Вперёд» используют заданные интервалы перемотки.")}</p>
        {#each playback.systemControls.shortcuts as shortcut}<p class="hint">{shortcut.key}: {({ toggle: text("Play/Pause", "Пауза/воспроизведение"), back: text("Seek backward", "Перемотка назад"), forward: text("Seek forward", "Перемотка вперёд"), open: text("Open window", "Открыть окно") } as Record<string, string>)[shortcut.action]}{shortcut.registered ? "" : text(" (unavailable or already in use)", " (недоступно или уже занято)")}</p>{/each}
        {#if playback.systemControls.error}<p class="error" role="alert">{playback.systemControls.error.split(" / ")[russian ? 1 : 0] ?? playback.systemControls.error}</p>{/if}
      {/if}
    </details>
  {/if}
  {#if !nativePlayer}<video bind:this={mediaElement} class:audio-only={current?.kind !== "video"} playsinline preload="metadata"><track kind="captions" /></video>{/if}
  {#if current}
    <h2>{current.name}</h2>
    {#if android && current.kind === "video"}<p class="hint">{text("Playing the audio track. Video display is not available on Android yet.", "Воспроизводится звуковая дорожка. Показ видео на Android пока не добавлен.")}</p>{/if}
    {#if nativeDesktop && current.kind === "video"}<p class="hint">{playback.audioOnly ? text("Playing only audio. Select Watch to enable video in the player window.", "Воспроизводится только звук. Выберите «Смотреть», чтобы включить видео в окне плеера.") : text("Video plays in a separate player window.", "Видео воспроизводится в отдельном окне плеера.")}</p>{/if}
    {#if current.temporary}<p class="hint">{text("This file has temporary access. For later playback, select it with Open files to request lasting access.", "Доступ к файлу временный. Для последующего воспроизведения выберите его через «Открыть файлы», чтобы запросить постоянный доступ.")}</p>{/if}
    {#if playback.loading && !nativeDesktop}<p role="status">{text("Opening media…", "Открытие файла…")}</p>{/if}
    <label class="timeline">
      <span>{formatTime(playback.time)} / {formatTime(playback.duration)}</span>
      <input aria-label={text("Playback position", "Позиция воспроизведения")} type="range" min="0" max={playback.duration || 1} step="0.1" value={playback.time} disabled={!playback.duration || playback.loading} onchange={event => command({ type: "seek", time: Number(event.currentTarget.value) })} />
    </label>
    <div class="controls">
      <button type="button" class="action" disabled={playback.loading} onclick={() => command({ type: "seek", time: Math.max(0, playback.time - playback.backward) })} onpointerup={releasePointerFocus}>−{playback.backward} {text("s", "с")}</button>
      <button type="button" class="action primary" disabled={playback.loading} onclick={() => command({ type: "toggle" })} onpointerup={releasePointerFocus}>{playback.paused ? text("Play", "Воспроизвести") : text("Pause", "Пауза")}</button>
      <button type="button" class="action" disabled={playback.loading} onclick={() => command({ type: "seek", time: playback.time + playback.forward })} onpointerup={releasePointerFocus}>+{playback.forward} {text("s", "с")}</button>
      <label>{text("Speed", "Скорость")}<select value={playback.speed} onchange={event => command({ type: "speed", value: Number(event.currentTarget.value) })}>{#each [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as speed}<option value={speed}>{speed}×</option>{/each}</select></label>
    </div>
  {/if}
  <details>
    <summary>{text("Seek intervals", "Интервалы перемотки")}</summary>
    <div class="intervals">
      <label>{text("Backward, seconds", "Назад, секунд")}<input type="number" required min="1" max="600" step="1" value={playback.backward} onchange={event => { if (event.currentTarget.reportValidity()) void command({ type: "intervals", backward: Number(event.currentTarget.value), forward: playback.forward }); }} /></label>
      <label>{text("Forward, seconds", "Вперёд, секунд")}<input type="number" required min="1" max="600" step="1" value={playback.forward} onchange={event => { if (event.currentTarget.reportValidity()) void command({ type: "intervals", backward: playback.backward, forward: Number(event.currentTarget.value) }); }} /></label>
    </div>
  </details>
  {#if playback.items.length}
    <ul>{#each playback.items as item (item.id)}<li><button type="button" class="file" aria-current={item.id === playback.currentId ? "true" : undefined} onclick={() => command({ type: "select", id: item.id })} onpointerup={releasePointerFocus}>{item.name}</button></li>{/each}</ul>
  {/if}
  {#if playback.recent?.length}
    <details>
      <summary>{text("Recent files", "Последние файлы")}</summary>
      <p class="hint">{text("The last file opens paused on startup when file access is available.", "При запуске последний файл открывается на паузе, если доступ к нему сохранён.")}</p>
      <ul>{#each playback.recent as item (item.id)}<li><button type="button" class="file" disabled={!ready} onclick={() => command({ type: "recent", id: item.id })} onpointerup={releasePointerFocus}>{item.name}{item.temporary ? text(" · access may need renewal", " · может потребоваться доступ заново") : ""}</button></li>{/each}</ul>
    </details>
  {/if}
  {#if nativeDesktop && playback.recentLinks?.length}
    <details>
      <summary>{text("Recent YouTube links", "Последние ссылки YouTube")}</summary>
      <ul>{#each playback.recentLinks as item (item.id)}<li><button type="button" class="file" disabled={!ready || playback.loading} onclick={() => command({ type: "select", id: item.id })} onpointerup={releasePointerFocus}>{item.name}</button></li>{/each}</ul>
    </details>
  {/if}
  {#if !nativeDesktop && !Capacitor.isNativePlatform()}
    <LibraryTools enabled={ready} beforeExport={async () => { await browserPlayer?.flush(); }} beforeChange={stopBrowser} afterChange={startBrowser} />
  {/if}
  {#if nativeDesktop && nativeLibrary}
    <LibraryPanel library={nativeLibrary.library} currentMediaId={playback.libraryMediaId ?? null} time={playback.time} duration={playback.duration} loading={libraryLoading || playback.loading} oncommand={libraryCommand} onseek={time => command({ type: "seek", time })} onplay={(mediaId, playlistId) => libraryCommand({ type: "play", mediaId, ...(playlistId ? { playlistId } : {}) })} />
    <NativeLibraryTools state={nativeLibrary} onrefresh={refreshLibrary} />
  {/if}
  {#if nativeDesktop && playback.sleep}<SleepPanel state={playback.sleep} oncommand={async action => { playback = await desktopPlayer()!.sleepCommand(action); }} onseek={time => { void command({ type: "seek", time }); }} />{/if}
  {#if libraryError}<p class="error" role="alert">{libraryError}</p>{/if}
  {#if desktop}<div class="controls playback-mode"><button type="button" class="action" onclick={backgroundWindow} onpointerup={releasePointerFocus}>{text("Continue in background", "Продолжить в фоне")}</button><span class="hint">{text("Reopen and control playback from the tray. Close exits the app.", "Открыть окно и управлять воспроизведением можно из трея. Кнопка закрытия завершает приложение.")}</span></div>{/if}
  {#if backgroundError}<p class="error" role="alert">{backgroundError}</p>{/if}
</section>

<style>
  section { margin-top: 28px; padding: 16px; border-radius: 10px; background: #141414; }
  section.dragging { background: #322a18; }
  .open-row, .controls, .intervals { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .open-row span, summary, label { font-size: 13px; color: #aaa; }
  .action { padding: 8px 12px; border-radius: 6px; background: #292929; }
  .primary { color: #fec965; }
  .playback-mode { margin-top: 12px; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  video { display: block; width: 100%; max-height: 420px; margin-top: 16px; background: #000; }
  video.audio-only { display: none; }
  h2 { font-size: 18px; overflow-wrap: anywhere; font-weight: 500; }
  .timeline { display: grid; gap: 8px; margin: 16px 0; }
  .timeline input { width: 100%; accent-color: #fec965; }
  label { display: flex; align-items: center; gap: 8px; }
  select, input[type="number"], input[type="url"], input[type="text"] { padding: 6px; background: #292929; color: #eee; border: none; border-radius: 4px; }
  .link-field { flex: 1; min-width: 180px; }
  input[type="url"], input[type="text"] { flex: 1; min-width: 0; }
  input[type="number"] { width: 80px; }
  details { margin-top: 20px; }
  summary { cursor: pointer; }
  .intervals { margin-top: 12px; }
  ul { padding: 0; list-style: none; margin: 20px 0 0; }
  .file { width: 100%; text-align: left; padding: 10px; border-radius: 5px; background: transparent; overflow-wrap: anywhere; }
  .file[aria-current="true"] { background: #292929; color: #fec965; }
  .error { color: #ffb3a7; line-height: 1.5; }
  .hint { color: #aaa; font-size: 13px; line-height: 1.5; }
</style>
