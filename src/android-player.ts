import { registerPlugin } from "@capacitor/core";
import type { PlaybackCommand, PlaybackState } from "./playback";

export type AndroidDownload = {
  id: string; sourceId: string; url: string; title: string; audioOnly: boolean; quality: number;
  status: "downloading" | "finishing" | "cancelling" | "cancelled" | "interrupted" | "ready" | "failed";
  error: string; percent: number; downloaded: number; total: number; speed: number; eta: number; part: number;
};
export type AndroidDownloadsState = { items: AndroidDownload[]; activeId: string | null };
export type AndroidDownloadCommand = { type: "start"; url: string; audioOnly: boolean; quality: number } | { type: "cancel" | "retry"; id: string };

interface AndroidPlayerPlugin {
  chooseMedia(): Promise<PlaybackState>;
  getPlaybackState(): Promise<PlaybackState>;
  playbackCommand(options: { command: PlaybackCommand }): Promise<PlaybackState>;
  openBrowser(options: { url?: string }): Promise<void>;
  showDiagnostics(): Promise<void>;
  getDownloads(): Promise<AndroidDownloadsState>;
  downloadCommand(options: { command: AndroidDownloadCommand }): Promise<AndroidDownloadsState>;
  openDownload(options: { id: string; audioOnly: boolean }): Promise<PlaybackState>;
}

export const androidPlayer = registerPlugin<AndroidPlayerPlugin>("ShravanamPlayer");
