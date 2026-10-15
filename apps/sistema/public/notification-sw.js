/* Jornal IR Sistema — push em segundo plano. Não intercepta GET/POST e não armazena conteúdo administrativo. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const category = payload.kind === "agenda" ? "agenda" : "admin";
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "Jornal IR — Sistema";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 360) : "Você tem uma nova notificação.";
  const href = typeof payload.href === "string" && payload.href.startsWith("/sistema/") && !payload.href.startsWith("//")
    ? payload.href : "/sistema/notificacoes";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-ir-192.png",
    badge: "/icons/icon-ir-192.png",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 90) : category,
    data: { href },
    requireInteraction: category === "agenda",
    // Vibração no navegador não substitui alarme nativo em modo silencioso.
    vibrate: category === "agenda" ? [180, 80, 180] : [120],
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && event.notification.data.href || "/sistema/notificacoes";
  const url = new URL(href, self.location.origin).href;
  if (!url.startsWith(self.location.origin + "/sistema/")) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
