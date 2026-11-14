const cachePrefix = `shravanam-shell-${encodeURIComponent(self.registration.scope)}-`;
const cacheName = `${cachePrefix}__SHRAVANAM_REVISION__`;
const shellFiles = ["__SHRAVANAM_FILES__"];
const shellUrl = new URL("index.html", self.registration.scope).href;
const shellUrls = new Set(shellFiles.map(filename => new URL(filename, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...shellUrls].map(url => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isHome = event.request.mode === "navigate" && (url.pathname === new URL(self.registration.scope).pathname || url.pathname === new URL(shellUrl).pathname) && url.origin === self.location.origin;
  const key = isHome ? shellUrl : url.href;
  // Audio and other URLs are not part of the application cache.
  if (!shellUrls.has(key)) return;
  event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(key)) ?? fetch(event.request)));
});
