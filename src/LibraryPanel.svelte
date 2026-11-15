<script lang="ts">
  import type { Library, LibraryRecord, Values } from "./data/model";
  import { primaryRecords, type LibraryCommand } from "./library";
  import { formatTime } from "./playback";
  import { releasePointerFocus } from "./pointer-input";
  import { parseSubtitles, parseTime, TimedTextError, timedTextError } from "./timed-text";

  let { library, currentMediaId, time, duration, loading, oncommand, onseek, onplay }: {
    library: Library;
    currentMediaId: string | null;
    time: number;
    duration: number;
    loading: boolean;
    oncommand: (command: LibraryCommand) => Promise<unknown>;
    onseek: (time: number) => Promise<unknown> | void;
    onplay: (mediaId: string, playlistId?: string) => Promise<unknown> | void;
  } = $props();
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  let busy = $state(false);
  let failure = $state("");
  let noteId = $state<string | undefined>();
  let noteTargetId = $state<string | null>(null);
  let noteText = $state("");
  let noteTimed = $state(true);
  let noteTime = $state("");
  let search = $state("");
  let chapterId = $state<string | undefined>();
  let chapterTargetId = $state<string | null>(null);
  let chapterTitle = $state("");
  let chapterStart = $state("");
  let chapterEnd = $state("");
  let playlistTitle = $state("");
  let playlistId = $state("");
  let subtitleId = $state("");
  let subtitleEditId = $state("");
  let subtitleSource = $state("");
  let subtitleLanguage = $state("");
  let subtitleTargetId = $state<string | null>(null);
  let cueLimit = $state(100);
  let subtitleInput: HTMLInputElement;
  const records = $derived(primaryRecords(library));
  const media = $derived(records.filter(record => record.kind === "media"));
  const currentSourceId = $derived(media.find(item => item.id === currentMediaId)?.value.sourceId);
  const chapters = $derived(records.filter((record): record is Extract<LibraryRecord, { kind: "chapter" }> => record.kind === "chapter" && record.value.mediaId === currentMediaId).sort((first, second) => first.value.start - second.value.start));
  const previousChapter = $derived(chapters.filter(chapter => chapter.value.start < time - 0.5).at(-1));
  const nextChapter = $derived(chapters.find(chapter => chapter.value.start > time + 0.5));
  const notes = $derived(records.filter((record): record is Extract<LibraryRecord, { kind: "note" }> => record.kind === "note" && (search ? record.value.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()) : record.value.targetId === currentMediaId || record.value.targetId === currentSourceId)));
  const alternativeNotes = $derived(library.records.filter((record): record is Extract<LibraryRecord, { kind: "note" }> => record.kind === "note" && !records.includes(record) && notes.some(note => note.id === record.id)));
  const positions = $derived(records.filter((record): record is Extract<LibraryRecord, { kind: "progress" }> => record.kind === "progress" && record.value.mediaId === currentMediaId).sort((first, second) => second.updatedAt - first.updatedAt));
  const playlists = $derived(records.filter(record => record.kind === "playlist"));
  const playlist = $derived(playlists.find(record => record.id === playlistId));
  const subtitles = $derived(records.filter((record): record is Extract<LibraryRecord, { kind: "text" }> => record.kind === "text" && (record.value.targetId === currentMediaId || record.value.targetId === currentSourceId) && record.value.role === "subtitle"));
  const subtitle = $derived(subtitles.find(record => record.id === subtitleId) ?? subtitles[0]);
  const activeCues = $derived(subtitle?.value.cues.filter(cue => cue.start <= time && time < cue.end) ?? []);
  const mediaName = (mediaId: string) => {
    const record = records.find(item => item.id === mediaId);
    return record?.kind === "media" || record?.kind === "source" ? record.value.title : mediaId;
  };
  function clockValue(seconds: number) {
    const milliseconds = Math.round(seconds * 1000);
    return `${formatTime(milliseconds / 1000)}${milliseconds % 1000 ? `.${String(milliseconds % 1000).padStart(3, "0")}` : ""}`;
  }

  async function action(operation: () => Promise<unknown> | void) {
    if (busy) return;
    busy = true; failure = "";
    try { await operation(); }
    catch (error) { console.error("Library operation failed", error); failure = timedTextError(error, russian); }
    finally { busy = false; }
  }
  function newNote() {
    noteId = undefined; noteTargetId = currentMediaId; noteText = ""; noteTimed = true; noteTime = formatTime(time);
  }
  function editNote(record: Extract<LibraryRecord, { kind: "note" }>) {
    noteId = record.id; noteTargetId = record.value.targetId; noteText = record.value.text;
    noteTimed = record.value.time !== null; noteTime = clockValue(record.value.time ?? time);
  }
  async function saveNote() {
    const targetId = noteTargetId ?? currentMediaId;
    if (!targetId || !noteText.trim()) return;
    await oncommand({ type: "save", kind: "note", id: noteId, value: { targetId, text: noteText, time: noteTimed ? parseTime(noteTime || String(time)) : null } });
    newNote();
  }
  async function openNote(record: Extract<LibraryRecord, { kind: "note" }>) {
    const target = media.find(item => item.id === record.value.targetId || item.value.sourceId === record.value.targetId);
    if (!target) { failure = text("Cannot open this note's source yet. Open its video or file first, then select the note again.", "Источник этой заметки пока не открыт. Сначала откройте его ролик или файл, затем выберите заметку снова."); return; }
    if (target.id !== currentMediaId) await onplay(target.id);
    if (record.value.time !== null) await onseek(record.value.time);
  }
  function newChapter() {
    chapterId = undefined; chapterTargetId = currentMediaId; chapterTitle = ""; chapterStart = formatTime(time); chapterEnd = formatTime(Math.max(duration, time));
  }
  function editChapter(record: Extract<LibraryRecord, { kind: "chapter" }>) {
    chapterId = record.id; chapterTargetId = record.value.mediaId; chapterTitle = record.value.title;
    chapterStart = clockValue(record.value.start); chapterEnd = clockValue(record.value.end);
  }
  async function saveChapter() {
    const mediaId = chapterTargetId ?? currentMediaId;
    if (!mediaId || !chapterTitle.trim()) return;
    const start = parseTime(chapterStart || String(time));
    const end = parseTime(chapterEnd || String(duration));
    if (end < start) throw new TimedTextError("time", `${chapterStart} - ${chapterEnd}`);
    await oncommand({ type: "save", kind: "chapter", id: chapterId, value: { mediaId, title: chapterTitle.trim(), start, end } });
    newChapter();
  }
  async function savePlaylist(mediaIds: string[]) {
    if (!playlist) return;
    await oncommand({ type: "save", kind: "playlist", id: playlist.id, value: { ...playlist.value, mediaIds } });
  }
  async function movePlaylistItem(idx: number, offset: number) {
    if (!playlist) return;
    const mediaIds = [...playlist.value.mediaIds];
    const [mediaId] = mediaIds.splice(idx, 1); mediaIds.splice(idx + offset, 0, mediaId);
    await savePlaylist(mediaIds);
  }
  async function importSubtitles(file?: File) {
    if (!file || !currentMediaId) return;
    const targetId = currentMediaId;
    try {
      if (file.size > 1000000) throw new TimedTextError("size");
      const original = await file.text();
      const cues = parseSubtitles(original);
      await oncommand({ type: "save", kind: "text", value: { targetId, role: "subtitle", language: subtitleLanguage, original, edited: null, cues } });
    } finally { subtitleInput.value = ""; }
  }
  function editSubtitle() {
    if (!subtitle) return;
    subtitleEditId = subtitle.id; subtitleTargetId = subtitle.value.targetId;
    subtitleSource = subtitle.value.edited ?? subtitle.value.original; subtitleLanguage = subtitle.value.language;
  }
  async function saveSubtitle() {
    const record = records.find(record => record.id === subtitleEditId && record.kind === "text");
    if (!record || record.kind !== "text" || record.value.targetId !== subtitleTargetId) return;
    const value: Values["text"] = { ...record.value, language: subtitleLanguage, edited: subtitleSource, cues: parseSubtitles(subtitleSource) };
    await oncommand({ type: "save", kind: "text", id: record.id, value });
    subtitleEditId = "";
  }
