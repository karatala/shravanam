import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";

const finite = value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
function validBounds(bounds) {
  return bounds && Object.keys(bounds).sort().join(",") === "height,width,x,y" && [bounds.x, bounds.y, bounds.width, bounds.height].every(finite) && bounds.width > 0 && bounds.height > 0;
}
function validState(value) {
  return value && Object.keys(value).sort().join(",") === "maximized,normal,version" && value.version === 1 && typeof value.maximized === "boolean" && (value.normal === null || validBounds(value.normal));
}
function monitorBounds(monitor) {
  return monitor && finite(monitor.position?.x) && finite(monitor.position?.y) && finite(monitor.size?.width) && monitor.size.width > 0 && finite(monitor.size?.height) && monitor.size.height > 0 && finite(monitor.scaleFactor) && monitor.scaleFactor > 0;
}
function fitBounds(bounds, window) {
  const monitors = window.getAvailableMonitors().filter(monitorBounds);
  if (!monitors.length) return null;
  const overlap = monitor => Math.max(0, Math.min(bounds.x + bounds.width * monitor.scaleFactor, monitor.position.x + monitor.size.width) - Math.max(bounds.x, monitor.position.x)) * Math.max(0, Math.min(bounds.y + bounds.height * monitor.scaleFactor, monitor.position.y + monitor.size.height) - Math.max(bounds.y, monitor.position.y));
  const primary = window.getPrimaryMonitor();
  let selected = monitors.find(monitor => monitor.position.x === primary?.position.x && monitor.position.y === primary?.position.y) ?? monitors[0];
  let area = 0;
  for (const monitor of monitors) { const candidate = overlap(monitor); if (candidate > area) { selected = monitor; area = candidate; } }
  const width = Math.min(bounds.width, selected.size.width / selected.scaleFactor);
  const height = Math.min(bounds.height, selected.size.height / selected.scaleFactor);
  const physicalX = Math.round(Math.min(Math.max(bounds.x, selected.position.x), selected.position.x + selected.size.width - width * selected.scaleFactor));
  const physicalY = Math.round(Math.min(Math.max(bounds.y, selected.position.y), selected.position.y + selected.size.height - height * selected.scaleFactor));
  return { x: physicalX, y: physicalY, width, height };
}

export async function createWindowState(profile) {
  const filename = join(profile, "window.json");
  let state = { version: 1, normal: null, maximized: false };
  let written = "";
  try {
    if ((await stat(filename)).size > 65536) throw new Error("Window settings are too large");
    const saved = JSON.parse(await readFile(filename, "utf8"));
    if (!validState(saved)) throw new Error("Invalid window settings");
    state = saved;
    written = JSON.stringify(saved);
  } catch (error) { if (error.code !== "ENOENT") console.warn("Cannot read window settings. Move or resize the window to save new settings.", error); }
  let timer;
  let serial = Promise.resolve();
  function capture(window) {
    if (window.isDisposed() || !window.isVisible() || window.isMinimized() || window.fullscreen !== null && window.fullscreen !== undefined || window.simpleFullscreen()) return false;
    const maximized = window.isMaximized();
    if (maximized) { state = { ...state, maximized: true }; return true; }
    const position = window.getPosition(false);
    const size = window.getInnerSize(true);
    const normal = { x: position.x, y: position.y, width: size.width, height: size.height };
    if (!validBounds(normal)) return false;
    state = { version: 1, normal, maximized: false };
    return true;
  }
  function save() {
    const result = serial.then(async () => {
      const source = JSON.stringify(state);
      if (source === written || !state.normal && !state.maximized) return true;
      try {
        await writeFile(`${filename}.pending`, source, { mode: 0o600 });
        await rename(`${filename}.pending`, filename);
        written = source;
        return true;
      } catch (error) { console.warn("Cannot save window position. Check free space and write access to the Shravanam profile, then move or resize the window to retry.", error); return false; }
    });
    serial = result.then(() => {});
    return result;
  }
  return {
    restore(window) {
      if (window.isDisposed() || !state.normal && !state.maximized) return false;
      if (state.normal) {
        const fitted = fitBounds(state.normal, window);
        if (!fitted) return false;
        window.setSize(fitted.width, fitted.height, true);
        window.setPosition(fitted.x, fitted.y, false);
      }
      if (state.maximized) window.setMaximized(true);
      return true;
    },
    capture,
    schedule(window) {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; try { capture(window); void save(); } catch (error) { console.warn("Cannot read window position. Keep the window open and try moving it again.", error); } }, 200);
    },
    async flush(window) {
      clearTimeout(timer);
      timer = undefined;
      await new Promise(resolve => setImmediate(resolve));
      try { capture(window); }
      catch (error) { console.warn("Cannot read window position. Keep the window open and try moving it again.", error); return false; }
      return save();
    },
  };
}
