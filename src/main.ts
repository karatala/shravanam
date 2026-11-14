import { mount, tick } from "svelte";
import { installHoverInput } from "./pointer-input";
import App from "./App.svelte";

installHoverInput(window);
mount(App, { target: document.getElementById("app")! });
await tick();
document.getElementById("startup")?.remove();
document.getElementById("startup-header")?.remove();
