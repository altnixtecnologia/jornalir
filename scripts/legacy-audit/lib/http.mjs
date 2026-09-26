const DEFAULT_HEADERS = {
  "User-Agent": "InformativoRegionalLegacyAudit/1.0 (+auditoria interna, somente leitura)",
  Accept: "text/html,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * GET com retry (backoff simples) e sem cookies/credenciais — item 13
 * (nunca armazenar cookies/senhas/tokens do site antigo; nunca precisou de
 * nenhum para ler conteúdo público).
 */
export async function fetchText(url, { retries = 3, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        return { ok: false, status: res.status, text: null };
      }
      const text = await res.text();
      return { ok: true, status: res.status, text };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }
  return { ok: false, status: 0, text: null, error: String(lastError) };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fila com limite de requisições por segundo (item 13 — nunca bombardear
 * o servidor). `rps` conservador por padrão: o site é de terceiro (mesmo
 * sendo do próprio jornal), sem SLA conhecido.
 */
export function createRateLimiter(rps = 4) {
  const intervalMs = 1000 / rps;
  let lastRun = 0;
  return async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, lastRun + intervalMs - now);
    lastRun = now + wait;
    if (wait > 0) await sleep(wait);
  };
}
