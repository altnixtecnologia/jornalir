"use client";

import { useMemo, useState } from "react";
import { contactInfo } from "../siteSettings";
import { getPublicSupabaseClient } from "../../../lib/public/supabasePublicClient";
import type { PublicSiteOfferSettings } from "../../../lib/public/siteOfferSettingsService";

type PrintOffer = {
  id: string;
  label: string;
  price: number;
  width: string;
  height: string;
};

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AssineConfigurator({ settings }: { settings: PublicSiteOfferSettings }): JSX.Element {
  const printOffers = useMemo<PrintOffer[]>(
    () => [
      { id: "business-card", label: "Cartão de visita", price: settings.printBusinessCardPrice, width: "42%", height: "18%" },
      { id: "standard", label: "Padrão", price: settings.printStandardPrice, width: "48%", height: "31%" },
      { id: "quarter", label: "1/4 de página", price: settings.printQuarterPrice, width: "48%", height: "48%" },
      { id: "half", label: "Meia página", price: settings.printHalfPrice, width: "96%", height: "48%" },
      { id: "full", label: "Página inteira", price: settings.printFullPrice, width: "96%", height: "94%" },
    ],
    [settings],
  );

  const comboPrices = useMemo<Record<string, number>>(
    () => ({
      "business-card": settings.comboBusinessCardLedPrice,
      standard: settings.comboStandardLedPrice,
      quarter: settings.comboQuarterLedPrice,
      half: settings.comboHalfLedPrice,
      full: settings.comboFullLedPrice,
    }),
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
  const hasAdvertising = Boolean(printOffer || digital);
  const hasSelection = annualSubscription || hasAdvertising;

  const advertisingTotal = useMemo(() => {
    if (printOffer && digital) return comboPrices[printOffer.id];
    return (printOffer?.price ?? 0) + (digital ? settings.ledThreeCitiesPrice : 0);
  }, [printOffer, digital, comboPrices, settings.ledThreeCitiesPrice]);

  const regularAdvertisingTotal = (printOffer?.price ?? 0) + (digital ? settings.ledThreeCitiesPrice : 0);
  const comboSaving = printOffer && digital ? Math.max(0, regularAdvertisingTotal - advertisingTotal) : 0;
  const annualPrice = settings.annualSubscriptionPrice;
  const knownTotal = advertisingTotal + (annualSubscription && annualPrice !== null ? annualPrice : 0);
  const hasKnownValue = knownTotal > 0;
  const hasUnpricedAnnual = annualSubscription && annualPrice === null;

  const selections = useMemo(() => {
    const result: Array<Record<string, unknown>> = [];

    if (annualSubscription) {
      result.push({
        type: "subscription",
        id: "annual-newspaper",
        label: "Assinatura anual para receber o jornal",
        price: annualPrice,
      });
    }

    if (printOffer) {
      result.push({
        type: "print_ad",
        id: printOffer.id,
        label: `Jornal impresso — ${printOffer.label}`,
        individualPrice: printOffer.price,
        color: true,
      });
    }

    if (digital) {
      result.push({
        type: "digital_ad",
        id: "led-3-cities",
        label: "3 painéis de LED — São João do Sul, Praia Grande e Passo de Torres",
        individualPrice: settings.ledThreeCitiesPrice,
      });
    }

    if (printOffer && digital) {
      result.push({
        type: "combo",
        id: `print-${printOffer.id}-plus-led`,
        label: `Pacote ${printOffer.label} + 3 painéis`,
        packagePrice: advertisingTotal,
      });
    }

    return result;
  }, [annualSubscription, annualPrice, printOffer, digital, settings.ledThreeCitiesPrice, advertisingTotal]);

  async function submitRequest(): Promise<void> {
    setError(null);

    if (!hasSelection) {
      setError("Selecione pelo menos uma opção antes de enviar.");
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

    const requestType = annualSubscription && hasAdvertising
      ? "mixed"
      : annualSubscription
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
        p_estimated_total: hasKnownValue ? knownTotal : null,
        p_notes: notes.trim() || null,
      });

      if (rpcError) throw rpcError;

      const protocol = typeof data === "string" ? data.slice(0, 8).toUpperCase() : "-";
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
        "Interesse:",
        annualSubscription
          ? `- Assinatura anual — ${annualPrice === null ? "sob consulta" : money(annualPrice)}`
          : null,
        printOffer ? `- Jornal impresso: ${printOffer.label} — ${money(printOffer.price)}` : null,
        digital ? `- Divulgação nos 3 painéis — ${money(settings.ledThreeCitiesPrice)}` : null,
        printOffer && digital ? `- Valor do pacote impresso + painéis: ${money(advertisingTotal)}` : null,
        hasKnownValue ? `- Estimativa total conhecida: ${money(knownTotal)}` : null,
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
    <div className="space-y-8">
      <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
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
              {annualSubscription ? "Selecionado" : "Adicionar"}
            </span>
            <strong className="mt-1 block text-lg">Assinatura anual</strong>
            <span className="mt-1 block text-sm" style={{ color: "var(--site-muted)" }}>
              {annualPrice === null ? "Valor sob consulta" : money(annualPrice)}
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
              Todos os formatos são coloridos. Os desenhos abaixo são apenas uma representação visual do espaço.
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
                <strong className="mt-3 block text-base">{offer.label}</strong>
                <span className="mt-1 block text-xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(offer.price)}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs" style={{ color: "var(--site-muted)" }}>
          A posição, disponibilidade e medidas finais do anúncio serão confirmadas pelo setor comercial antes da contratação.
        </p>
      </section>

      <section className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-center">
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
              {digital ? "Selecionado" : "Adicionar"}
            </span>
            <strong className="mt-1 block text-lg">3 cidades</strong>
            <span className="mt-1 block text-2xl font-extrabold" style={{ color: "var(--brand-navy)" }}>{money(settings.ledThreeCitiesPrice)}</span>
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="rounded-3xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
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
        </div>

        <aside className="h-fit rounded-3xl border p-6 xl:sticky xl:top-24" style={{ borderColor: "var(--site-line)", background: "var(--brand-navy)", color: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">Sua seleção</p>

          {!hasSelection ? (
            <p className="mt-4 text-sm text-white/75">Escolha uma assinatura, um formato impresso e/ou os painéis digitais.</p>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              {annualSubscription ? (
                <div className="flex justify-between gap-4">
                  <span>Assinatura anual</span>
                  <strong>{annualPrice === null ? "Sob consulta" : money(annualPrice)}</strong>
                </div>
              ) : null}
              {printOffer ? (
                <div className="flex justify-between gap-4">
                  <span>{printOffer.label}</span>
                  <strong>{money(printOffer.price)}</strong>
                </div>
              ) : null}
              {digital ? (
                <div className="flex justify-between gap-4">
                  <span>3 painéis digitais</span>
                  <strong>{money(settings.ledThreeCitiesPrice)}</strong>
                </div>
              ) : null}

              {printOffer && digital ? (
                <div className="mt-4 rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/65">Pacote combinado</p>
                  <p className="mt-1 text-3xl font-extrabold">{money(advertisingTotal)}</p>
                  {comboSaving > 0 ? (
                    <p className="mt-1 text-xs text-white/70">Economia estimada de {money(comboSaving)} sobre os itens separados.</p>
                  ) : null}
                </div>
              ) : null}

              {hasKnownValue ? (
                <div className="border-t border-white/20 pt-3">
                  <div className="flex justify-between gap-4 text-base">
                    <span>Estimativa total</span>
                    <strong>{money(knownTotal)}</strong>
                  </div>
                  {hasUnpricedAnnual ? (
                    <p className="mt-1 text-[11px] text-white/60">+ valor da assinatura anual, que está sob consulta.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <button
            type="button"
            onClick={() => void submitRequest()}
            disabled={pending}
            className="mt-5 w-full rounded-xl bg-[color:var(--brand-red)] px-4 py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Registrando..." : "Solicitar e continuar no WhatsApp"}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-white/60">
            O pedido fica registrado para acompanhamento e depois abre uma mensagem pronta no WhatsApp do Informativo Regional.
          </p>
        </aside>
      </section>
    </div>
  );
}
