"use client";

// Identidade anônima por dispositivo, compartilhada entre a central de
// notificações e as preferências de push (SitePushPreferences.tsx) —
// mesma chave já em uso em produção, para que os dois recursos reconheçam
// o mesmo leitor sem exigir login (18/10/2026).
export const DEVICE_TOKEN_KEY = "jornalir_push_management_token";

export function getManagementToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Só cria o token quando necessário (ex.: ao abrir a central por
 * curiosidade sem nunca ter ativado push) — não força nada no servidor. */
export function getOrCreateManagementToken(): string | null {
  try {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return null;
  }
}