</script>

<section aria-label={text("Library", "Библиотека")}>
  <h2>{text("Library", "Библиотека")}</h2>
  {#if failure}<p class="error" role="alert">{failure}</p>{/if}
  {#if positions.length}<details>
    <summary>{text("Saved positions", "Сохранённые позиции")} · {positions.length}</summary>
    <ul>{#each positions as position (position.id)}<li><button class="entry" disabled={busy || loading} onclick={() => action(() => onseek(position.value.position))} onpointerup={releasePointerFocus}>{formatTime(position.value.position)} · {new Date(position.updatedAt).toLocaleString(russian ? "ru" : "en")}{position.value.completed ? text(" · completed", " · завершено") : ""}</button></li>{/each}</ul>
  </details>{/if}
  <details>
    <summary>{text("Chapters", "Главы")} · {chapters.length}</summary>
    <div class="actions">
      <button disabled={busy || loading || !previousChapter} onclick={() => action(() => onseek(previousChapter!.value.start))} onpointerup={releasePointerFocus}>{text("Previous chapter", "Предыдущая глава")}</button>
      <button disabled={busy || loading || !nextChapter} onclick={() => action(() => onseek(nextChapter!.value.start))} onpointerup={releasePointerFocus}>{text("Next chapter", "Следующая глава")}</button>
      <button disabled={busy || !currentMediaId} onclick={newChapter} onpointerup={releasePointerFocus}>{text("New chapter here", "Новая глава здесь")}</button>
    </div>
    {#if currentMediaId}
      <form onsubmit={event => { event.preventDefault(); void action(saveChapter); }}>
        <label class="wide">{text("Title", "Название")}<input required maxlength="4096" bind:value={chapterTitle} oninput={() => { chapterTargetId ??= currentMediaId; }} /></label>
        <label>{text("Start", "Начало")}<input class="clock" required placeholder={formatTime(time)} bind:value={chapterStart} /></label>
        <label>{text("End", "Конец")}<input class="clock" required placeholder={formatTime(duration)} bind:value={chapterEnd} /></label>
        <button disabled={busy || !chapterTitle.trim()} onpointerup={releasePointerFocus}>{chapterId ? text("Save chapter", "Сохранить главу") : text("Add chapter", "Добавить главу")}</button>
      </form>
      {#if chapterTargetId && chapterTargetId !== currentMediaId}<p>{text("Editing a chapter for", "Глава для")} {mediaName(chapterTargetId)}</p>{/if}
    {/if}
    <ol>{#each chapters as chapter (chapter.id)}<li class:current={time >= chapter.value.start && time < chapter.value.end}>
      <button class="entry" disabled={busy || loading} onclick={() => action(() => onseek(chapter.value.start))} onpointerup={releasePointerFocus}>{formatTime(chapter.value.start)} · {chapter.value.title}</button>
      <button disabled={busy} onclick={() => editChapter(chapter)} onpointerup={releasePointerFocus}>{text("Edit", "Изменить")}</button>
    </li>{/each}</ol>
  </details>

  <details>
    <summary>{text("Playlists", "Плейлисты")} · {playlists.length}</summary>
    <form onsubmit={event => { event.preventDefault(); void action(async () => { await oncommand({ type: "save", kind: "playlist", value: { title: playlistTitle.trim(), mediaIds: currentMediaId ? [currentMediaId] : [] } }); playlistTitle = ""; }); }}>
      <label class="wide">{text("New playlist", "Новый плейлист")}<input required maxlength="4096" bind:value={playlistTitle} /></label>
      <button disabled={busy || !playlistTitle.trim()} onpointerup={releasePointerFocus}>{text("Create", "Создать")}</button>
    </form>
    {#if playlists.length}
      <div class="actions"><select aria-label={text("Playlist", "Плейлист")} bind:value={playlistId}><option value="">{text("Select a playlist", "Выберите плейлист")}</option>{#each playlists as item (item.id)}<option value={item.id}>{item.value.title}</option>{/each}</select>
        <button disabled={busy || !playlist || !currentMediaId || playlist.value.mediaIds.includes(currentMediaId)} onclick={() => action(() => savePlaylist([...playlist!.value.mediaIds, currentMediaId!]))} onpointerup={releasePointerFocus}>{text("Add current item", "Добавить текущий файл")}</button>
      </div>
    {/if}
    {#if playlist}<ol>{#each playlist.value.mediaIds as mediaId, idx}<li>
      <button class="entry" disabled={busy || loading} onclick={() => action(() => onplay(mediaId, playlist!.id))} onpointerup={releasePointerFocus}>{mediaName(mediaId)}</button>
      <button aria-label={text("Move up", "Выше")} disabled={busy || idx === 0} onclick={() => action(() => movePlaylistItem(idx, -1))} onpointerup={releasePointerFocus}>↑</button>
      <button aria-label={text("Move down", "Ниже")} disabled={busy || idx === playlist.value.mediaIds.length - 1} onclick={() => action(() => movePlaylistItem(idx, 1))} onpointerup={releasePointerFocus}>↓</button>
      <button disabled={busy} onclick={() => action(() => savePlaylist(playlist!.value.mediaIds.filter((itemMediaId, itemIdx) => itemIdx !== idx)))} onpointerup={releasePointerFocus}>{text("Remove from playlist", "Убрать из плейлиста")}</button>
    </li>{/each}</ol>{/if}
  </details>

  <details>
    <summary>{text("Notes", "Заметки")}</summary>
    <label class="search">{text("Search all notes", "Поиск по всем заметкам")}<input type="search" bind:value={search} /></label>
    <button disabled={busy || !currentMediaId} onclick={newNote} onpointerup={releasePointerFocus}>{text("New note here", "Новая заметка здесь")}</button>
    {#if currentMediaId || noteTargetId}<form class="editor" onsubmit={event => { event.preventDefault(); void action(saveNote); }}>
      <label>{text("Note", "Заметка")}<textarea required maxlength="1000000" bind:value={noteText} oninput={() => { noteTargetId ??= currentMediaId; }}></textarea></label>
      <div class="actions"><label><input type="checkbox" bind:checked={noteTimed} />{text("At time", "На позиции")}</label>
        {#if noteTimed}<input class="clock" aria-label={text("Note time", "Время заметки")} placeholder={formatTime(time)} bind:value={noteTime} />{/if}
        <button disabled={busy || !noteText.trim()} onpointerup={releasePointerFocus}>{noteId ? text("Save note", "Сохранить заметку") : text("Add note", "Добавить заметку")}</button>
      </div>
      {#if noteTargetId && noteTargetId !== currentMediaId}<p>{text("Editing a note for", "Заметка для")} {mediaName(noteTargetId)}</p>{/if}
    </form>{/if}
    <ul>{#each notes as note (note.id)}<li>
      <button class="entry note" disabled={busy || loading} onclick={() => action(() => openNote(note))} onpointerup={releasePointerFocus}>{#if search}{mediaName(note.value.targetId)} · {/if}{note.value.time !== null ? `${formatTime(note.value.time)} · ` : ""}{note.value.text}</button>
      <button disabled={busy} onclick={() => editNote(note)} onpointerup={releasePointerFocus}>{text("Edit", "Изменить")}</button>
    </li>{/each}</ul>
    {#if alternativeNotes.length}<details><summary>{text("Other saved note versions", "Другие сохранённые версии заметок")} · {alternativeNotes.length}</summary>
      <p>{text("All versions stay in the data archive. Edit and save a version to make it current.", "Все версии сохраняются в архиве данных. Измените и сохраните нужную версию, чтобы сделать её текущей.")}</p>
      <ul>{#each alternativeNotes as note}<li><span class="note">{new Date(note.updatedAt).toLocaleString(russian ? "ru" : "en")} · {note.value.text}</span><button disabled={busy} onclick={() => editNote(note)} onpointerup={releasePointerFocus}>{text("Edit this version", "Изменить эту версию")}</button></li>{/each}</ul>
    </details>{/if}
  </details>

  <details>
    <summary>{text("Subtitles", "Субтитры")} · {subtitles.length}</summary>
    <div class="actions"><label>{text("Language", "Язык")}<input maxlength="128" placeholder="ru" bind:value={subtitleLanguage} /></label>
      <button disabled={busy || !currentMediaId} onclick={() => subtitleInput.click()} onpointerup={releasePointerFocus}>{text("Import SRT / VTT", "Импорт SRT / VTT")}</button>
      <input hidden type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" bind:this={subtitleInput} onchange={() => void action(() => importSubtitles(subtitleInput.files?.[0]))} />
    </div>
    {#if subtitle}
      <div class="actions"><select aria-label={text("Subtitle track", "Дорожка субтитров")} value={subtitle.id} onchange={event => { subtitleId = event.currentTarget.value; cueLimit = 100; }}>
        {#each subtitles as item, idx (item.id)}<option value={item.id}>{item.value.language || text("Track", "Дорожка")} {idx + 1}{item.value.edited !== null ? text(" (edited)", " (изменена)") : ""}</option>{/each}
      </select><button disabled={busy} onclick={editSubtitle} onpointerup={releasePointerFocus}>{text("Edit subtitles", "Изменить субтитры")}</button></div>
      <div class="active-cue" aria-label={text("Current subtitles", "Текущие субтитры")}>{#each activeCues as cue}<p>{cue.text}</p>{/each}</div>
      <details><summary>{text("All subtitle lines", "Все строки субтитров")}</summary><ul class="cues">{#each subtitle.value.cues.slice(0, cueLimit) as cue}<li><button class="entry" disabled={busy || loading} onclick={() => action(() => onseek(cue.start))} onpointerup={releasePointerFocus}>{formatTime(cue.start)} · {cue.text}</button></li>{/each}</ul>{#if cueLimit < subtitle.value.cues.length}<button onclick={() => { cueLimit += 100; }} onpointerup={releasePointerFocus}>{text("Show 100 more", "Ещё 100 строк")}</button>{/if}</details>
      <details><summary>{text("Original subtitle text", "Исходный текст субтитров")}</summary><pre>{subtitle.value.original}</pre></details>
    {/if}
    {#if subtitleEditId}<form class="editor" onsubmit={event => { event.preventDefault(); void action(saveSubtitle); }}>
      <label>{text("Edited SRT / VTT. The original is kept.", "Изменённый SRT / VTT. Исходный текст сохраняется.")}<textarea class="subtitle-editor" required maxlength="1000000" spellcheck="false" bind:value={subtitleSource}></textarea></label>
      <div class="actions"><button disabled={busy} onpointerup={releasePointerFocus}>{text("Save subtitles", "Сохранить субтитры")}</button><button type="button" disabled={busy} onclick={() => { subtitleEditId = ""; }} onpointerup={releasePointerFocus}>{text("Cancel", "Отмена")}</button></div>
    </form>{/if}
  </details>
  {#if !currentMediaId}<p>{text("Open a file or YouTube video to add chapters, notes, and subtitles.", "Откройте файл или ролик YouTube, чтобы добавить главы, заметки и субтитры.")}</p>{/if}
</section>

<style>
  section { margin-top: 28px; padding: 16px; border-radius: 10px; background: #141414; }
  h2 { margin-top: 0; font-size: 18px; font-weight: 500; }
  details { margin-top: 18px; }
  summary { cursor: pointer; }
  form, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
  button { padding: 8px 12px; border-radius: 6px; background: #292929; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  input:not([type="checkbox"]), select, textarea { padding: 6px; background: #292929; color: #eee; border: none; border-radius: 4px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #aaa; }
  .wide { flex: 1; min-width: 180px; }
  .wide input { flex: 1; min-width: 0; }
  .clock { width: 90px; }
  p, summary, li { font-size: 13px; line-height: 1.5; color: #bbb; }
  ul, ol { padding: 0; list-style: none; }
  li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; overflow-wrap: anywhere; }
  .entry { text-align: start; flex: 1; min-width: 120px; }
  .current .entry { background: #40331c; color: #fec965; }
  .editor { display: block; }
  .editor > label { display: block; }
  textarea { box-sizing: border-box; display: block; width: 100%; min-height: 80px; margin-top: 8px; resize: vertical; }
  .subtitle-editor { min-height: 240px; font-family: monospace; }
  .note, .active-cue, pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .search { margin: 12px 0; flex-wrap: wrap; }
  .search input { flex: 1; min-width: 150px; }
  .active-cue { margin-top: 12px; padding: 4px 12px; background: #202020; border-radius: 6px; }
  .cues { max-height: 300px; overflow: auto; }
  pre { max-height: 220px; overflow: auto; font-size: 12px; }
  .error { color: #ffb3a7; }
</style>
