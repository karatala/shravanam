const revision = new URL(import.meta.url).searchParams.get("revision");
let pending = false;
let refreshTimer;

async function checkRevision() {
  if (pending || document.hidden) return;
  pending = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("/__dev/revision", { cache: "no-store", signal: controller.signal });
    if (response.ok && await response.text() !== revision) location.reload();
  } catch {
    // Keep the current interface and native audio available while the server is down.
  } finally {
    clearTimeout(timeout);
    pending = false;
    refreshTimer = setTimeout(checkRevision, 1000);
  }
}

document.addEventListener("visibilitychange", () => {
  clearTimeout(refreshTimer);
  if (!document.hidden) void checkRevision();
});
void checkRevision();
