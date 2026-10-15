// Service Worker do Jornal IR Sistema — sem cache de dados autenticados.
// Mensagens push exigem consentimento, configuração VAPID e um emissor ativo.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || typeof payload !== "object") return;
  const title = typeof payload.title === "string" ? payload.title.slice(0,140) : "Jornal IR | Sistema";
  const body = typeof payload.body === "string" ? payload.body.slice(0,400) : "";
  const href = typeof payload.href === "string" ? payload.href : "/sistema/notificacoes";
  const target = new URL(href, self.location.origin);
  if (target.origin !== self.location.origin || !target.pathname.startsWith("/sistema")) return;
  const isAgenda = payload.kind === "agenda";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-ir-192.png",
    badge: "/icons/icon-ir-192.png",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0,100) : undefined,
    renotify: isAgenda,
    data: { href: target.pathname + target.search },
    // Vibração depende de navegador e configurações do sistema.
    vibrate: isAgenda ? [250, 120, 250] : [140],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/sistema/notificacoes";
  const target = new URL(href, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin) && "focus" in client);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) return existing.navigate(target.href);
    }
    return self.clients.openWindow(target.href);
  }));
});
