import { registerPlugin } from "@capacitor/core";
import type { PlaybackCommand, PlaybackState } from "./playback";

interface AndroidPlayerPlugin {
  chooseMedia(): Promise<PlaybackState>;
  getPlaybackState(): Promise<PlaybackState>;
  playbackCommand(options: { command: PlaybackCommand }): Promise<PlaybackState>;
  openBrowser(options: { url?: string }): Promise<void>;
}

export const androidPlayer = registerPlugin<AndroidPlayerPlugin>("ShravanamPlayer");
