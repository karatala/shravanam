# Offline application shell

`bun run build` creates a service worker from the exact current output list. Its revision includes the worker template, asset names, and asset contents. It caches only the application shell. It does not cache books, streams, or arbitrary network responses.

A browser needs HTTPS or a loopback address on the same device. `http://127.0.0.1:4173` works for local preview on the computer that runs the server. A phone needs its own loopback server or a separately configured trusted HTTPS host. The development server binds to loopback and does not prepare an offline cache.

Open the production app online and wait for the ready message before disconnecting. Clearing browser storage removes this cache and requires online preparation again. An installed update waits until all old app windows close; the next launch activates it. The worker removes only old Shravanam shell caches for the same scope.

Desktop and Capacitor use bundled application files without a service worker. This says nothing about offline book availability, which is not implemented yet.

## Manual checks

- [ ] Open the production app online and wait for the offline-ready message.
- [ ] Disconnect from the network, close the app, and reopen it at the same address.
- [ ] Confirm that the shell opens and reports no network connection.
- [ ] Repeat from an installed PWA and from a hosted subpath.
- [ ] Change an application file, build again, and reconnect. Close all app windows and reopen to check the update.
- [ ] Clear browser storage and confirm that online preparation is required again.
