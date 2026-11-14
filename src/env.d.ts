interface Window {
  shravanamDesktopHost?: boolean;
  shravanamOfflineEnabled?: boolean;
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
