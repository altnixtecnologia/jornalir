import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PAYMENT_METHOD_LABELS } from "@ir/types";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { PrintButton } from "../../../features/financeiro/PrintButton";
import { verifyReceiptToken } from "../../../lib/integrations/altnixFinanceReceipt";
import { listReportExcludedReceivableIds } from "../../../providers/supabase/receivableReportExclusion.supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Recibo" };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

type Embedded = { internal_reference: string | null; description: string | null; client_id: string;
  clients: { kind: string; full_name: string | null; company_name: string | null; trade_name: string | null } | Array<{ kind: string; full_name: string | null; company_name: string | null; trade_name: string | null }> | null };

/**
 * Recibo existente exibido ao cliente por link assinado e temporário emitido pela ponte
 * (api/integrations/altnix/finance-receipt). Somente leitura: não gera, numera nem grava
 * recibo; a numeração é a referência do título já usada na cartela interna. Link inválido,
 * expirado, de outro cliente, estornado ou de título de teste responde 404 genérico.
 */
export default async function ClientReceiptPage(props: { params: Promise<{ token: string }> }): Promise<JSX.Element> {
  const { token } = await props.params;
  const verified = verifyReceiptToken(decodeURIComponent(token), process.env.JORNALIR_FINANCE_BRIDGE_SECRET, Date.now());
  if (!verified || process.env.JORNALIR_FINANCE_RECEIPT_ENABLED !== "true") notFound();

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("receivable_receipts")
    .select("id,receivable_id,amount,received_at,payment_method,reversed_at,receivables!inner(internal_reference,description,client_id,clients(kind,full_name,company_name,trade_name))")
    .eq("id", verified.receiptId).eq("receivables.client_id", verified.canonicalClientId).maybeSingle();
  if (error || !data || data.reversed_at) notFound();
  if ((await listReportExcludedReceivableIds(db)).includes(String(data.receivable_id))) notFound();

  const raw = data.receivables as unknown as Embedded | Embedded[];
  const receivable = Array.isArray(raw) ? raw[0] : raw;
  if (!receivable || receivable.client_id !== verified.canonicalClientId) notFound();
  const client = Array.isArray(receivable.clients) ? receivable.clients[0] : receivable.clients;
  const name = client?.trade_name || client?.company_name || client?.full_name || "Cliente";
  const method = data.payment_method ? (PAYMENT_METHOD_LABELS as Record<string, string>)[String(data.payment_method)] ?? "—" : "—";

  return (
    <main style={{ minHeight: "100vh", background: "#f6f5ef", padding: "28px 14px", color: "#17172b", fontFamily: "Arial, sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", margin: "0 auto", background: "#fff", border: "1px solid #ddd9cc", borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".12em", color: "#c7232d" }}>INFORMATIVO REGIONAL</div>
        <h1 style={{ margin: "8px 0 4px", fontSize: 26, fontFamily: "Georgia, serif" }}>Recibo{receivable.internal_reference ? ` — ${receivable.internal_reference}` : ""}</h1>
        <dl style={{ margin: "18px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 14 }}>
          <dt style={{ color: "#777" }}>Cliente</dt><dd style={{ margin: 0 }}>{name}</dd>
          <dt style={{ color: "#777" }}>Valor</dt><dd style={{ margin: 0 }}><strong>{money(Number(data.amount))}</strong></dd>
          <dt style={{ color: "#777" }}>Data</dt><dd style={{ margin: 0 }}>{dateTime(String(data.received_at))}</dd>
          <dt style={{ color: "#777" }}>Forma</dt><dd style={{ margin: 0 }}>{method}</dd>
          <dt style={{ color: "#777" }}>Referência</dt><dd style={{ margin: 0 }}>{receivable.description ?? "—"}</dd>
        </dl>
        <div style={{ marginTop: 20 }}><PrintButton /></div>
        <p style={{ margin: "18px 0 0", color: "#777", fontSize: 11, lineHeight: 1.5 }}>
          Este link é temporário e pessoal. Para consultar novamente, volte ao portal do cliente.
        </p>
      </section>
    </main>
  );
}
