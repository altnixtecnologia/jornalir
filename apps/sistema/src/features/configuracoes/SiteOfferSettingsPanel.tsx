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
  ledThreeCitiesPrice: number;
  ledThreeCitiesComboDiscount: number;
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
    ledThreeCitiesPrice: formatMoneyInput(values.ledThreeCitiesPrice),
    ledThreeCitiesComboDiscount: formatMoneyInput(values.ledThreeCitiesComboDiscount),
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
        Object.entries(input).map(([key, value]) => [
          key,
          value.trim() ? normalizeMoneyInput(value) : value,
        ]),
      ) as unknown as SiteOfferSettingsFormInput;

      setInput(normalizedInput);
      const result = await updateSiteOfferSettingsAction(normalizedInput);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("Valores e descontos atualizados. A página Assine usa estas configurações automaticamente.");
    });
  }

  function moneyField(
    key: keyof SiteOfferSettingsFormInput,
    ariaLabel: string,
    allowBlank = false,
  ): JSX.Element {
    return (
      <label className="assine-money-field">
        <span className="sr-only">{ariaLabel}</span>
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
              O cliente escolhe produtos separados. Com 2 ou mais itens, cada produto recebe o desconto definido na mesma linha.
            </p>
          </div>
          <p className="assine-config-example">Ex.: 2 itens com R$ 50,00 de desconto cada = R$ 100,00 de desconto no carrinho.</p>
        </div>
      </section>

      <section className="form-section">
        <h2>Assinatura</h2>
        <div className="assine-config-list">
          {productRow(
            "Assinatura anual do jornal",
            "annualSubscriptionPrice",
            "annualSubscriptionComboDiscount",
            "Deixe o valor vazio somente para mostrar “Sob consulta”.",
            true,
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Jornal impresso</h2>
        <div className="assine-config-list">
          {productRow("Cartão de visita", "printBusinessCardPrice", "printBusinessCardComboDiscount")}
          {productRow("Padrão", "printStandardPrice", "printStandardComboDiscount")}
          {productRow("1/4 de página", "printQuarterPrice", "printQuarterComboDiscount")}
          {productRow("Meia página", "printHalfPrice", "printHalfComboDiscount")}
          {productRow("Página inteira", "printFullPrice", "printFullComboDiscount")}
        </div>
      </section>

      <section className="form-section">
        <h2>Painéis digitais</h2>
        <div className="assine-config-list">
          {productRow(
            "3 painéis — São João do Sul + Praia Grande + Passo de Torres",
            "ledThreeCitiesPrice",
            "ledThreeCitiesComboDiscount",
          )}
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
        <p className="helper-text" style={{ marginTop: "10px" }}>
          As alterações valem para novas visualizações e solicitações do site. Propostas, vendas e cobranças já criadas não mudam.
        </p>
      </section>
    </>
  );
}
