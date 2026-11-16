import type { CapacitorConfig } from "@capacitor/cli";
import { resolveAndroidDevUrl } from "./scripts/android-dev.js";

declare const process: { env: { SHRAVANAM_ANDROID_DEV_URL?: string } };

const developmentUrl = process.env.SHRAVANAM_ANDROID_DEV_URL;
const config: CapacitorConfig = {
  appId: "org.karatala.shravanam",
  appName: "Shravanam",
  webDir: "dist",
  ...(developmentUrl === undefined ? {} : { server: { url: resolveAndroidDevUrl(developmentUrl), cleartext: true } }),
};

export default config;
