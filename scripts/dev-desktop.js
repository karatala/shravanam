import { resolve } from "node:path";
import { buildWeb } from "./build-web.js";
import { runDesktop } from "../desktop/main.js";

const root = await buildWeb(true);
const files = await Bun.file(resolve(root, "asset-list.json")).json();
console.log("Shravanam native desktop: http://127.0.0.1:47870. Close the existing desktop instance before debugging. Restart this terminal after source changes.");
await runDesktop(Object.fromEntries(files.map(filename => [`/${filename}`, resolve(root, filename)])), { development: true });
