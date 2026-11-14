import { homedir } from "node:os";
import { join } from "node:path";

export function desktopProfile(name = "Shravanam") {
  const root = process.platform === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : process.platform === "darwin" ? join(homedir(), "Library", "Application Support") : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(root, name);
}
