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

function toInput(values: SiteOfferSettingsValues): SiteOfferSettingsFormInput {
  return {
    annualSubscriptionPrice: values.annualSubscriptionPrice === null ? "" : String(values.annualSubscriptionPrice),
    annualSubscriptionComboDiscount: String(values.annualSubscriptionComboDiscount),

    printBusinessCardPrice: String(values.printBusinessCardPrice),
    printBusinessCardComboDiscount: String(values.printBusinessCardComboDiscount),

    printStandardPrice: String(values.printStandardPrice),
    printStandardComboDiscount: String(values.printStandardComboDiscount),

    printQuarterPrice: String(values.printQuarterPrice),
    printQuarterComboDiscount: String(values.printQuarterComboDiscount),

    printHalfPrice: String(values.printHalfPrice),
    printHalfComboDiscount: String(values.printHalfComboDiscount),

    printFullPrice: String(values.printFullPrice),
    printFullComboDiscount: String(values.printFullComboDiscount),

    ledThreeCitiesPrice: String(values.ledThreeCitiesPrice),
    ledThreeCitiesComboDiscount: String(values.ledThreeCitiesComboDiscount),
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

  function save(): void {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateSiteOfferSettingsAction(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("Valores e descontos atualizados. A página Assine usa estas configurações automaticamente.");
    });
  }

  function moneyField(
    label: string,
    key: keyof SiteOfferSettingsFormInput,
    helper?: string,
  ): JSX.Element {
    return (
      <label className="form-field">
        <span className="field-label">{label}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={input[key]}
          onChange={(event) => set(key, event.target.value)}
        />
        {helper ? <span className="helper-text">{helper}</span> : null}
      </label>
    );
  }

  function productRow(
    label: string,
    priceKey: keyof SiteOfferSettingsFormInput,
    discountKey: keyof SiteOfferSettingsFormInput,
    helper?: string,
  ): JSX.Element {
    return (
      <div className="form-grid" style={{ marginTop: "12px" }}>
        {moneyField(label + " — valor", priceKey, helper)}
        {moneyField(
          label + " — desconto com 2+ itens",
          discountKey,
          "Aplicado neste produto quando o carrinho tiver dois ou mais produtos.",
        )}
      </div>
    );
  }

  return (
    <>
      <section className="form-section form-section--first">
        <h2>Como funciona o desconto</h2>
        <p className="helper-text">
          O site não possui planos fechados. O cliente monta o carrinho escolhendo os produtos separadamente. Quando houver 2 ou mais produtos no carrinho, cada item recebe o desconto configurado no seu próprio campo.
        </p>
        <p className="helper-text" style={{ marginTop: "8px" }}>
          Exemplo: se dois produtos tiverem R$ 50,00 de desconto cada, o carrinho aplica R$ 100,00 de desconto total.
        </p>
      </section>

      <section className="form-section">
        <h2>Assinatura anual</h2>
        {productRow(
          "Assinatura anual do jornal",
          "annualSubscriptionPrice",
          "annualSubscriptionComboDiscount",
          "Deixe o valor em branco somente se quiser mostrar “Sob consulta”.",
        )}
      </section>

      <section className="form-section">
        <h2>Publicidade no jornal impresso</h2>
        <p className="helper-text">Cada formato tem seu preço e seu desconto próprio para compras combinadas.</p>
        {productRow("Cartão de visita", "printBusinessCardPrice", "printBusinessCardComboDiscount")}
        {productRow("Padrão", "printStandardPrice", "printStandardComboDiscount")}
        {productRow("1/4 de página", "printQuarterPrice", "printQuarterComboDiscount")}
        {productRow("Meia página", "printHalfPrice", "printHalfComboDiscount")}
        {productRow("Página inteira", "printFullPrice", "printFullComboDiscount")}
      </section>

      <section className="form-section">
        <h2>Painéis digitais</h2>
        {productRow(
          "3 painéis — São João do Sul + Praia Grande + Passo de Torres",
          "ledThreeCitiesPrice",
          "ledThreeCitiesComboDiscount",
          "Valor da divulgação nos três painéis de LED.",
        )}
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar valores e descontos"}
          </button>
        </div>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="helper-text" style={{ marginTop: "12px" }}>
          As alterações mudam os valores públicos do site. Não alteram propostas, vendas ou cobranças que já tenham sido criadas.
        </p>
      </section>
    </>
  );
}
