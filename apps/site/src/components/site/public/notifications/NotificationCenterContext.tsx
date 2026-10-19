"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getManagementToken, getOrCreateManagementToken } from "./deviceIdentity";

const ENDPOINT = process.env.NEXT_PUBLIC_NOTIFICATIONS_GATEWAY_URL || "https://controle.altnix.com.br/api/public/notifications";
const POLL_MS = 120_000;
const SESSION_HIDDEN_KEY = "jornalir_notif_floating_hidden";

export type NotificationKind = "ordinary" | "urgent" | "administrative";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  scheduledAt: string;
  read: boolean;
}

interface NotificationCenterState {
  items: NotificationItem[];
  unreadCount: number;
  loaded: boolean;
  panelOpen: boolean;
  floatingVisible: boolean;
  /** true = o servidor não tem onde persistir "lido" ainda (migration
   * pendente) — a central funciona, mas o estado de leitura pode não
   * sobreviver a um recarregamento. Nunca escondido do leitor. */
  readPersistenceDegraded: boolean;
  openPanel: () => void;
  closePanel: () => void;
  markRead: (id: string) => void;
  dismissFloatingForSession: () => void;
}

const NotificationCenterContext = createContext<NotificationCenterState | null>(null);

export function NotificationCenterProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hiddenThisSession, setHiddenThisSession] = useState(false);
  const [readPersistenceDegraded, setReadPersistenceDegraded] = useState(false);
  const lastUnreadIdsRef = useRef<Set<string>>(new Set());

  const fetchFeed = useCallback(async () => {
    try {
      const token = getManagementToken();
      // Cabeçalho, nunca query string — não fica em log de acesso, histórico
      // do navegador nem é repassado via Referer (18/10/2026).
      const response = await fetch(ENDPOINT, {
        cache: "no-store",
        headers: token ? { "X-Notification-Token": token } : undefined,
      });
      if (!response.ok) return;
      const data = (await response.json()) as { ok?: boolean; items?: NotificationItem[]; readTrackingAvailable?: boolean };
      if (!data.ok || !Array.isArray(data.items)) return;
      if (data.readTrackingAvailable === false) setReadPersistenceDegraded(true);

      // Se chegou um aviso não lido novo (que não existia na última
      // leitura), o flutuante volta a poder aparecer mesmo que o leitor
      // já tivesse ocultado nesta sessão (pedido explícito do usuário).
      const newUnreadIds = new Set(data.items.filter((item) => !item.read).map((item) => item.id));
      const hasNewUnread = [...newUnreadIds].some((id) => !lastUnreadIdsRef.current.has(id));
      if (hasNewUnread && lastUnreadIdsRef.current.size > 0) {
        setHiddenThisSession(false);
        try {
          sessionStorage.removeItem(SESSION_HIDDEN_KEY);
        } catch {
          // Sem sessionStorage (modo privado estrito): segue sem persistir.
        }
      }
      lastUnreadIdsRef.current = newUnreadIds;

      setItems(data.items);
      setLoaded(true);
    } catch {
      // Falha de rede/servidor não deve travar a navegação do site.
    }
  }, []);

  useEffect(() => {
    try {
      setHiddenThisSession(sessionStorage.getItem(SESSION_HIDDEN_KEY) === "1");
    } catch {
      // Ignorado — mantém visível por padrão.
    }
    void fetchFeed();
    const interval = window.setInterval(() => void fetchFeed(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [fetchFeed]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    void fetchFeed();
  }, [fetchFeed]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const markRead = useCallback((id: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    const token = getOrCreateManagementToken();
    if (!token) return;
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managementToken: token, eventId: id }),
    })
      .then((response) => {
        // 503 = migration pendente: a marcação não persiste no servidor.
        // Nunca finge sucesso silenciosamente — avisa a central.
        if (response.status === 503) setReadPersistenceDegraded(true);
      })
      .catch(() => {
        // Falha de rede: estado local já refletiu a leitura; próximo
        // fetchFeed tenta de novo. Não é o mesmo caso de "sem persistência".
      });
  }, []);

  const dismissFloatingForSession = useCallback(() => {
    setHiddenThisSession(true);
    try {
      sessionStorage.setItem(SESSION_HIDDEN_KEY, "1");
    } catch {
      // Sem sessionStorage: some só até a próxima navegação/recarregamento.
    }
  }, []);

  const unreadCount = items.filter((item) => !item.read).length;

  const value = useMemo<NotificationCenterState>(
    () => ({
      items,
      unreadCount,
      loaded,
      panelOpen,
      floatingVisible: unreadCount > 0 && !hiddenThisSession && !panelOpen,
      readPersistenceDegraded,
      openPanel,
      closePanel,
      markRead,
      dismissFloatingForSession,
    }),
    [
      items,
      unreadCount,
      loaded,
      panelOpen,
      hiddenThisSession,
      readPersistenceDegraded,
      openPanel,
      closePanel,
      markRead,
      dismissFloatingForSession,
    ],
  );

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenter(): NotificationCenterState {
  const context = useContext(NotificationCenterContext);
  if (!context) throw new Error("useNotificationCenter precisa do NotificationCenterProvider");
  return context;
}
