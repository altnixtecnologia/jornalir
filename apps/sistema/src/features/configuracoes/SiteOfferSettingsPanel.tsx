"use client";

import { useState, useTransition } from "react";
import {
  updateSiteOfferSettingsAction,
  type SiteOfferSettingsFormInput,
} from "../../app/sistema/configuracoes/valores-assine/actions";

export interface SiteOfferSettingsValues {
  annualSubscriptionPrice: number | null;
  annualSubscriptionComboDiscount: number;

  printBusinessCardPrice: number;
  printBusinessCardComboDiscount: number;
  printStandardPrice: number;
  printStandardComboDiscount: number;
  printQuarterPrice: number;
  printQuarterComboDiscount: number;
  printHalfPrice: number;
  printHalfComboDiscount: number;
  printFullPrice: number;
  printFullComboDiscount: number;

  ledSjs1x2Price: number;
  ledSjs1x2ComboDiscount: number;
  ledPraiaGrande1x2Price: number;
  ledPraiaGrande1x2ComboDiscount: number;
  ledPassoTorres1x2Price: number;
  ledPassoTorres1x2ComboDiscount: number;
  ledSjs4x2Price: number;
  ledSjs4x2ComboDiscount: number;
}

function formatMoneyInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function normalizeMoneyInput(value: string): string {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return value;
  return formatMoneyInput(parsed);
}

function toInput(values: SiteOfferSettingsValues): SiteOfferSettingsFormInput {
  return {
    annualSubscriptionPrice: values.annualSubscriptionPrice === null ? "" : formatMoneyInput(values.annualSubscriptionPrice),
    annualSubscriptionComboDiscount: formatMoneyInput(values.annualSubscriptionComboDiscount),

    printBusinessCardPrice: formatMoneyInput(values.printBusinessCardPrice),
    printBusinessCardComboDiscount: formatMoneyInput(values.printBusinessCardComboDiscount),
    printStandardPrice: formatMoneyInput(values.printStandardPrice),
    printStandardComboDiscount: formatMoneyInput(values.printStandardComboDiscount),
    printQuarterPrice: formatMoneyInput(values.printQuarterPrice),
    printQuarterComboDiscount: formatMoneyInput(values.printQuarterComboDiscount),
    printHalfPrice: formatMoneyInput(values.printHalfPrice),
    printHalfComboDiscount: formatMoneyInput(values.printHalfComboDiscount),
    printFullPrice: formatMoneyInput(values.printFullPrice),
    printFullComboDiscount: formatMoneyInput(values.printFullComboDiscount),

    ledSjs1x2Price: formatMoneyInput(values.ledSjs1x2Price),
    ledSjs1x2ComboDiscount: formatMoneyInput(values.ledSjs1x2ComboDiscount),
    ledPraiaGrande1x2Price: formatMoneyInput(values.ledPraiaGrande1x2Price),
    ledPraiaGrande1x2ComboDiscount: formatMoneyInput(values.ledPraiaGrande1x2ComboDiscount),
    ledPassoTorres1x2Price: formatMoneyInput(values.ledPassoTorres1x2Price),
    ledPassoTorres1x2ComboDiscount: formatMoneyInput(values.ledPassoTorres1x2ComboDiscount),
    ledSjs4x2Price: formatMoneyInput(values.ledSjs4x2Price),
    ledSjs4x2ComboDiscount: formatMoneyInput(values.ledSjs4x2ComboDiscount),
  };
}

