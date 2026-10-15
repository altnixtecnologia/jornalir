// Service Worker exclusivo das notificacoes do Sistema.
// Nunca intercepta GET, API, login ou conteudo autenticado.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = typeof data.title === "string" ? data.title.slice(0, 140) : "Agenda Jornal IR";
  const href = typeof data.href === "string" && data.href.startsWith("/") && !data.href.startsWith("//")
    ? data.href : "/sistema/agenda";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body.slice(0, 300) : "",
    icon: "/icons/icon-ir-192.png",
    badge: "/icons/icon-ir-192.png",
    tag: typeof data.eventKey === "string" ? data.eventKey : undefined,
    renotify: true,
    vibrate: [180, 130, 180],
    requireInteraction: true,
    data: { href },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && typeof event.notification.data.href === "string"
    ? event.notification.data.href : "/sistema/agenda";
  const url = new URL(href, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url.href);
  }));
});
