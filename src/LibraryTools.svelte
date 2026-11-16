<script lang="ts">
  import { onMount } from "svelte";
  import { browserLibrary } from "./data/browser-store";
  import { decodeArchive, encodeArchive, mergeLibraries, type Archive } from "./data/archive";
  import { canonical, DataError, MAX_BYTES, type Library } from "./data/model";
  import { releasePointerFocus } from "./pointer-input";

  let { enabled, beforeExport, beforeChange, afterChange }: { enabled: boolean; beforeExport: () => Promise<void>; beforeChange: () => Promise<void>; afterChange: () => Promise<void> } = $props();
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  let input: HTMLInputElement;
  let dialog: HTMLDialogElement;
  let busy = $state(false);
  let dialogOpen = $state(false);
  let message = $state("");
  let failure = $state("");
  let warnings = $state(0);
  let previousDate = $state<number | null>(null);
  let preferIncoming = $state(false);
  let preview = $state.raw<{ archive?: Archive; recovery?: { createdAt: number; library: Library }; local: Library } | null>(null);
  const counts = $derived(preview?.archive ? mergeLibraries(preview.local, preview.archive.payload, preferIncoming) : null);
  const date = (value: number) => new Date(value).toLocaleString(russian ? "ru" : "en");

  function report(error: unknown) {
    console.error("Library operation failed", error);
    const code = error instanceof DataError ? error.code : "storage";
    if (code === "size") failure = text("The data exceeds the 16 MiB or 20,000-record limit. Use a smaller archive.", "Данные превышают лимит 16 МиБ или 20 000 записей. Выберите архив меньшего размера.");
    else if (code === "version") failure = text("This archive version is not supported. Update the app or export with a compatible version.", "Версия архива не поддерживается. Обновите приложение или экспортируйте данные совместимой версией.");
    else if (code === "integrity") failure = text("The archive is damaged or was edited. Export it again from the source app.", "Архив повреждён или был изменён. Экспортируйте его заново из исходного приложения.");
    else if (["format", "reference", "identity"].includes(code)) failure = text("Cannot import this archive: its records or links are invalid. Choose an unmodified Shravanam data archive (.json).", "Не удалось импортировать архив: записи или связи между ними некорректны. Выберите неизменённый архив данных Shravanam (.json).");
    else if (code === "changed") failure = text("The library or recovery copy changed in another window. Close this preview and open it again.", "Библиотека или резервная копия изменена в другом окне. Закройте предпросмотр и откройте его снова.");
    else failure = text("Cannot read or save library data. Check free storage and browser storage permissions, then try again.", "Не удалось прочитать или сохранить данные. Проверьте свободное место и доступ браузера к хранилищу, затем повторите попытку.");
  }
  async function refresh() {
    const library = await browserLibrary();
    previousDate = (await library.recovery())?.createdAt ?? null;
    warnings = await library.migrationWarnings();
  }
  onMount(() => { void refresh().catch(report); });

  async function exportData() {
    busy = true; failure = ""; message = "";
    try {
      await beforeExport();
      const library = await browserLibrary();
      const archive = await encodeArchive(await library.snapshot());
      const url = URL.createObjectURL(new Blob([archive], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `shravanam-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      message = text("Archive prepared. Keep the downloaded file outside the browser.", "Архив подготовлен. Сохраните скачанный файл отдельно от браузера.");
    } catch (error) { report(error); }
    finally { busy = false; }
  }
  async function inspect(file?: File) {
    if (!file) return;
    busy = true; failure = ""; message = "";
    try {
      if (file.size > MAX_BYTES) throw new DataError("size");
      const archive = await decodeArchive(await file.text());
      const library = await browserLibrary();
      const local = await library.snapshot();
      mergeLibraries(local, archive.payload);
      preferIncoming = false;
      preview = { archive, local };
      dialogOpen = true; dialog.showModal();
    } catch (error) { report(error); }
    finally { busy = false; input.value = ""; }
  }
  async function inspectPrevious() {
    busy = true; failure = ""; message = "";
    try {
      const library = await browserLibrary();
      const recovery = await library.recovery();
      if (!recovery) throw new DataError("storage");
      preview = { recovery, local: await library.snapshot() };
      dialogOpen = true; dialog.showModal();
    } catch (error) { report(error); }
    finally { busy = false; }
  }
  async function apply() {
    if (!preview) return;
    const selected = preview;
    busy = true; failure = "";
    let stopped = false;
    try {
      stopped = true;
      await beforeChange();
      const library = await browserLibrary();
      if (selected.archive) {
        const changed = await library.importLibrary(selected.archive.payload, preferIncoming);
        message = changed ? text("Data imported. Reopen your media file to continue.", "Данные импортированы. Откройте медиафайл снова для продолжения.") : text("These records are already present. No data was added.", "Эти записи уже есть. Новые данные не добавлены.");
      } else if (selected.recovery) {
        await library.restorePrevious(canonical(selected.recovery));
        message = text("Previous data restored. The replaced data remains in the local recovery copy.", "Предыдущие данные восстановлены. Заменённые данные сохранены в локальной резервной копии.");
      }
      dialog.close();
      await refresh();
    } catch (error) { report(error); }
    finally {
      if (stopped) { try { await afterChange(); } catch (error) { report(error); } }
      busy = false;
    }
  }
</script>

<section class="library-tools" aria-label={text("Data and backups", "Данные и резервные копии")}>
  <h3>{text("Data and backups", "Данные и резервные копии")}</h3>
  <p>{text("Save browser library data as a portable archive. Audio and video files are not included.", "Сохраните данные библиотеки браузера в переносимый архив. Аудио и видеофайлы в него не входят.")}</p>
  {#if warnings}<p class="error">{text(`Could not migrate ${warnings} old entries. Their original browser data is retained, but these entries are not in the archive.`, `Не удалось перенести старые записи: ${warnings}. Исходные данные сохранены в браузере, но эти записи не попадут в архив.`)}</p>{/if}
  <div class="actions">
    <button type="button" disabled={busy || !enabled} onclick={exportData} onpointerup={releasePointerFocus}>{text("Export data", "Экспорт данных")}</button>
    <button type="button" disabled={busy || !enabled} onclick={() => input.click()} onpointerup={releasePointerFocus}>{text("Import archive", "Импорт архива")}</button>
    {#if previousDate !== null}<button type="button" disabled={busy || !enabled} onclick={inspectPrevious} onpointerup={releasePointerFocus}>{text("Previous local copy", "Предыдущая локальная копия")}</button>{/if}
  </div>
  <input bind:this={input} type="file" accept=".json,application/json" hidden onchange={() => void inspect(input.files?.[0])} />
  {#if previousDate !== null}<p>{text("Local copy", "Локальная копия")}: {date(previousDate)}</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
  {#if failure && !dialogOpen}<p class="error" role="alert">{failure}</p>{/if}
</section>

<dialog bind:this={dialog} oncancel={event => { if (busy) event.preventDefault(); }} onclose={() => { dialogOpen = false; preview = null; }} aria-label={text("Review library changes", "Проверка изменений библиотеки")}>
  {#if preview}
    <h2>{preview.archive ? text("Import archive", "Импорт архива") : text("Restore previous copy", "Восстановить предыдущую копию")}</h2>
    <p>{text("Created", "Создано")}: {date(preview.archive?.createdAt ?? preview.recovery!.createdAt)}</p>
    {#if counts}
      <p>{text("New records", "Новых записей")}: {counts.added}. {text("Different versions", "Разных версий")}: {counts.conflicts}. {text("Already present", "Уже есть")}: {counts.duplicates}.</p>
      <p>{text("Different versions are both retained. By default, current data stays active. The merge uses the latest local data when you confirm.", "Разные версии сохраняются обе. По умолчанию активны текущие данные. При подтверждении архив объединяется с актуальными локальными данными.")}</p>
      <label><input type="checkbox" bind:checked={preferIncoming} disabled={busy} />{text("Use archive versions for matching records", "Для совпадающих записей использовать версии из архива")}</label>
    {:else}<p>{text("The previous library will become active. Current data will be saved as the recovery copy.", "Предыдущая библиотека станет активной. Текущие данные будут сохранены как резервная копия.")}</p>{/if}
    <p>{text("Playback will stop. Reopen the media file afterward. Media files are not part of this archive.", "Воспроизведение остановится. После операции откройте медиафайл снова. Медиафайлы в архив не входят.")}</p>
    {#if failure}<p class="error" role="alert">{failure}</p>{/if}
    <div class="actions">
      <button type="button" disabled={busy} onclick={apply} onpointerup={releasePointerFocus}>{text("Apply", "Применить")}</button>
      <button type="button" disabled={busy} onclick={() => dialog.close()} onpointerup={releasePointerFocus}>{text("Cancel", "Отмена")}</button>
    </div>
  {/if}
</dialog>

<style>
  .library-tools { margin-top: 16px; }
  h3 { margin: 0 0 8px; font-size: 12px; font-weight: 500; color: #aaa; }
  p, label { font-size: 13px; line-height: 1.5; color: #bbb; }
  label { display: flex; align-items: start; gap: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { padding: 5px 10px; min-height: 30px; background: #292929; border-radius: 6px; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  dialog { width: min(520px, calc(100vw - 64px)); max-height: calc(100vh - 64px); overflow: auto; border: none; border-radius: 12px; padding: 24px; background: #171717; color: #eee; box-shadow: 0 12px 48px #0008; }
  dialog::backdrop { background: #0009; }
  h2 { margin-top: 0; font-size: 20px; }
  .error { color: #ffb3a7; }
</style>