export function SiteOfferSettingsPanel({ values }: { values: SiteOfferSettingsValues }): JSX.Element {
  const [input, setInput] = useState<SiteOfferSettingsFormInput>(() => toInput(values));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SiteOfferSettingsFormInput>(key: K, value: SiteOfferSettingsFormInput[K]): void {
    setInput((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function normalize(key: keyof SiteOfferSettingsFormInput): void {
    const value = input[key];
    if (!value.trim()) return;
    set(key, normalizeMoneyInput(value));
  }

  function save(): void {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const normalizedInput = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, value.trim() ? normalizeMoneyInput(value) : value]),
      ) as unknown as SiteOfferSettingsFormInput;

      setInput(normalizedInput);
      const result = await updateSiteOfferSettingsAction(normalizedInput);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("Valores e descontos atualizados.");
    });
  }

  function moneyField(key: keyof SiteOfferSettingsFormInput, ariaLabel: string, allowBlank = false): JSX.Element {
    return (
      <label className="assine-money-field">
        <span className="assine-money-input">
          <span className="assine-money-prefix">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={input[key]}
            placeholder={allowBlank ? "Sob consulta" : "0,00"}
            onChange={(event) => set(key, event.target.value)}
            onBlur={() => normalize(key)}
            aria-label={ariaLabel}
          />
        </span>
      </label>
    );
  }

  function productRow(
    label: string,
    priceKey: keyof SiteOfferSettingsFormInput,
    discountKey: keyof SiteOfferSettingsFormInput,
    helper?: string,
    allowBlankPrice = false,
  ): JSX.Element {
    return (
      <div className="assine-config-row">
        <div className="assine-config-product">
          <strong>{label}</strong>
          {helper ? <span>{helper}</span> : null}
        </div>
        <div>
          <span className="assine-config-column-label">Valor</span>
          {moneyField(priceKey, `Valor de ${label}`, allowBlankPrice)}
        </div>
        <div>
          <span className="assine-config-column-label">Desconto com 2+ itens</span>
          {moneyField(discountKey, `Desconto de ${label}`)}
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="form-section form-section--first">
        <div className="assine-config-intro">
          <div>
            <h2>Valores exibidos no site</h2>
            <p className="helper-text">
              O cliente escolhe os produtos separadamente. Com 2 ou mais itens, cada produto recebe o desconto definido na mesma linha.
            </p>
          </div>
          <p className="assine-config-example">Nos painéis digitais, valor R$ 0,00 = opção oculta no site.</p>
        </div>
      </section>

      <section className="form-section">
        <h2>Assinatura</h2>
        <div className="assine-config-list">
          {productRow(
            "Assinatura anual do jornal",
            "annualSubscriptionPrice",
            "annualSubscriptionComboDiscount",
            "Deixe vazio somente se quiser mostrar “Sob consulta”.",
            true,
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Jornal impresso</h2>
        <div className="assine-config-list">
          {productRow("Cartão de visita — 8,4 × 6 cm", "printBusinessCardPrice", "printBusinessCardComboDiscount")}
          {productRow("Padrão — 8,4 × 12 cm", "printStandardPrice", "printStandardComboDiscount")}
          {productRow("1/4 de página — 12,5 × 18 cm", "printQuarterPrice", "printQuarterComboDiscount")}
          {productRow("Meia página — 25 × 18 cm", "printHalfPrice", "printHalfComboDiscount")}
          {productRow("Página inteira — 25 × 36 cm", "printFullPrice", "printFullComboDiscount")}
        </div>
      </section>

      <section className="form-section">
        <h2>Painéis digitais</h2>
        <p className="helper-text">
          Cada painel tem preço próprio. Deixe R$ 0,00 para não oferecer aquela opção no site.
        </p>
        <div className="assine-config-list">
          {productRow("1 × 2 m — São João do Sul", "ledSjs1x2Price", "ledSjs1x2ComboDiscount")}
          {productRow("1 × 2 m — Praia Grande/SC", "ledPraiaGrande1x2Price", "ledPraiaGrande1x2ComboDiscount")}
          {productRow("1 × 2 m — Passo de Torres/SC", "ledPassoTorres1x2Price", "ledPassoTorres1x2ComboDiscount")}
          {productRow("4 × 2 m — Entrada de São João do Sul", "ledSjs4x2Price", "ledSjs4x2ComboDiscount")}
        </div>
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar valores e descontos"}
          </button>
        </div>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    </>
  );
}
