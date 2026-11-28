import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { PublicPixCopyButton } from "../../../features/financeiro/PublicPixCopyButton";
import { PublicPaymentMethodPicker } from "../../../features/financeiro/PublicPaymentMethodPicker";
import { customerSafeCharge } from "../../../lib/integrations/altnixFinancePayment";
import { loadPaymentMethods } from "../../../lib/integrations/financePaymentRuntime";
import { PUBLIC_TOKEN_PATTERN } from "../../../lib/financeiro/cardPaymentUrls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR");
}

const COLUMNS = "id, receivable_id, amount, description, status, provider, provider_charge_id, pix_copy_paste, expires_at, paid_at, public_token, cancellation_reason, created_at, payment_method, invoice_url, installment_count, provider_confirmed_at, provider_rejected_at";

const box = (bg: string, color: string): React.CSSProperties => ({ marginTop: 22, borderRadius: 8, padding: 14, background: bg, color, fontWeight: 800, lineHeight: 1.5 });
const primaryLink: React.CSSProperties = {
  display: "block", textAlign: "center", marginTop: 16, minHeight: 52, lineHeight: "52px", borderRadius: 10,
  background: "#c7232d", color: "#fff", fontSize: 17, fontWeight: 800, textDecoration: "none",
};

export default async function PublicPaymentPage(
  props: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
): Promise<JSX.Element> {
  const params = await props.params;
  if (!PUBLIC_TOKEN_PATTERN.test(params.token)) notFound();
  const query = (await props.searchParams) ?? {};
  const returning = query.retorno === "1";
  const admin = createSupabaseAdminClient();
  const first = await admin.from("payment_charges").select(COLUMNS).eq("public_token", params.token).maybeSingle();
  if (first.error || !first.data) notFound();
  let data = first.data;

  // Cobrança substituída (troca de forma ou renovação): mostra a cobrança vigente do MESMO título (um único registro por consulta).
  if (data.status === "cancelled" && /^(troca_de_forma|renovacao)/.test(String(data.cancellation_reason ?? ""))) {
    const { data: latest } = await admin.from("payment_charges").select(COLUMNS)
      .eq("receivable_id", data.receivable_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) data = latest;
  }

  const { data: receivable } = await admin
    .from("receivables")
    .select("internal_reference, description")
    .eq("id", data.receivable_id)
    .maybeSingle();

  const safe = customerSafeCharge({
    status: String(data.status), amount: Number(data.amount), provider: String(data.provider),
    providerChargeId: data.provider_charge_id ?? undefined, pixCopyPaste: data.pix_copy_paste ?? undefined,
    publicToken: data.public_token ?? undefined, expiresAt: data.expires_at ?? undefined, paidAt: data.paid_at ?? undefined,
    paymentMethod: data.payment_method ?? "pix", invoiceUrl: data.invoice_url ?? undefined,
    installmentCount: data.installment_count ?? undefined, providerConfirmedAt: data.provider_confirmed_at ?? undefined,
    providerRejectedAt: data.provider_rejected_at ?? undefined,
  }, Date.now());
  const isCard = safe.method === "credit_card";
  const expires = dateTime(data.expires_at);
  const pix = data.pix_copy_paste ?? "";
  const active = safe.state === "pending" || safe.state === "rejected";

  // Forma alternativa só quando habilitada na configuração central e na chave de ativação (uma leitura).
  const switchEnabled = process.env.VERCEL_ENV === "production" && process.env.JORNALIR_PUBLIC_METHOD_SWITCH_ENABLED === "true";
  const methods = active && switchEnabled ? await loadPaymentMethods(admin) : null;

  return (
    <main style={{ minHeight: "100vh", background: "#f6f5ef", padding: "28px 14px", color: "#17172b", fontFamily: "Arial, sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", margin: "0 auto", background: "#fff", border: "1px solid #ddd9cc", borderRadius: 14, padding: 22, boxShadow: "0 10px 30px rgba(0,0,0,.06)" }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".12em", color: "#c7232d" }}>INFORMATIVO REGIONAL</div>
        <h1 style={{ margin: "8px 0 4px", fontSize: 28, fontFamily: "Georgia, serif" }}>
          {isCard ? "Pagamento com cartão de crédito" : "Pagamento via Pix"}
        </h1>
        <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
          {receivable?.description ?? data.description ?? "Cobrança do Informativo Regional"}
        </p>

        <div style={{ marginTop: 20, padding: "14px 0", borderTop: "1px solid #eee9dc", borderBottom: "1px solid #eee9dc" }}>
          <div style={{ fontSize: 12, color: "#777" }}>VALOR</div>
          <strong style={{ display: "block", marginTop: 4, fontSize: 28 }}>{money(Number(data.amount))}</strong>
          {isCard && safe.installments && safe.installments > 1 ? (
            <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
              {safe.installments}× de {money(safe.installmentAmount ?? 0)} no cartão (o total é o mesmo)
            </div>
          ) : null}
          {receivable?.internal_reference ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{receivable.internal_reference}</div>
          ) : null}
        </div>

        {safe.state === "paid" ? (
          <div style={box("#eef8ef", "#25652b")} role="status">
            Pagamento confirmado{data.paid_at ? " em " + dateTime(data.paid_at) : ""}.
          </div>
        ) : safe.state === "confirming" ? (
          <>
            <div style={box("#fff8e6", "#7a5200")} role="status">Estamos confirmando seu pagamento. Se você já pagou, não pague de novo.</div>
            <a href={`/pagamento/${data.public_token}?retorno=1`} style={{ ...primaryLink, background: "#17172b" }}>Atualizar situação</a>
          </>
        ) : safe.state === "cancelled" ? (
          <div style={box("#fff0f0", "#9b1c1c")}>Esta cobrança foi cancelada.</div>
        ) : safe.state === "expired" ? (
          <div style={box("#f4f4f4", "#555")}>Esta cobrança expirou. Fale com o Informativo Regional para receber uma nova.</div>
        ) : safe.state === "reconciling" ? (
          <div style={box("#fff8e6", "#7a5200")} role="status">Estamos confirmando esta cobrança. Volte em instantes.</div>
        ) : active ? (
          <>
            {returning && safe.state === "pending" ? (
              <div style={box("#fff8e6", "#7a5200")} role="status">
                Estamos confirmando seu pagamento. Se você já pagou, aguarde um instante e toque em “Atualizar situação”.
                <a href={`/pagamento/${data.public_token}?retorno=1`} style={{ ...primaryLink, background: "#17172b", marginTop: 10 }}>Atualizar situação</a>
              </div>
            ) : null}
            {safe.state === "rejected" ? (
              <div style={box("#fff0f0", "#9b1c1c")} role="alert">Pagamento não aprovado. Você pode tentar outro cartão ou escolher PIX.</div>
            ) : null}

            {isCard ? (
              safe.checkoutUrl ? (
                <a href={safe.checkoutUrl} style={primaryLink}>{safe.state === "rejected" ? "Tentar novamente com o cartão" : "Pagar com cartão de crédito"}</a>
              ) : <p style={{ color: "#9b1c1c" }}>A página de pagamento ainda não está disponível.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
                  <img src={"/api/public/pagamento/" + data.public_token + "/qrcode"} alt="QR Code Pix" width={240} height={240}
                    style={{ width: 240, height: 240, maxWidth: "100%", objectFit: "contain" }} />
                </div>
                {expires ? <p style={{ textAlign: "center", color: "#777", fontSize: 12, margin: "8px 0 18px" }}>Cobrança disponível até {expires}.</p> : null}
                {pix ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 7 }}>PIX COPIA E COLA</div>
                    <div style={{ border: "1px solid #ddd9cc", borderRadius: 8, padding: 12, fontSize: 11, lineHeight: 1.5, wordBreak: "break-all", background: "#faf9f5", marginBottom: 10 }}>{pix}</div>
                    <PublicPixCopyButton payload={pix} />
                  </>
                ) : <p style={{ color: "#9b1c1c" }}>O código Pix ainda não está disponível.</p>}
              </>
            )}
            {methods ? (
              <PublicPaymentMethodPicker token={String(data.public_token)} total={Number(data.amount)}
                current={isCard ? "credit_card" : "pix"} card={methods.card} />
            ) : null}
          </>
        ) : (
          <div style={box("#f4f4f4", "#555")}>Situação da cobrança: {String(data.status)}.</div>
        )}

        <p style={{ margin: "20px 0 0", color: "#777", fontSize: 11, lineHeight: 1.5 }}>
          Confira o valor antes de pagar. A confirmação vem do banco ou da operadora do cartão; voltar a esta página não confirma o pagamento.
        </p>
      </section>
    </main>
  );
}
