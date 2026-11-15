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
    backgroundWindow: (language?: "en" | "ru") => Promise<null>;
    chooseMedia: () => Promise<import("./playback").PlaybackState>;
    chooseMpv: () => Promise<{ path: string | null }>;
    getPlaybackState: () => Promise<import("./playback").PlaybackState>;
    playbackCommand: (command: import("./playback").PlaybackCommand) => Promise<import("./playback").PlaybackState>;
    libraryRequest: (request: import("./library-client").LibraryRequest) => Promise<any>;
    sleepCommand: (command: import("./sleep").SleepCommand) => Promise<import("./playback").PlaybackState>;
  };
}
