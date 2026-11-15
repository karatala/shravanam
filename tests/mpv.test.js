import { expect, test } from "bun:test";
import { MpvPlayer } from "../desktop/mpv.js";

test("end of file survives late position, pause, and duration updates", () => {
  const player = new MpvPlayer("unused", () => {});
  player.loaded = true;
  player.state.duration = 3098.641;
  player.receive({ event: "property-change", name: "eof-reached", data: true });
  player.receive({ event: "property-change", name: "time-pos", data: 3098.6 });
  player.receive({ event: "property-change", name: "pause", data: false });
  player.receive({ event: "property-change", name: "duration", data: 3098.645 });

  expect(player.state.time).toBe(player.state.duration);
  expect(player.state.paused).toBe(true);

  player.receive({ event: "property-change", name: "eof-reached", data: false });
  player.receive({ event: "property-change", name: "time-pos", data: 0.25 });
  player.receive({ event: "property-change", name: "pause", data: false });

  expect(player.state.time).toBe(0.25);
  expect(player.state.paused).toBe(false);
});

function loadPlayer() {
  const player = new MpvPlayer("unused", () => {});
  const commands = [];
  player.start = async () => {};
  player.request = async command => {
    commands.push(command);
    if (command[0] === "loadfile") player.waitForLoad.resolve();
    return command[0] === "get_property" && command[1] === "duration" ? 120 : null;
  };
  return { player, commands };
}

test("stream title is passed literally before the media loads", async () => {
  const { player, commands } = loadPlayer();
  const title = 'Ролик "Название" ${filename}';
  await player.load("https://media.example.test/video.webm", 1, 0, false, { title, headers: [] });
  const titleIdx = commands.findIndex(command => command[0] === "set_property" && command[1] === "force-media-title");
  expect(titleIdx).toBeGreaterThanOrEqual(0);
  expect(commands[titleIdx][2]).toBe(title);
  expect(titleIdx).toBeLessThan(commands.findIndex(command => command[0] === "loadfile"));
});

test("opening a local file clears the previous stream title", async () => {
  const { player, commands } = loadPlayer();
  await player.load("https://media.example.test/video.webm", 1, 0, false, { title: "YouTube title", headers: [] });
  await player.load("/local/book.mp3", 1, 0, false);
  expect(commands.filter(command => command[1] === "force-media-title").map(command => command[2])).toEqual(["YouTube title", ""]);
});
