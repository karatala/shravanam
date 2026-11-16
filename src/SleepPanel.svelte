<script lang="ts">
  import { defaultSleepSettings, defaultSpeechSettings, type SleepCommand, type SleepSettings, type SleepState, type SpeechSettings, type TimeWindow } from "./sleep";
  import { formatTime } from "./playback";
  import { releasePointerFocus } from "./pointer-input";
  let { state: sleepState, oncommand, onseek }: { state: SleepState; oncommand: (command: SleepCommand) => Promise<unknown>; onseek?: (time: number) => void } = $props();
  const russian = document.documentElement.lang === "ru";
  const text = (english: string, translation: string) => russian ? translation : english;
  let settings: SleepSettings = $state(structuredClone(defaultSleepSettings));
  let speech: SpeechSettings = $state(structuredClone(defaultSpeechSettings));
  let language = $state("ru");
  let busy = $state(false);
  let failure = $state("");
  let panel = $state<"timer" | "speech">("timer");
  const configKey = $derived(JSON.stringify({ settings: sleepState.settings, speech: sleepState.speech }));
  const languages = $derived([...new Set(sleepState.voices.map(voice => voice.language.split("-")[0]))].sort());
  const voices = $derived(sleepState.voices.filter(voice => voice.language.split("-")[0] === language));
  const days = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = russian ? ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const phase = $derived(({ idle: text("Off", "Выключен"), countdown: text("First delay", "До первого сигнала"), signal: text("Signal", "Сигнал"), repeat: text("Next signal", "До следующего сигнала"), paused: text("Paused, waiting for a response", "Пауза, ожидание ответа"), expired: text("Paused, press Play to resume", "Пауза, для продолжения нажмите Play") })[sleepState.phase]);
  $effect(() => { const config = JSON.parse(configKey); settings = config.settings; speech = config.speech; });
  function toggleDay(window: TimeWindow, day: number) { window.days = window.days.includes(day) ? window.days.filter(item => item !== day) : [...window.days, day]; }
  async function action(command: SleepCommand, saveFirst = false) {
    busy = true; failure = "";
    try {
      if (saveFirst) await oncommand({ type: "configure", settings: $state.snapshot(settings), speech: $state.snapshot(speech) });
      await oncommand(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : text("Cannot change the timer. Try again.", "Не удалось изменить таймер. Повторите.");
      failure = message.includes(" / ") ? message.split(" / ")[russian ? 1 : 0] : message;
    } finally { busy = false; }
  }
  function save() { return action({ type: "configure", settings: $state.snapshot(settings), speech: $state.snapshot(speech) }); }
</script>

<section aria-label={text("Sleep and spoken time", "Сон и озвучивание времени")}>
  <div class="status-row">
    <strong>{text("Sleep timer", "Таймер сна")}</strong>
    <span aria-live="polite">{phase}{!["idle", "expired"].includes(sleepState.phase) ? ` · ${formatTime(sleepState.remainingSeconds)}` : ""}</span>
    <div class="actions">
    <button disabled={busy || !sleepState.mediaId} onclick={() => action({ type: "start" }, true)} onpointerup={releasePointerFocus}>{text("Start timer", "Включить таймер")}</button>
    <button disabled={busy || sleepState.phase === "idle"} onclick={() => action({ type: "stop" })} onpointerup={releasePointerFocus}>{text("Stop timer", "Выключить таймер")}</button>
    <button disabled={busy || ["idle", "expired"].includes(sleepState.phase)} onclick={() => action({ type: "respond" })} onpointerup={releasePointerFocus}>{text("I am awake", "Я не сплю")}</button>
    </div>
  </div>
  {#if sleepState.marker}
    <div class="actions"><span>{text("Resume position:", "Позиция для возврата:")}</span><button disabled={!onseek} onclick={() => onseek?.(sleepState.marker!.time)} onpointerup={releasePointerFocus}>{text("Possible sleep start", "Возможное засыпание")} {formatTime(sleepState.marker.time)}</button>{#if sleepState.marker.pausedAt !== null}<button disabled={!onseek} onclick={() => onseek?.(sleepState.marker!.pausedAt!)} onpointerup={releasePointerFocus}>{text("Actual pause", "Фактическая пауза")} {formatTime(sleepState.marker.pausedAt)}</button>{/if}</div>
  {/if}
  {#if failure || sleepState.error}<p role="alert" class="error">{failure || (sleepState.error.includes(" / ") ? sleepState.error.split(" / ")[russian ? 1 : 0] : sleepState.error)}</p>{/if}
  <nav aria-label={text("Sleep settings", "Настройки сна")}>
    <button type="button" class:active={panel === "timer"} aria-pressed={panel === "timer"} onclick={() => panel = "timer"} onpointerup={releasePointerFocus}>{text("Timer", "Таймер")}</button>
    <button type="button" class:active={panel === "speech"} aria-pressed={panel === "speech"} onclick={() => panel = "speech"} onpointerup={releasePointerFocus}>{text("Spoken time", "Озвучивание времени")}</button>
  </nav>
  <form onsubmit={event => { event.preventDefault(); void save(); }}>
    {#if panel === "timer"}
      <div class="fields">
        <label>{text("First delay, min", "Первый сигнал через, мин")}<input type="number" min="1" max="240" step="1" required bind:value={settings.firstMinutes} /></label>
        <label>{text("Repeat after, min", "Повтор через, мин")}<input type="number" min="1" max="60" step="1" required bind:value={settings.repeatMinutes} /></label>
        <label>{text("Repeats after the first signal", "Повторов после первого сигнала")}<input type="number" min="0" max="10" step="1" required bind:value={settings.repeats} /></label>
        <label>{text("Signal duration, sec", "Длительность сигнала, сек")}<input type="number" min="1" max="30" step="1" required bind:value={settings.signalSeconds} /></label>
        <label>{text("Signal level", "Уровень сигнала")}<input type="range" min="0" max="1" step="0.01" bind:value={settings.signalGain} />{Math.round(settings.signalGain * 100)}%</label>
        <label>{text("Volume reduction per repeat, %", "Снижение громкости при повторе, %")}<input type="number" min="0" max="100" step="1" required bind:value={settings.reductionPercent} /></label>
        <label>{text("Response window after pause, min", "Ожидание ответа после паузы, мин")}<input type="number" min="0" max="30" step="1" required bind:value={settings.responseMinutes} /></label>
      </div>
      <label><input type="checkbox" bind:checked={settings.schedule.enabled} />{text("Activate when playback starts in this time window", "Включать при воспроизведении в это время")}</label>
      {#if settings.schedule.enabled}
        <div class="fields"><label>{text("From", "С")}<input type="time" required bind:value={settings.schedule.start} /></label><label>{text("To", "До")}<input type="time" required bind:value={settings.schedule.end} /></label></div>
        <div class="days" aria-label={text("Timer days", "Дни таймера")}>{#each days as day}<label><input type="checkbox" checked={settings.schedule.days.includes(day)} onchange={() => toggleDay(settings.schedule, day)} />{dayNames[day]}</label>{/each}</div>
      {/if}
      <p>{text("Only playing time counts. The first signal keeps the volume. Each repeat reduces the current volume. A volume increase or I am awake resets the timer and restores its starting volume. System volume and headset buttons are not tracked here.", "Считается только время воспроизведения. Первый сигнал не снижает громкость. Каждый повтор снижает текущую громкость. Повышение громкости в плеере или «Я не сплю» сбрасывает таймер и возвращает исходный уровень. Системная громкость и кнопки гарнитуры здесь не отслеживаются.")}</p>
    {:else}
      <label><input type="checkbox" bind:checked={speech.enabled} />{text("Speak the time", "Озвучивать время")}</label>
      <div class="fields">
        <label>{text("Every, min", "Каждые, мин")}<input type="number" min="1" max="120" step="1" required bind:value={speech.intervalMinutes} /></label>
        <label>{text("Clock format", "Формат часов")}<select bind:value={speech.hourFormat}><option value={24}>24</option><option value={12}>12</option></select></label>
        <label>{text("Phrase", "Фраза")}<input class="phrase" required maxlength="256" bind:value={speech.phrase} /></label>
      </div>
      <p>{text("Use {hour} and {minute}, for example: It is {hour}:{minute}. Announcements follow clock boundaries. Missed times are skipped.", "Используйте {hour} и {minute}, например: Сейчас {hour}:{minute}. Отсчёт идёт по часам. Пропущенные объявления не повторяются.")}</p>
      <div class="fields">
        <button type="button" disabled={busy} onclick={() => action({ type: "voices" })} onpointerup={releasePointerFocus}>{text("Load system voices", "Загрузить системные голоса")}</button>
        {#if languages.length}<label>{text("Language", "Язык")}<select bind:value={language} onchange={() => { const first = sleepState.voices.find(voice => voice.language.split("-")[0] === language); if (first) speech.voice = first.id; }}>{#each languages as item}<option value={item}>{item}</option>{/each}</select></label>{/if}
        <label>{text("Voice", "Голос")}<select bind:value={speech.voice}>{#if !voices.some(voice => voice.id === speech.voice)}<option value={speech.voice}>{speech.voice}</option>{/if}{#each voices as voice}<option value={voice.id}>{voice.name} ({voice.language})</option>{/each}</select></label>
        <button type="button" disabled={busy} onclick={() => action({ type: "test-voice" }, true)} onpointerup={releasePointerFocus}>{text("Test voice", "Проверить голос")}</button>
      </div>
      <label><input type="checkbox" bind:checked={speech.whilePaused} />{text("Also speak during a manual pause", "Озвучивать и при ручной паузе")}</label>
      <label><input type="checkbox" bind:checked={speech.schedule.enabled} />{text("Limit to this time window", "Только в это время")}</label>
      {#if speech.schedule.enabled}<div class="fields"><label>{text("From", "С")}<input type="time" required bind:value={speech.schedule.start} /></label><label>{text("To", "До")}<input type="time" required bind:value={speech.schedule.end} /></label></div>{/if}
      <div class="days" aria-label={text("Spoken time days", "Дни озвучивания")}>{#each days as day}<label><input type="checkbox" checked={speech.schedule.days.includes(day)} onchange={() => toggleDay(speech.schedule, day)} />{dayNames[day]}</label>{/each}</div>
      <p>{text("Uses installed system voices. Speech stops after the sleep timer pauses playback.", "Используются установленные системные голоса. После паузы по таймеру сна озвучивание не работает.")}</p>
    {/if}
    <button class="save" disabled={busy} onpointerup={releasePointerFocus}>{text("Save settings", "Сохранить настройки")}</button>
  </form>
</section>

<style>
  section { min-width: 0; }
  .status-row, .actions, .days, nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .status-row { gap: 8px 12px; margin-bottom: 12px; }
  .status-row strong { color: #eee; font-size: 13px; font-weight: 500; }
  .status-row > span { color: #aaa; }
  .status-row .actions { margin-left: auto; }
  .actions { margin: 8px 0; }
  nav { margin-bottom: 12px; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 8px 16px; margin: 10px 0; }
  .days { margin: 8px 0; }
  button { min-height: 30px; padding: 5px 9px; border-radius: 5px; background: #242424; font-size: 12px; }
  nav button { background: transparent; color: #aaa; }
  nav button.active { color: #fec965; background: #29251c; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:hover:where([data-ui-hover="true"] *):not(:disabled) { background: #383838; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #fec965; outline-offset: 2px; }
  input:not([type="checkbox"]):not([type="range"]), select { box-sizing: border-box; min-height: 30px; padding: 5px 7px; background: #242424; color: #eee; border: none; border-radius: 4px; font-size: 12px; min-width: 0; }
  input[type="number"] { width: 58px; flex-shrink: 0; }
  input[type="range"] { width: 100px; }
  .phrase { width: 220px; max-width: 100%; flex: 1; }
  label { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; color: #aaa; min-width: 0; }
  .fields label { justify-content: space-between; margin: 0; }
  p, span { font-size: 12px; line-height: 1.45; color: #999; }
  p { margin: 8px 0; }
  .save { margin-top: 4px; }
  .error { color: #ffb3a7; }
  @media (max-width: 640px) { .fields { grid-template-columns: 1fr; } .status-row .actions { margin-left: 0; width: 100%; } }
</style>
