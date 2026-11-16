import { isIP } from "node:net";
import { networkInterfaces } from "node:os";

export const androidDevPort = 3001;

function privateIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function androidDevUrls() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(entry => entry && !entry.internal && privateIPv4(entry.address)).map(entry => `http://${entry.address}:${androidDevPort}`))].sort();
}

export function resolveAndroidDevUrl(value) {
  if (value !== undefined) {
    const candidate = value.trim();
    const match = /^http:\/\/(localhost|\d{1,3}(?:\.\d{1,3}){3}):3001\/?$/i.exec(candidate);
    const hostname = match?.[1].toLowerCase();
    if (!hostname || !(hostname === "localhost" || privateIPv4(hostname) || (isIP(hostname) === 4 && hostname.startsWith("127.")))) {
      throw new Error(`Cannot use Android development URL '${candidate}'. Use HTTP with a private or loopback IPv4 address, or localhost, on port ${androidDevPort}, with no path, credentials, query, or fragment. Example: bun run prepare:android:dev --url http://192.168.1.20:${androidDevPort}.`);
    }
    return new URL(candidate).origin;
  }
  const candidates = androidDevUrls();
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`Cannot choose the Android development address because this computer has several private IPv4 addresses. Use the address on the phone's network:\n${candidates.map(url => `bun run prepare:android:dev --url ${url}`).join("\n")}`);
  }
  throw new Error(`Cannot find a private IPv4 address for Android development. Connect this computer and the phone to the same local network, then use its address explicitly. Example: bun run prepare:android:dev --url http://192.168.1.20:${androidDevPort}.`);
}
