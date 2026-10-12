"use client";

import { useMemo, useState } from "react";
import { contactInfo } from "../siteSettings";
import { getPublicSupabaseClient } from "../../../lib/public/supabasePublicClient";
import type { PublicSiteOfferSettings } from "../../../lib/public/siteOfferSettingsService";

type PrintOffer = {
  id: string;
  label: string;
  price: number;
  comboDiscount: number;
  width: string;
  height: string;
};

type CartItem = {
  id: string;
  label: string;
  price: number | null;
  comboDiscount: number;
  kind: "subscription" | "print_ad" | "digital_ad";
};

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function discountedPrice(item: CartItem, comboActive: boolean): number | null {
  if (item.price === null) return null;
  if (!comboActive) return item.price;
  return Math.max(0, item.price - item.comboDiscount);
}

export function AssineConfigurator({ settings }: { settings: PublicSiteOfferSettings }): JSX.Element {
  const printOffers = useMemo<PrintOffer[]>(
    () => [
      {
        id: "business-card",
        label: "Cartão de visita",
        price: settings.printBusinessCardPrice,
        comboDiscount: settings.printBusinessCardComboDiscount,
        width: "42%",
        height: "18%",
      },
      {
        id: "standard",
        label: "Padrão",
        price: settings.printStandardPrice,
        comboDiscount: settings.printStandardComboDiscount,
        width: "48%",
        height: "31%",
      },
      {
        id: "quarter",
        label: "1/4 de página",
        price: settings.printQuarterPrice,
        comboDiscount: settings.printQuarterComboDiscount,
        width: "48%",
        height: "48%",
      },
      {
        id: "half",
        label: "Meia página",
        price: settings.printHalfPrice,
        comboDiscount: settings.printHalfComboDiscount,
        width: "96%",
        height: "48%",
      },
      {
        id: "full",
        label: "Página inteira",
        price: settings.printFullPrice,
        comboDiscount: settings.printFullComboDiscount,
        width: "96%",
        height: "94%",
      },
    ],
    [settings],
  );

  const [annualSubscription, setAnnualSubscription] = useState(false);
  const [printOfferId, setPrintOfferId] = useState<string | null>(null);
  const [digital, setDigital] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printOffer = printOffers.find((item) => item.id === printOfferId) ?? null;

  const cartItems = useMemo<CartItem[]>(() => {
    const items: CartItem[] = [];

    if (annualSubscription) {
      items.push({
        id: "annual-newspaper",
        label: "Assinatura anual do jornal",
        price: settings.annualSubscriptionPrice,
        comboDiscount: settings.annualSubscriptionComboDiscount,
        kind: "subscription",
      });
    }

    if (printOffer) {
      items.push({
        id: `print-${printOffer.id}`,
        label: `Jornal impresso — ${printOffer.label}`,
        price: printOffer.price,
        comboDiscount: printOffer.comboDiscount,
        kind: "print_ad",
      });
    }

    if (digital) {
      items.push({
        id: "led-3-cities",
        label: "Divulgação nos 3 painéis de LED",
        price: settings.ledThreeCitiesPrice,
        comboDiscount: settings.ledThreeCitiesComboDiscount,
        kind: "digital_ad",
      });
    }

    return items;
  }, [annualSubscription, printOffer, digital, settings]);

  const comboActive = cartItems.length >= 2;
  const hasSelection = cartItems.length > 0;

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let hasUnknownPrice = false;

    for (const item of cartItems) {
      if (item.price === null) {
        hasUnknownPrice = true;
        continue;
      }
      subtotal += item.price;
      if (comboActive) discount += Math.min(item.price, item.comboDiscount);
    }

    return {
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      hasUnknownPrice,
    };
  }, [cartItems, comboActive]);

  const selections = useMemo(
    () =>
      cartItems.map((item) => ({
        type: item.kind,
        id: item.id,
        label: item.label,
        individualPrice: item.price,
        comboDiscountApplied: comboActive && item.price !== null ? Math.min(item.price, item.comboDiscount) : 0,
        finalPrice: discountedPrice(item, comboActive),
        color: item.kind === "print_ad" ? true : undefined,
      })),
    [cartItems, comboActive],
  );

  function removeItem(item: CartItem): void {
    if (item.kind === "subscription") setAnnualSubscription(false);
    if (item.kind === "print_ad") setPrintOfferId(null);
    if (item.kind === "digital_ad") setDigital(false);
  }

  async function submitRequest(): Promise<void> {
    setError(null);

    if (!hasSelection) {
      setError("Adicione pelo menos um item ao carrinho antes de enviar.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Informe seu nome.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Informe um WhatsApp ou telefone válido.");
      return;
    }
    if (!consent) {
      setError("Confirme o uso dos dados para retorno da solicitação.");
      return;
    }

    const hasSubscription = cartItems.some((item) => item.kind === "subscription");
    const hasAdvertising = cartItems.some((item) => item.kind !== "subscription");
    const requestType = hasSubscription && hasAdvertising
      ? "mixed"
      : hasSubscription
        ? "subscription"
        : "advertising";

    setPending(true);
    try {
      const client = getPublicSupabaseClient();
      const { data, error: rpcError } = await client.rpc("submit_site_interest_request", {
        p_request_type: requestType,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_email: email.trim() || null,
        p_city: city.trim() || null,
        p_company: company.trim() || null,
        p_selections: selections,
        p_estimated_total: totals.subtotal > 0 ? totals.total : null,
        p_notes: notes.trim() || null,
      });

      if (rpcError) throw rpcError;

      const protocol = typeof data === "string" ? data.slice(0, 8).toUpperCase() : "-";
      const itemLines = cartItems.map((item) => {
        const final = discountedPrice(item, comboActive);
        if (item.price === null || final === null) return `- ${item.label} — sob consulta`;
        if (comboActive && item.comboDiscount > 0) {
          return `- ${item.label} — ${money(item.price)} - ${money(Math.min(item.price, item.comboDiscount))} = ${money(final)}`;
        }
        return `- ${item.label} — ${money(item.price)}`;
      });

      const lines = [
        "Olá, equipe do Informativo Regional!",
        "",
        "Enviei uma solicitação pelo site.",
        `Protocolo: ${protocol}`,
        `Nome: ${name.trim()}`,
        `WhatsApp: ${phone.trim()}`,
        city.trim() ? `Cidade: ${city.trim()}` : null,
        company.trim() ? `Empresa: ${company.trim()}` : null,
        "",
        "Carrinho:",
        ...itemLines,
        comboActive ? `Desconto total por combinação: ${money(totals.discount)}` : null,
        totals.subtotal > 0 ? `Total estimado: ${money(totals.total)}` : null,
        totals.hasUnknownPrice ? "Há item com valor sob consulta." : null,
        notes.trim() ? "" : null,
        notes.trim() ? `Observação: ${notes.trim()}` : null,
        "",
        "Sei que a solicitação será avaliada pelo setor comercial antes da confirmação.",
      ].filter(Boolean);

      const whatsappHref = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(lines.join("\n"))}`;
      window.location.assign(whatsappHref);
    } catch {
      setError("Não foi possível registrar a solicitação agora. Tente novamente em instantes.");
      setPending(false);
    }
  }

  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
      <div className="space-y-8">
        <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
          <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-center">
            <div>
              <p className="kicker">ASSINATURA</p>
              <h2 className="mt-3 font-editorial text-3xl font-bold md:text-4xl">Receba o Informativo Regional</h2>
              <p className="mt-3 max-w-2xl text-sm md:text-base" style={{ color: "var(--site-muted)" }}>
                Assinatura anual do jornal impresso. Área de entrega e condições são confirmadas no atendimento.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnnualSubscription((value) => !value)}
              className={`rounded-2xl border px-5 py-5 text-left transition ${annualSubscription ? "ring-2 ring-[color:var(--brand-red)]" : ""}`}
              style={{ borderColor: "var(--site-line)", background: annualSubscription ? "var(--site-bg)" : "transparent" }}
            >
              <span className="block text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--brand-red)" }}>
                {annualSubscription ? "No carrinho" : "Adicionar ao carrinho"}
              </span>
              <strong className="mt-1 block text-lg">Assinatura anual</strong>
              <span className="mt-1 block text-2xl font-extrabold" style={{ color: "var(--brand-navy)" }}>
                {settings.annualSubscriptionPrice === null ? "Sob consulta" : money(settings.annualSubscriptionPrice)}
              </span>
            </button>
          </div>
        </section>

        <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
          <p className="kicker">JORNAL IMPRESSO</p>
          <div className="mt-3 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="font-editorial text-3xl font-bold md:text-4xl">Escolha o tamanho do anúncio</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>
                Todos os formatos são coloridos. Escolha um tamanho; ao trocar, o novo substitui o anterior no carrinho.
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--brand-red)" }}>
              Sujeito à avaliação comercial
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {printOffers.map((offer) => {
              const selected = printOfferId === offer.id;
              return (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => setPrintOfferId(selected ? null : offer.id)}
                  className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "ring-2 ring-[color:var(--brand-red)]" : ""}`}
                  style={{ borderColor: "var(--site-line)", background: selected ? "var(--site-bg)" : "var(--site-surface)" }}
                >
                  <div className="flex h-40 items-center justify-center rounded-xl border bg-white p-3" style={{ borderColor: "var(--site-line)" }}>
                    <div className="relative h-full w-[105px] border-2 border-zinc-300 bg-zinc-50">
                      <div
                        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-[color:var(--brand-red)] bg-red-50 px-1 text-center text-[8px] font-bold text-red-700"
                        style={{ width: offer.width, height: offer.height }}
                      >
                        ANÚNCIO
                      </div>
                    </div>
                  </div>
                  <span className="mt-3 block text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--brand-red)" }}>
                    {selected ? "No carrinho" : "Adicionar"}
                  </span>
                  <strong className="mt-1 block text-base">{offer.label}</strong>
                  <span className="mt-1 block text-xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(offer.price)}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-xs" style={{ color: "var(--site-muted)" }}>
            A posição, disponibilidade e medidas finais serão confirmadas pelo setor comercial antes da contratação.
          </p>
        </section>

        <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
          <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <p className="kicker">PAINÉIS DIGITAIS</p>
              <h2 className="mt-3 font-editorial text-3xl font-bold md:text-4xl">Divulgação nos 3 painéis de LED</h2>
              <p className="mt-3 text-sm md:text-base" style={{ color: "var(--site-muted)" }}>
                Painéis de 1 × 2 m em São João do Sul, Praia Grande/SC e Passo de Torres/SC.
                Período, frequência de exibição e disponibilidade são confirmados pelo Comercial.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDigital((value) => !value)}
              className={`rounded-2xl border px-5 py-5 text-left transition ${digital ? "ring-2 ring-[color:var(--brand-red)]" : ""}`}
              style={{ borderColor: "var(--site-line)", background: digital ? "var(--site-bg)" : "transparent" }}
            >
              <span className="block text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--brand-red)" }}>
                {digital ? "No carrinho" : "Adicionar ao carrinho"}
              </span>
              <strong className="mt-1 block text-lg">3 cidades</strong>
              <span className="mt-1 block text-2xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(settings.ledThreeCitiesPrice)}</span>
            </button>
          </div>
        </section>

        <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
          <p className="kicker">DADOS PARA RETORNO</p>
          <h2 className="mt-3 font-editorial text-3xl font-bold">Solicitar avaliação comercial</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>
            A solicitação não confirma automaticamente a contratação. Nossa equipe avaliará disponibilidade, formato e condições antes da aprovação.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Nome *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">WhatsApp/telefone *</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Cidade</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Empresa/anunciante</span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-semibold">E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-semibold">Observação</span>
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }} />
            </label>
          </div>

          <label className="mt-4 flex items-start gap-3 text-xs" style={{ color: "var(--site-muted)" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>Autorizo o uso destes dados exclusivamente para retorno desta solicitação e atendimento comercial.</span>
          </label>

          {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </section>
      </div>

      <aside
        className="h-fit overflow-hidden rounded-3xl border shadow-xl xl:sticky xl:top-24"
        style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
      >
        <div className="px-6 py-5 text-white" style={{ background: "var(--brand-navy)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Seu carrinho</p>
              <h2 className="mt-1 text-2xl font-extrabold">{cartItems.length} {cartItems.length === 1 ? "item" : "itens"}</h2>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">🛒</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/70">
            Com 2 ou mais produtos, cada item recebe o desconto configurado para ele.
          </p>
        </div>

        <div className="p-6">
          {!hasSelection ? (
            <div className="rounded-2xl border border-dashed p-5 text-center" style={{ borderColor: "var(--site-line)" }}>
              <p className="text-sm font-semibold">Seu carrinho está vazio.</p>
              <p className="mt-1 text-xs" style={{ color: "var(--site-muted)" }}>Adicione uma assinatura, um anúncio impresso ou os painéis.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item) => {
                const final = discountedPrice(item, comboActive);
                const itemDiscount = comboActive && item.price !== null ? Math.min(item.price, item.comboDiscount) : 0;

                return (
                  <div key={item.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block text-sm leading-snug">{item.label}</strong>
                        {item.price === null || final === null ? (
                          <span className="mt-1 block text-sm font-bold">Sob consulta</span>
                        ) : itemDiscount > 0 ? (
                          <div className="mt-2">
                            <span className="text-xs line-through" style={{ color: "var(--site-muted)" }}>{money(item.price)}</span>
                            <span className="ml-2 rounded-full bg-green-100 px-2 py-1 text-[10px] font-extrabold text-green-800">
                              -{money(itemDiscount)}
                            </span>
                            <strong className="mt-1 block text-lg" style={{ color: "var(--brand-navy)" }}>{money(final)}</strong>
                          </div>
                        ) : (
                          <strong className="mt-1 block text-lg" style={{ color: "var(--brand-navy)" }}>{money(item.price)}</strong>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item)}
                        className="rounded-lg border px-2 py-1 text-xs font-bold"
                        style={{ borderColor: "var(--site-line)", color: "var(--brand-red)" }}
                        aria-label={`Remover ${item.label}`}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}

              {comboActive ? (
                <div className="rounded-2xl bg-green-50 p-4 text-green-900">
                  <p className="text-xs font-extrabold uppercase tracking-[0.1em]">Desconto por combinação aplicado</p>
                  <p className="mt-1 text-sm">Economia total: <strong>{money(totals.discount)}</strong></p>
                </div>
              ) : (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                  Adicione mais 1 produto para ativar o desconto combinado.
                </p>
              )}

              {totals.subtotal > 0 ? (
                <div className="border-t pt-4" style={{ borderColor: "var(--site-line)" }}>
                  <div className="flex justify-between text-sm" style={{ color: "var(--site-muted)" }}>
                    <span>Subtotal</span>
                    <span>{money(totals.subtotal)}</span>
                  </div>
                  {totals.discount > 0 ? (
                    <div className="mt-1 flex justify-between text-sm font-semibold text-green-700">
                      <span>Descontos</span>
                      <span>-{money(totals.discount)}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <span className="font-bold">Total estimado</span>
                    <strong className="text-3xl" style={{ color: "var(--brand-navy)" }}>{money(totals.total)}</strong>
                  </div>
                  {totals.hasUnknownPrice ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--site-muted)" }}>+ item com valor sob consulta.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <button
            type="button"
            onClick={() => void submitRequest()}
            disabled={pending || !hasSelection}
            className="mt-5 w-full rounded-xl bg-[color:var(--brand-red)] px-4 py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Registrando..." : "Solicitar pelo WhatsApp"}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--site-muted)" }}>
            A solicitação fica registrada no painel e depois abre o WhatsApp com o carrinho preenchido. A contratação depende da avaliação do setor comercial.
          </p>
        </div>
      </aside>
    </section>
  );
}
