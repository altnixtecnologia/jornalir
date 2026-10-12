"use client";

import { useMemo, useState } from "react";
import { getPublicSupabaseClient } from "../../../lib/public/supabasePublicClient";
import type { PublicSiteOfferSettings } from "../../../lib/public/siteOfferSettingsService";

type PrintOffer = {
  id: string;
  label: string;
  dimensions: string;
  price: number;
  comboDiscount: number;
  widthPct: number;
  heightPct: number;
};

type DigitalOffer = {
  id: string;
  label: string;
  location: string;
  dimensions: string;
  price: number;
  comboDiscount: number;
};

type CartItem = {
  id: string;
  label: string;
  price: number | null;
  comboDiscount: number;
  kind: "subscription" | "print_ad" | "digital_ad";
};

type PaymentPreference = "pix" | "boleto" | "credit_card" | "cash" | "to_define";

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
        dimensions: "8,4 × 6 cm",
        price: settings.printBusinessCardPrice,
        comboDiscount: settings.printBusinessCardComboDiscount,
        widthPct: 33.6,
        heightPct: 16.67,
      },
      {
        id: "standard",
        label: "Padrão",
        dimensions: "8,4 × 12 cm",
        price: settings.printStandardPrice,
        comboDiscount: settings.printStandardComboDiscount,
        widthPct: 33.6,
        heightPct: 33.33,
      },
      {
        id: "quarter",
        label: "1/4 de página",
        dimensions: "12,5 × 18 cm",
        price: settings.printQuarterPrice,
        comboDiscount: settings.printQuarterComboDiscount,
        widthPct: 50,
        heightPct: 50,
      },
      {
        id: "half",
        label: "Meia página",
        dimensions: "25 × 18 cm",
        price: settings.printHalfPrice,
        comboDiscount: settings.printHalfComboDiscount,
        widthPct: 100,
        heightPct: 50,
      },
      {
        id: "full",
        label: "Página inteira",
        dimensions: "25 × 36 cm",
        price: settings.printFullPrice,
        comboDiscount: settings.printFullComboDiscount,
        widthPct: 100,
        heightPct: 100,
      },
    ],
    [settings],
  );

  const digitalOffers = useMemo<DigitalOffer[]>(
    () =>
      [
        {
          id: "led-sjs-1x2",
          label: "Painel 1 × 2 m",
          location: "São João do Sul",
          dimensions: "1 × 2 m",
          price: settings.ledSjs1x2Price,
          comboDiscount: settings.ledSjs1x2ComboDiscount,
        },
        {
          id: "led-pg-1x2",
          label: "Painel 1 × 2 m",
          location: "Praia Grande/SC",
          dimensions: "1 × 2 m",
          price: settings.ledPraiaGrande1x2Price,
          comboDiscount: settings.ledPraiaGrande1x2ComboDiscount,
        },
        {
          id: "led-pt-1x2",
          label: "Painel 1 × 2 m",
          location: "Passo de Torres/SC",
          dimensions: "1 × 2 m",
          price: settings.ledPassoTorres1x2Price,
          comboDiscount: settings.ledPassoTorres1x2ComboDiscount,
        },
        {
          id: "led-sjs-4x2",
          label: "Painel grande 4 × 2 m",
          location: "Entrada de São João do Sul",
          dimensions: "4 × 2 m",
          price: settings.ledSjs4x2Price,
          comboDiscount: settings.ledSjs4x2ComboDiscount,
        },
      ].filter((item) => item.price > 0),
    [settings],
  );

  const [annualSubscription, setAnnualSubscription] = useState(false);
  const [printOfferId, setPrintOfferId] = useState<string | null>(null);
  const [digitalIds, setDigitalIds] = useState<string[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [successProtocol, setSuccessProtocol] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>("to_define");

  const [addressZip, setAddressZip] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");

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
        label: `Jornal impresso — ${printOffer.label} (${printOffer.dimensions})`,
        price: printOffer.price,
        comboDiscount: printOffer.comboDiscount,
        kind: "print_ad",
      });
    }

    for (const id of digitalIds) {
      const offer = digitalOffers.find((item) => item.id === id);
      if (!offer) continue;
      items.push({
        id: offer.id,
        label: `${offer.label} — ${offer.location}`,
        price: offer.price,
        comboDiscount: offer.comboDiscount,
        kind: "digital_ad",
      });
    }

    return items;
  }, [annualSubscription, printOffer, digitalIds, digitalOffers, settings]);

  const comboActive = cartItems.length >= 2;
  const hasSelection = cartItems.length > 0;
  const hasSubscription = cartItems.some((item) => item.kind === "subscription");

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

  function toggleDigital(id: string): void {
    setDigitalIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function removeItem(item: CartItem): void {
    if (item.kind === "subscription") setAnnualSubscription(false);
    if (item.kind === "print_ad") setPrintOfferId(null);
    if (item.kind === "digital_ad") setDigitalIds((current) => current.filter((id) => id !== item.id));
  }

  function openRequest(): void {
    setError(null);
    setSuccessProtocol(null);
    if (!hasSelection) {
      setError("Adicione pelo menos um item ao carrinho.");
      return;
    }
    setRequestOpen(true);
  }

  async function submitRequest(): Promise<void> {
    setError(null);

    if (name.trim().length < 2) {
      setError("Informe seu nome.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Informe um WhatsApp/telefone válido.");
      return;
    }
    if (paymentPreference === "to_define") {
      setError("Escolha a forma de pagamento que você prefere.");
      return;
    }
    if (hasSubscription) {
      if (
        !addressZip.trim() ||
        !addressStreet.trim() ||
        !addressNumber.trim() ||
        !addressNeighborhood.trim() ||
        !addressCity.trim() ||
        addressState.trim().length !== 2
      ) {
        setError("Para assinatura, informe o endereço completo para verificarmos a rota de entrega.");
        return;
      }
    }
    if (!consent) {
      setError("Confirme o uso dos dados para retorno desta solicitação.");
      return;
    }

    const hasAdvertising = cartItems.some((item) => item.kind !== "subscription");
    const requestType = hasSubscription && hasAdvertising ? "mixed" : hasSubscription ? "subscription" : "advertising";

    setPending(true);
    try {
      const client = getPublicSupabaseClient();
      const { data, error: rpcError } = await client.rpc("submit_site_interest_request_v2", {
        p_request_type: requestType,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_email: email.trim() || null,
        p_company: company.trim() || null,
        p_selections: selections,
        p_estimated_total: totals.subtotal > 0 ? totals.total : null,
        p_notes: notes.trim() || null,
        p_payment_preference: paymentPreference,
        p_address_zip: hasSubscription ? addressZip.trim() : null,
        p_address_street: hasSubscription ? addressStreet.trim() : null,
        p_address_number: hasSubscription ? addressNumber.trim() : null,
        p_address_complement: hasSubscription ? addressComplement.trim() || null : null,
        p_address_neighborhood: hasSubscription ? addressNeighborhood.trim() : null,
        p_address_city: hasSubscription ? addressCity.trim() : null,
        p_address_state: hasSubscription ? addressState.trim().toUpperCase() : null,
      });

      if (rpcError) throw rpcError;
      setSuccessProtocol(typeof data === "string" ? data.slice(0, 8).toUpperCase() : "RECEBIDA");
      setPending(false);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Não foi possível registrar a solicitação agora.");
    }
  }

  return (
    <>
      <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
        <div className="space-y-8">
          <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-center">
              <div>
                <p className="kicker">ASSINATURA</p>
                <h2 className="mt-3 font-editorial text-3xl font-bold md:text-4xl">Receba o Informativo Regional</h2>
                <p className="mt-3 max-w-2xl text-sm md:text-base" style={{ color: "var(--site-muted)" }}>
                  Assinatura anual do jornal impresso. Antes da confirmação, verificamos se o endereço faz parte da rota de entrega.
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
                  Todos os formatos são coloridos. As medidas abaixo seguem a página impressa de 25 × 36 cm.
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
                      <div className="relative aspect-[25/36] h-full max-h-[132px] border-2 border-zinc-300 bg-zinc-50">
                        <div
                          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-[color:var(--brand-red)] bg-red-50 px-1 text-center text-[7px] font-bold text-red-700"
                          style={{
                            width: `${Math.min(96, offer.widthPct)}%`,
                            height: `${Math.min(96, offer.heightPct)}%`,
                          }}
                        >
                          ANÚNCIO
                        </div>
                      </div>
                    </div>
                    <span className="mt-3 block text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--brand-red)" }}>
                      {selected ? "No carrinho" : "Adicionar"}
                    </span>
                    <strong className="mt-1 block text-base">{offer.label}</strong>
                    <span className="mt-0.5 block text-xs font-semibold" style={{ color: "var(--site-muted)" }}>{offer.dimensions}</span>
                    <span className="mt-1 block text-xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(offer.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {digitalOffers.length > 0 ? (
            <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
              <p className="kicker">PAINÉIS DIGITAIS</p>
              <h2 className="mt-3 font-editorial text-3xl font-bold md:text-4xl">Escolha onde divulgar</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>
                Você pode selecionar um ou mais painéis. Período, frequência e disponibilidade são confirmados pelo Comercial.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {digitalOffers.map((offer) => {
                  const selected = digitalIds.includes(offer.id);
                  return (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => toggleDigital(offer.id)}
                      className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "ring-2 ring-[color:var(--brand-red)]" : ""}`}
                      style={{ borderColor: "var(--site-line)", background: selected ? "var(--site-bg)" : "transparent" }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--brand-red)" }}>
                        {selected ? "No carrinho" : "Adicionar"}
                      </span>
                      <strong className="mt-2 block text-lg">{offer.label}</strong>
                      <span className="mt-1 block text-sm" style={{ color: "var(--site-muted)" }}>{offer.location} · {offer.dimensions}</span>
                      <span className="mt-3 block text-2xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(offer.price)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside
          className="h-fit overflow-hidden rounded-3xl border shadow-xl xl:sticky xl:top-24"
          style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
        >
          <div className="px-6 py-5 text-white" style={{ background: "var(--brand-navy)" }}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Seu carrinho</p>
            <h2 className="mt-1 text-2xl font-extrabold">{cartItems.length} {cartItems.length === 1 ? "item" : "itens"}</h2>
            <p className="mt-3 text-xs leading-relaxed text-white/70">
              Com 2 ou mais produtos, cada item recebe o desconto configurado para ele.
            </p>
          </div>

          <div className="p-6">
            {!hasSelection ? (
              <div className="rounded-2xl border border-dashed p-5 text-center" style={{ borderColor: "var(--site-line)" }}>
                <p className="text-sm font-semibold">Seu carrinho está vazio.</p>
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
                              <span className="ml-2 rounded-full bg-green-100 px-2 py-1 text-[10px] font-extrabold text-green-800">-{money(itemDiscount)}</span>
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
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}

                {comboActive ? (
                  <div className="rounded-2xl bg-green-50 p-4 text-green-900">
                    <p className="text-xs font-extrabold uppercase tracking-[0.1em]">Desconto combinado</p>
                    <p className="mt-1 text-sm">Economia: <strong>{money(totals.discount)}</strong></p>
                  </div>
                ) : null}

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
                    {totals.hasUnknownPrice ? <p className="mt-2 text-xs">+ item sob consulta</p> : null}
                  </div>
                ) : null}
              </div>
            )}

            <button
              type="button"
              onClick={openRequest}
              disabled={!hasSelection}
              className="mt-5 w-full rounded-xl bg-[color:var(--brand-red)] px-4 py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Solicitar análise
            </button>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--site-muted)" }}>
              Nenhuma cobrança é feita agora. A equipe verifica rota/disponibilidade e entra em contato pelo WhatsApp para confirmação.
            </p>
            {error && !requestOpen ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
          </div>
        </aside>
      </section>

      {requestOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0" aria-label="Fechar" onClick={() => !pending && setRequestOpen(false)} />
          <div className="relative z-10 max-h-[92svh] w-full overflow-y-auto rounded-t-3xl border bg-white p-6 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7" style={{ borderColor: "var(--site-line)" }}>
            {successProtocol ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-800">✓</div>
                <h2 className="mt-4 font-editorial text-3xl font-bold">Solicitação recebida</h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
                  Protocolo <strong>{successProtocol}</strong>. Vamos verificar {hasSubscription ? "a rota de entrega e " : ""}a disponibilidade.
                  Depois entraremos em contato pelo WhatsApp para confirmar valores e a forma de pagamento.
                </p>
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                  Esta etapa não gera cobrança automática.
                </p>
                <button type="button" className="mt-5 rounded-xl bg-[color:var(--brand-navy)] px-5 py-3 text-sm font-bold text-white" onClick={() => setRequestOpen(false)}>
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="kicker">SOLICITAÇÃO</p>
                    <h2 className="mt-2 font-editorial text-3xl font-bold">Dados para análise e retorno</h2>
                    <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>
                      {hasSubscription
                        ? "Precisamos do endereço para verificar se a entrega faz parte da nossa rota."
                        : "A equipe comercial vai verificar disponibilidade antes de confirmar a contratação."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setRequestOpen(false)} className="rounded-full border px-3 py-2 text-sm" style={{ borderColor: "var(--site-line)" }}>✕</button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">Nome *</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">WhatsApp *</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">E-mail</span>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">Empresa/anunciante</span>
                    <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                  </label>

                  {hasSubscription ? (
                    <>
                      <div className="sm:col-span-2 mt-1 border-t pt-4" style={{ borderColor: "var(--site-line)" }}>
                        <strong className="text-sm">Endereço para verificar a rota de entrega</strong>
                      </div>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">CEP *</span>
                        <input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} inputMode="numeric" className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">Rua *</span>
                        <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">Número *</span>
                        <input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">Complemento</span>
                        <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">Bairro *</span>
                        <input value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">Cidade *</span>
                        <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">UF *</span>
                        <input maxLength={2} value={addressState} onChange={(e) => setAddressState(e.target.value.toUpperCase())} className="w-full rounded-xl border px-4 py-3 uppercase" style={{ borderColor: "var(--site-line)" }} />
                      </label>
                    </>
                  ) : null}

                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-semibold">Como prefere pagar? *</span>
                    <select value={paymentPreference} onChange={(e) => setPaymentPreference(e.target.value as PaymentPreference)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }}>
                      <option value="to_define">Selecione</option>
                      <option value="pix">Pix</option>
                      <option value="boleto">Boleto</option>
                      <option value="credit_card">Cartão</option>
                      <option value="cash">Dinheiro</option>
                    </select>
                    <span className="mt-1 block text-[11px]" style={{ color: "var(--site-muted)" }}>
                      É apenas sua preferência. A cobrança só será enviada depois da análise e confirmação.
                    </span>
                  </label>

                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-semibold">Observação</span>
                    <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--site-line)" }} />
                  </label>
                </div>

                <label className="mt-4 flex items-start gap-3 text-xs" style={{ color: "var(--site-muted)" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  <span>Autorizo o uso destes dados para análise da solicitação e contato pelo Informativo Regional.</span>
                </label>

                {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setRequestOpen(false)} disabled={pending} className="rounded-xl border px-5 py-3 text-sm font-bold" style={{ borderColor: "var(--site-line)" }}>
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void submitRequest()} disabled={pending} className="rounded-xl bg-[color:var(--brand-red)] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50">
                    {pending ? "Enviando..." : "Enviar solicitação"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
