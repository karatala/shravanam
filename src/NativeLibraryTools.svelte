<script lang="ts">
  import { canonical, DataError, MAX_BYTES } from "./data/model";
  import { libraryFailure, requestLibrary, type NativeLibraryState } from "./library-client";
  import { releasePointerFocus } from "./pointer-input";

  let { state: libraryState, onrefresh }: { state: NativeLibraryState; onrefresh: () => Promise<void> } = $props();
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  const date = (value: number) => new Date(value).toLocaleString(russian ? "ru" : "en");
  let busy = $state(false);
  let failure = $state("");
  let message = $state("");
  let dialogOpen = $state(false);
  let preferIncoming = $state(false);
  let preview = $state.raw<{ type: "import"; added: number; conflicts: number; duplicates: number; createdAt: number; token: string } | { type: "restore"; expected: string; createdAt: number } | { type: "sync"; token: string } | null>(null);
  let webdavUrl = $state("");
  let username = $state("");
  let password = $state("");
  let settingsDirty = $state(false);
  let archiveInput: HTMLInputElement;
  let dialog: HTMLDialogElement;
  const unavailable = $derived(busy || libraryState.webdav.busy);
  $effect(() => { if (!settingsDirty) { webdavUrl = libraryState.webdav.url; username = libraryState.webdav.username; } });

  function report(error: unknown) {
    console.error("Native library operation failed", error);
    const message = libraryFailure(error).split(" / ");
    failure = russian ? message.at(-1)! : message[0];
  }
  async function action(operation: () => Promise<unknown>) {
    if (unavailable) return;
    busy = true; failure = ""; message = "";
    try { await operation(); }
    catch (error) { report(error); }
    finally { busy = false; }
  }
  function showPreview(value: NonNullable<typeof preview>) {
    preview = value; preferIncoming = false; dialogOpen = true; dialog.showModal();
  }
  async function exportArchive() {
    const result = await requestLibrary({ type: "export" }) as { archive: string };
    const url = URL.createObjectURL(new Blob([result.archive], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `shravanam-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message = text("Archive prepared. Keep the downloaded file in a separate backup location.", "Архив подготовлен. Сохраните скачанный файл отдельно как резервную копию.");
  }
  async function inspectArchive(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new DataError("size");
      let archive: string;
      try { archive = JSON.stringify(JSON.parse(await file.text())); } catch { throw new DataError("format"); }
      const result = await requestLibrary({ type: "preview-import", archive }) as { added: number; conflicts: number; duplicates: number; createdAt: number; token: string };
      showPreview({ type: "import", ...result });
    } finally { archiveInput.value = ""; }
  }
  async function configureSync() {
    try {
      await requestLibrary({ type: "sync-configure", url: webdavUrl, username, password });
      await onrefresh(); settingsDirty = false;
      message = text("WebDAV connected for this app session. Review changes before synchronization.", "WebDAV подключён на время работы приложения. Перед синхронизацией проверьте изменения.");
    } finally { password = ""; }
  }
  async function inspectSync() {
    const result = await requestLibrary({ type: "sync-preview" }) as NativeLibraryState;
    await onrefresh();
    if (result.webdav.preview) showPreview({ type: "sync", token: result.webdav.preview.token });
  }
  async function applyPreview() {
    if (!preview) return;
    if (preview.type === "import") await requestLibrary({ type: "import", preferIncoming, token: preview.token });
    else if (preview.type === "restore") await requestLibrary({ type: "restore", expected: preview.expected });
    else await requestLibrary({ type: "sync-apply", preferIncoming, token: preview.token });
    await onrefresh(); dialog.close();
    message = text("Library data saved. All different versions are retained.", "Данные библиотеки сохранены. Все разные версии сохранены.");
  }
</script>

<details class="library-tools">
  <summary>{text("Data, backups, and synchronization", "Данные, резервные копии и синхронизация")}</summary>
  <p>{text("The archive contains library records, positions, playlists, chapters, notes, and subtitles. Audio and video files, local paths, website sessions, and passwords are excluded.", "Архив содержит записи библиотеки, позиции, плейлисты, главы, заметки и субтитры. Аудио и видеофайлы, локальные пути, сеансы сайтов и пароли в него не входят.")}</p>
  <div class="actions">
    <button type="button" disabled={unavailable} onclick={() => action(exportArchive)} onpointerup={releasePointerFocus}>{text("Export data", "Экспорт данных")}</button>
    <button type="button" disabled={unavailable} onclick={() => archiveInput.click()} onpointerup={releasePointerFocus}>{text("Import archive", "Импорт архива")}</button>
    {#if libraryState.recovery}<button type="button" disabled={unavailable} onclick={() => { failure = ""; showPreview({ type: "restore", expected: canonical(libraryState.recovery), createdAt: libraryState.recovery!.createdAt }); }} onpointerup={releasePointerFocus}>{text("Previous local copy", "Предыдущая локальная копия")}</button>{/if}
  </div>
  <input hidden type="file" accept=".json,application/json" bind:this={archiveInput} onchange={() => void action(() => inspectArchive(archiveInput.files?.[0]))} />
  {#if libraryState.recovery}<p>{text("Local recovery copy", "Локальная копия для восстановления")}: {date(libraryState.recovery.createdAt)}</p>{/if}

  <details>
    <summary>WebDAV</summary>
    <p>{text("Choose an existing WebDAV folder, for example https://cloud.example/remote.php/dav/files/user/Shravanam/. Use the same folder on your other devices. This app synchronizes library data manually; it does not upload media files.", "Укажите существующую папку WebDAV, например https://cloud.example/remote.php/dav/files/user/Shravanam/. На других устройствах используйте ту же папку. Приложение синхронизирует данные библиотеки вручную. Медиафайлы не отправляются.")}</p>
    <p>{text("Library data is not encrypted by the app on the server. The password stays in app memory and must be entered again after restart. It is excluded from the archive.", "Приложение не шифрует данные библиотеки на сервере. Пароль хранится в памяти приложения. После перезапуска его нужно ввести снова. В архив пароль не входит.")}</p>
    <form onsubmit={event => { event.preventDefault(); void action(configureSync); }}>
      <label>{text("WebDAV folder URL", "Адрес папки WebDAV")}<input type="url" required maxlength="8192" placeholder="https://cloud.example/Shravanam/" bind:value={webdavUrl} oninput={() => { settingsDirty = true; }} /></label>
      <label>{text("Username", "Имя пользователя")}<input maxlength="1024" autocomplete="username" bind:value={username} oninput={() => { settingsDirty = true; }} /></label>
      <label>{text("Password for this session", "Пароль на время работы")}<input type="password" maxlength="4096" autocomplete="off" bind:value={password} /></label>
      <div class="actions"><button disabled={unavailable} onpointerup={releasePointerFocus}>{libraryState.webdav.connected ? text("Reconnect", "Переподключить") : text("Connect", "Подключить")}</button>
        <button type="button" disabled={unavailable || !libraryState.webdav.connected} onclick={() => action(inspectSync)} onpointerup={releasePointerFocus}>{text("Review synchronization", "Проверить синхронизацию")}</button>
        <button type="button" disabled={unavailable || !libraryState.webdav.connected} onclick={() => action(async () => { await requestLibrary({ type: "sync-disconnect" }); await onrefresh(); password = ""; message = text("Disconnected. Local library data is kept.", "Отключено. Локальные данные библиотеки сохранены."); })} onpointerup={releasePointerFocus}>{text("Disconnect", "Отключить")}</button>
      </div>
    </form>
    <p role="status">{libraryState.webdav.connected ? text("Connected for this session", "Подключено на время работы") : text("Disconnected", "Отключено")}{libraryState.webdav.busy ? text(" · synchronizing", " · синхронизация") : ""}</p>
    {#if libraryState.webdav.lastSync !== null}<p>{text("Last synchronization", "Последняя синхронизация")}: {date(libraryState.webdav.lastSync)}</p>{/if}
  </details>
  {#if message}<p role="status">{message}</p>{/if}
  {#if failure && !dialogOpen}<p class="error" role="alert">{failure}</p>{/if}
</details>

<dialog bind:this={dialog} aria-label={text("Review library changes", "Проверка изменений библиотеки")} oncancel={event => { if (unavailable) event.preventDefault(); }} onclose={() => { dialogOpen = false; preview = null; }}>
  {#if preview}
    <h2>{preview.type === "import" ? text("Import archive", "Импорт архива") : preview.type === "restore" ? text("Restore previous copy", "Восстановить предыдущую копию") : text("Synchronize library", "Синхронизировать библиотеку")}</h2>
    {#if preview.type === "restore"}
      <p>{text("Created", "Создано")}: {date(preview.createdAt)}</p>
      <p>{text("The previous library will become active. Current data will stay in the local recovery copy.", "Предыдущая библиотека станет активной. Текущие данные останутся в локальной копии для восстановления.")}</p>
    {:else}
      {@const counts = preview.type === "import" ? preview : libraryState.webdav.preview}
      {#if preview.type === "import"}<p>{text("Created", "Создано")}: {date(preview.createdAt)}</p>{/if}
      {#if counts}<p>{text("New records", "Новых записей")}: {counts.added}. {text("Different versions", "Разных версий")}: {counts.conflicts}. {text("Already present", "Уже есть")}: {counts.duplicates}.</p>{/if}
      {#if preview.type === "sync" && libraryState.webdav.preview}<p>{text("Device snapshots", "Снимков устройств")}: {libraryState.webdav.preview.devices}</p>{/if}
      <p>{text("Different versions are both retained. Current versions remain active unless you select the option below. Local data is kept before applying changes.", "Разные версии сохраняются обе. Текущие версии остаются активными, если не выбрать пункт ниже. Перед применением изменений сохраняется локальная копия.")}</p>
      <label class="checkbox"><input type="checkbox" disabled={unavailable} bind:checked={preferIncoming} />{text("Use incoming versions for matching records", "Для совпадающих записей использовать входящие версии")}</label>
    {/if}
    <p>{text("Media files are excluded. Files from another device may need to be opened again on this device.", "Медиафайлы не входят в данные. Файлы с другого устройства может потребоваться открыть заново на этом устройстве.")}</p>
    {#if failure}<p class="error" role="alert">{failure}</p>{/if}
    <div class="actions"><button type="button" disabled={unavailable} onclick={() => action(applyPreview)} onpointerup={releasePointerFocus}>{text("Apply", "Применить")}</button><button type="button" disabled={unavailable} onclick={() => dialog.close()} onpointerup={releasePointerFocus}>{text("Cancel", "Отмена")}</button></div>
  {/if}
</dialog>

<style>
  .library-tools { margin-top: 20px; }
  details details { margin-top: 20px; }
  summary { cursor: pointer; font-size: 13px; color: #aaa; }
  p, label { font-size: 13px; line-height: 1.5; color: #bbb; }
  label { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
  .checkbox { flex-direction: row; align-items: start; }
  form { display: flex; flex-direction: column; gap: 12px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  button { padding: 8px 12px; background: #292929; border-radius: 6px; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  input:not([type="checkbox"]) { padding: 8px; background: #292929; color: #eee; border: none; border-radius: 4px; }
  dialog { width: min(520px, calc(100vw - 64px)); max-height: calc(100vh - 64px); overflow: auto; border: none; border-radius: 12px; padding: 24px; background: #171717; color: #eee; box-shadow: 0 12px 48px #0008; }
  dialog::backdrop { background: #0009; }
  h2 { margin-top: 0; font-size: 20px; }
  .error { color: #ffb3a7; }
</style>
