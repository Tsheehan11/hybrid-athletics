/* Offline support. App files: try the network first so updates arrive, fall back to the
   last copy when offline. Requests to other sites (account sync) are never touched. */
var CACHE = "ha-v3";
var SHELL = ["./", "index.html", "styles.css", "app.js", "sync.js", "config.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "fonts/alegreya-latin-400-normal.woff2", "fonts/alegreya-latin-400-italic.woff2", "fonts/alegreya-latin-700-normal.woff2",
  "fonts/alegreya-sc-latin-500-normal.woff2", "fonts/alegreya-sc-latin-700-normal.woff2",
  "fonts/im-fell-english-sc-latin-400-normal.woff2", "fonts/caveat-latin-700-normal.woff2"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || caches.match("index.html"); });
  }));
});
