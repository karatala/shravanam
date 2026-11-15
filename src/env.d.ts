interface Window {
  shravanamDesktopHost?: boolean;
  shravanamBunHost?: { token: string };
  shravanamOfflineEnabled?: boolean;
  shravanamSourceTools?: boolean;
  shravanamSources?: import("./sources").SourceBridge;
  showStartupError: () => void;
  shravanamDesktop?: {
    minimizeWindow: () => Promise<null>;
    toggleMaximized: () => Promise<null>;
    requestWindowClose: () => Promise<null>;
    chooseMedia: () => Promise<import("./playback").PlaybackState>;
    getPlaybackState: () => Promise<import("./playback").PlaybackState>;
    playbackCommand: (command: import("./playback").PlaybackCommand) => Promise<import("./playback").PlaybackState>;
  };
}
