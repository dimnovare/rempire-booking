/*
 * The client app's service worker (docs/apps.md, step 4): the reminder
 * before a visit as a notification. Plain JavaScript, no build step.
 * Registered by src/app/[locale]/remind-me.tsx, and only when a client
 * turns the reminder on.
 *
 * Push only. There is no fetch handler: the booking pages always come from
 * the network, and nothing of a client is kept on the phone by this file.
 * The staff app has its own worker (public/b/sw.js, scope /b), which keeps
 * running its pages; this one, at the root, never touches them.
 */
var APP = "/";
var ICON = "/icons/app-192.png";
// Android's status-bar mark: the white tower on nothing (only the alpha is used)
var BADGE = "/b/icons/badge-96.png";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
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
    // one line per visit: a newer reminder for the same visit replaces the older one
    tag: msg.tag || "rempire",
    renotify: !!msg.tag,
    data: { url: msg.url || APP },
  };
  event.waitUntil(self.registration.showNotification(msg.title || "REMPIRE", options));
});

// A tap opens the client's own visit link: in the app's window if one is open, else a new one.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || APP, self.location.origin);
  if (target.origin !== self.location.origin) target = new URL(APP, self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var w = windows[i];
        var at;
        try {
          at = new URL(w.url);
        } catch (e) {
          continue;
        }
        // never a staff window: those belong to the staff app
        if (at.pathname === "/admin" || at.pathname.indexOf("/admin/") === 0 || at.pathname === "/b" || at.pathname.indexOf("/b/") === 0) continue;
        if (!w.navigate) continue;
        return Promise.resolve(w.focus ? w.focus() : w)
          .catch(function () {
            return w;
          })
          .then(function (focused) {
            return (focused || w).navigate(target.href).catch(function () {
              return self.clients.openWindow(target.href);
            });
          });
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
