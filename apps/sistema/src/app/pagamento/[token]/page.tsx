import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { PublicPixCopyButton } from "../../../features/financeiro/PublicPixCopyButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR");
}

export default async function PublicPaymentPage({
  params,
}: {
  params: { token: string };
}): Promise<JSX.Element> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_charges")
    .select("id, receivable_id, amount, description, status, pix_copy_paste, expires_at, paid_at, public_token")
    .eq("public_token", params.token)
    .maybeSingle();

  if (error || !data) notFound();

  const { data: receivable } = await admin
    .from("receivables")
    .select("internal_reference, description")
    .eq("id", data.receivable_id)
    .maybeSingle();

  const pending = data.status === "pending";
  const paid = data.status === "paid";
  const cancelled = data.status === "cancelled";
  const expires = dateTime(data.expires_at);
  const pix = data.pix_copy_paste ?? "";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f5ef",
        padding: "28px 14px",
        color: "#17172b",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          margin: "0 auto",
          background: "#fff",
          border: "1px solid #ddd9cc",
          borderRadius: 14,
          padding: 22,
          boxShadow: "0 10px 30px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".12em", color: "#c7232d" }}>
          INFORMATIVO REGIONAL
        </div>
        <h1 style={{ margin: "8px 0 4px", fontSize: 28, fontFamily: "Georgia, serif" }}>
          Pagamento via Pix
        </h1>
        <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
          {receivable?.description ?? data.description ?? "Cobrança do Informativo Regional"}
        </p>

        <div style={{ marginTop: 20, padding: "14px 0", borderTop: "1px solid #eee9dc", borderBottom: "1px solid #eee9dc" }}>
          <div style={{ fontSize: 12, color: "#777" }}>VALOR</div>
          <strong style={{ display: "block", marginTop: 4, fontSize: 28 }}>{money(Number(data.amount))}</strong>
          {receivable?.internal_reference ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{receivable.internal_reference}</div>
          ) : null}
        </div>

        {paid ? (
          <div style={{ marginTop: 22, borderRadius: 8, padding: 14, background: "#eef8ef", color: "#25652b", fontWeight: 800 }}>
            Pagamento confirmado{data.paid_at ? " em " + dateTime(data.paid_at) : ""}.
          </div>
        ) : cancelled ? (
          <div style={{ marginTop: 22, borderRadius: 8, padding: 14, background: "#fff0f0", color: "#9b1c1c", fontWeight: 800 }}>
            Esta cobrança foi cancelada.
          </div>
        ) : pending ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <img
                src={"/api/public/pagamento/" + data.public_token + "/qrcode"}
                alt="QR Code Pix"
                width={240}
                height={240}
                style={{ width: 240, height: 240, maxWidth: "100%", objectFit: "contain" }}
              />
            </div>

            {expires ? (
              <p style={{ textAlign: "center", color: "#777", fontSize: 12, margin: "8px 0 18px" }}>
                Cobrança disponível até {expires}.
              </p>
            ) : null}

            {pix ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 7 }}>PIX COPIA E COLA</div>
                <div
                  style={{
                    border: "1px solid #ddd9cc",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11,
                    lineHeight: 1.5,
                    wordBreak: "break-all",
                    background: "#faf9f5",
                    marginBottom: 10,
                  }}
                >
                  {pix}
                </div>
                <PublicPixCopyButton payload={pix} />
              </>
            ) : (
              <p style={{ color: "#9b1c1c" }}>O código Pix ainda não está disponível.</p>
            )}
          </>
        ) : (
          <div style={{ marginTop: 22, borderRadius: 8, padding: 14, background: "#f4f4f4", color: "#555", fontWeight: 700 }}>
            Situação da cobrança: {data.status}.
          </div>
        )}

        <p style={{ margin: "20px 0 0", color: "#777", fontSize: 11, lineHeight: 1.5 }}>
          Confira o valor antes de pagar. Após a confirmação do banco, o sistema atualiza a cobrança automaticamente.
        </p>
      </section>
    </main>
  );
}
