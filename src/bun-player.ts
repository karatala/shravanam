import type { PlaybackCommand, PlaybackState } from "./playback";

export class BunPlayerError extends Error {
  constructor(public code: "host" | "picker") { super(code); }
}

export function createBunPlayer(token: string) {
  async function request<Result = PlaybackState>(body: { method: "state" | "choose" | "choose-mpv" | "command" | "sleep"; command?: PlaybackCommand | import("./sleep").SleepCommand }): Promise<Result> {
    let response: Response;
    try { response = await fetch("/__player", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: "no-store" }); }
    catch { throw new BunPlayerError("host"); }
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new BunPlayerError(failure?.error === "picker" ? "picker" : "host");
    }
    return response.json();
  }
  return {
    getPlaybackState: () => request({ method: "state" }),
    playbackCommand: (command: PlaybackCommand) => request({ method: "command", command }),
    chooseMedia: () => request({ method: "choose" }),
    chooseMpv: () => request<{ path: string | null }>({ method: "choose-mpv" }),
    sleepCommand: (command: import("./sleep").SleepCommand) => request({ method: "sleep", command }),
  };
}
