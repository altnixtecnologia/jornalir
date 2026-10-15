// v2 (Fase de correção do cache): a v1 fazia cache-first para TODO GET,
// inclusive navegação/HTML/RSC — uma matéria publicada/destacada no painel
// podia nunca aparecer num F5 normal, porque a navegação respondia direto
// do cache antigo sem nem tentar a rede. Mudar o nome do cache aqui é o
// que faz o `activate` abaixo apagar o cache velho ("informativo-regional-v1")
// de quem já tinha o SW anterior instalado — sem isso, o cache antigo nunca
// seria limpo (o nome nunca mudava entre deploys).
const CACHE_VERSION = "v2";
const CACHE_NAME = `informativo-regional-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Só o essencial para o fallback offline — nunca uma página de conteúdo
// editorial (home/listagem/matéria), que é exatamente o que congelava.
const PRECACHE_ASSETS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Assets com hash no caminho (/_next/static/...) são imutáveis por
// definição do Next — uma mudança de conteúdo sempre gera um caminho novo,
// então cache-first aqui nunca serve algo desatualizado.
function isImmutableBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

// Ícones/logo/manifest: estáticos de fato (pasta /public, sem relação com
// conteúdo editorial). Aceitável manter em cache mesmo sem hash no nome.
function isKnownStaticAsset(url) {
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico") return true;
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação de página (HTML) e qualquer payload de dados do Next
  // (RSC, _next/data) são conteúdo editorial em potencial — sempre rede
  // primeiro. Nunca armazenados; o cache só entra como fallback se a rede
  // falhar de verdade (offline), nunca como resposta normal com internet.
  const isNavigation = request.mode === "navigate";
  const isNextDataOrRsc = url.pathname.startsWith("/_next/data/") || url.searchParams.has("_rsc");
  if (isNavigation || isNextDataOrRsc) {
    event.respondWith(
      fetch(request).catch(() => (isNavigation ? caches.match(OFFLINE_URL) : Response.error())),
    );
    return;
  }

  // Assets estáticos de verdade: cache-first, com gravação em background.
  if (isImmutableBuildAsset(url) || isKnownStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Qualquer outro GET (imagens de capa/R2, APIs, dados editoriais em
  // geral): segue direto para a rede, sem interceptar — nunca cacheado.
});


// Notificações futuras do jornal (envio permanece desabilitado até configurar
// assinatura voluntária e emissor Web Push). Não interferem no cache editorial.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || typeof payload !== "object") return;
  const title = typeof payload.title === "string" ? payload.title.slice(0, 150) : "Jornal IR";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 350) : "";
  const href = typeof payload.href === "string" ? payload.href : "/";
  const target = new URL(href, self.location.origin);
  if (target.origin !== self.location.origin) return;
  const urgent = payload.kind === "urgent";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 100) : (urgent ? "jornal-ir-urgente" : undefined);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-ir-192.png",
    badge: "/icons/icon-ir-192.png",
    tag,
    renotify: urgent,
    data: { href: target.pathname + target.search },
    // Android/Web permitem vibração em algumas versões.
    // O modo silencioso e ajustes do usuário podem impedir o alerta.
    vibrate: urgent ? [250, 100, 250, 100, 350] : [120],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  const target = new URL(href, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const found = clients.find((client) => client.url.startsWith(self.location.origin) && "focus" in client);
    if (found) {
      await found.focus();
      if ("navigate" in found) return found.navigate(target.href);
    }
    return self.clients.openWindow(target.href);
  }));
});
