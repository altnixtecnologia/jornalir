"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export function AdminNotificationBell(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<{ title: string; message: string; href?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const [requests, notifications] = await Promise.all([
        client
          .from("site_interest_requests")
          .select("id", { count: "exact", head: true })
          .is("attended_at", null),
        client
          .from("admin_notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
      ]);

      if (!cancelled) {
        setCount((requests.count ?? 0) + (notifications.count ?? 0));
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);

    const siteChannel = client
      .channel("site-interest-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_interest_requests" }, () => void refresh())
      .subscribe();

    const adminChannel = client
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          void refresh();
          const row = payload.new as {
            title?: string;
            message?: string;
            href?: string | null;
          };
          if (row.title && row.message) {
            setToast({
              title: row.title,
              message: row.message,
              href: row.href ?? undefined,
            });
            window.setTimeout(() => setToast(null), 8000);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_notifications" },
        () => void refresh(),
      )
      .subscribe();

    function onFocus(): void {
      void refresh();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      void client.removeChannel(siteChannel);
      void client.removeChannel(adminChannel);
    };
  }, [client]);

  return (
    <>
      <Link
        href="/sistema/notificacoes"
        aria-label={count > 0 ? `${count} notificação(ões) pendente(s)` : "Notificações"}
        title="Notificações"
        style={{
          position: "relative",
          display: "inline-flex",
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--line)",
          borderRadius: "50%",
          color: "var(--ink)",
          textDecoration: "none",
          background: "var(--surface, #fff)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 17 }}>🔔</span>
        {count > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 19,
              height: 19,
              padding: "0 5px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#c93030",
              color: "#fff",
              fontSize: 10,
              fontWeight: 900,
              border: "2px solid #fff",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 18,
            top: 72,
            zIndex: 1000,
            width: "min(380px, calc(100vw - 36px))",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 14,
            background: "var(--surface, #fff)",
            boxShadow: "0 14px 36px rgba(0,0,0,.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <strong>{toast.title}</strong>
              <p style={{ margin: "5px 0 0", fontSize: 13 }}>{toast.message}</p>
              {toast.href ? (
                <Link
                  href={toast.href}
                  onClick={() => setToast(null)}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 800 }}
                >
                  Abrir
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Fechar notificação"
              onClick={() => setToast(null)}
              style={{ alignSelf: "flex-start", border: 0, background: "transparent", cursor: "pointer", fontSize: 16 }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
