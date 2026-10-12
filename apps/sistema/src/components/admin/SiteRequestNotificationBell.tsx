"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export function SiteRequestNotificationBell(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const { count: total, error } = await client
        .from("site_interest_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");

      if (!cancelled && !error) setCount(total ?? 0);
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);

    const channel = client
      .channel("site-interest-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_interest_requests" }, () => void refresh())
      .subscribe();

    function onFocus(): void {
      void refresh();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      void client.removeChannel(channel);
    };
  }, [client]);

  return (
    <Link
      href="/sistema/publicidade/solicitacoes"
      aria-label={count > 0 ? `${count} nova(s) solicitação(ões) do site` : "Solicitações do site"}
      title="Solicitações do site"
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
  );
}
