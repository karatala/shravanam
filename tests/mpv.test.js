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
