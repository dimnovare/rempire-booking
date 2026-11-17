/**
 * The barber app's service worker (Phase B, docs/phase-b.md). Plain script,
 * no build step. Registered by src/app/b/sw-register.tsx with scope /b;
 * next.config.ts serves it with «Service-Worker-Allowed: /b», because the
 * app's own address /b sits above this file's folder /b/.
 *
 * It does three things:
 *   1. push: shows the notification src/lib/push.ts sent (B5). Every branch
 *      ends in showNotification(): iOS stops delivering to a worker that
 *      receives a push and shows nothing.
 *   2. a tap on a notification opens that address in the app, in the window
 *      already open if there is one.
 *   3. the app shell: a page of the app opened without internet shows the
 *      copy loaded last time (the barber's own day), or a short «no
 *      internet» page. Next's /_next/static files are content-hashed, so
 *      they are kept and reused; nothing else is cached. «Выйти» empties the
 *      page cache (src/app/b/(app)/more).
 *
 * Bump VERSION when this file changes in a way that needs the old caches gone.
 */
var VERSION = "b1";
var PAGES = "rb-pages-" + VERSION;
var STATIC = "rb-static-" + VERSION;
var STATIC_MAX = 200;
var APP = "/b";
var ICON = "/b/icons/icon-192.png";
// Android draws the status-bar badge from the alpha channel alone: the tower on nothing
var BADGE = "/b/icons/badge-96.png";

var OFFLINE_HTML =
  '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="robots" content="noindex"><title>REMPIRE</title><style>' +
  "body{margin:0;min-height:100vh;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:24px;background:#000;color:#fff;font:16px/1.4 system-ui,-apple-system,sans-serif}" +
  "b{font-size:22px;letter-spacing:.08em}p{margin:0;color:#a9ab9d}a{color:#000;background:#e9fc53;padding:14px 18px;text-decoration:none;align-self:flex-start;font-weight:700;letter-spacing:.1em}" +
  "</style></head><body><b>REMPIRE</b><p>Нет интернета. · Internetti pole. · No internet.</p>" +
  '<a href="/b">↻</a></body></html>';

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf("rb-") === 0 && k !== PAGES && k !== STATIC;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

function inApp(url) {
  return url.origin === self.location.origin && (url.pathname === APP || url.pathname.indexOf(APP + "/") === 0);
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= STATIC_MAX) return;
    return Promise.all(
      keys.slice(0, keys.length - STATIC_MAX).map(function (k) {
        return cache.delete(k);
      }),
    );
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Next's build files never change under one name: keep them, reuse them
  if (url.pathname.indexOf("/_next/static/") === 0) {
    event.respondWith(
      caches.open(STATIC).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res.ok) cache.put(req, res.clone()).then(function () { return trim(cache); });
            return res;
          });
        });
      }),
    );
    return;
  }

  // a page of the app: the network first, the last copy without it
  if (req.mode === "navigate" && inApp(url) && url.pathname.indexOf("/b/login") !== 0) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          // only a real page of the app, never a redirect to the login
          if (res.ok && !res.redirected && res.type === "basic") {
            var copy = res.clone();
            caches.open(PAGES).then(function (cache) {
              cache.put(url.pathname + url.search, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.open(PAGES).then(function (cache) {
            return cache.match(url.pathname + url.search).then(function (hit) {
              return (
                hit ||
                cache.match(APP).then(function (home) {
                  return home || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
                })
              );
            });
          });
        }),
    );
  }
});

// The page asks to forget the cached pages (log out).
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "rb:forget") {
    event.waitUntil(caches.delete(PAGES));
  }
});

self.addEventListener("push", function (event) {
  var msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch (e) {
    /* not ours, or cut short: the defaults below */
  }
  var options = {
    body: msg.body || "",
    icon: ICON,
    badge: BADGE,
    // one line per visit or request: a newer push with the same tag replaces the older one
    tag: msg.tag || "rempire",
    renotify: !!msg.tag,
    data: { url: msg.url || APP },
  };
  event.waitUntil(self.registration.showNotification(msg.title || "REMPIRE", options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || APP, self.location.origin);
  if (target.origin !== self.location.origin) target = new URL(APP, self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      if (inApp(target)) {
        for (var i = 0; i < windows.length; i++) {
          var w = windows[i];
          var at;
          try {
            at = new URL(w.url);
          } catch (e) {
            continue;
          }
          if (!inApp(at)) continue;
          return Promise.resolve(w.focus ? w.focus() : w)
            .catch(function () {
              return w;
            })
            .then(function (focused) {
              var c = focused || w;
              if (c.navigate) return c.navigate(target.href).catch(function () {});
              c.postMessage({ type: "rb:open", url: target.href });
            });
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
