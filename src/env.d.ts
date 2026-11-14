interface Window {
  shravanamDesktopHost?: boolean;
  shravanamOfflineEnabled?: boolean;
  showStartupError: () => void;
  shravanamDesktop?: {
    minimizeWindow: () => Promise<null>;
    toggleMaximized: () => Promise<null>;
    requestWindowClose: () => Promise<null>;
  };
}
