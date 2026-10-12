"use client";

import { useState, useTransition } from "react";
import {
  updateSiteOfferSettingsAction,
  type SiteOfferSettingsFormInput,
} from "../../app/sistema/configuracoes/valores-assine/actions";

export interface SiteOfferSettingsValues {
  annualSubscriptionPrice: number | null;
  printBusinessCardPrice: number;
  printStandardPrice: number;
  printQuarterPrice: number;
  printHalfPrice: number;
  printFullPrice: number;
  ledThreeCitiesPrice: number;
  comboBusinessCardLedPrice: number;
  comboStandardLedPrice: number;
  comboQuarterLedPrice: number;
  comboHalfLedPrice: number;
  comboFullLedPrice: number;
}

function toInput(values: SiteOfferSettingsValues): SiteOfferSettingsFormInput {
  return {
    annualSubscriptionPrice: values.annualSubscriptionPrice === null ? "" : String(values.annualSubscriptionPrice),
    printBusinessCardPrice: String(values.printBusinessCardPrice),
    printStandardPrice: String(values.printStandardPrice),
    printQuarterPrice: String(values.printQuarterPrice),
    printHalfPrice: String(values.printHalfPrice),
    printFullPrice: String(values.printFullPrice),
    ledThreeCitiesPrice: String(values.ledThreeCitiesPrice),
    comboBusinessCardLedPrice: String(values.comboBusinessCardLedPrice),
    comboStandardLedPrice: String(values.comboStandardLedPrice),
    comboQuarterLedPrice: String(values.comboQuarterLedPrice),
    comboHalfLedPrice: String(values.comboHalfLedPrice),
    comboFullLedPrice: String(values.comboFullLedPrice),
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
      setMessage("Valores atualizados. A página Assine passa a usar estes preços automaticamente.");
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

  return (
    <>
      <section className="form-section form-section--first">
        <h2>Assinatura</h2>
        <div className="form-grid">
          {moneyField(
            "Assinatura anual do jornal",
            "annualSubscriptionPrice",
            "Deixe em branco para o site mostrar “Valor sob consulta”.",
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Publicidade no jornal impresso</h2>
        <p className="helper-text">Valores individuais exibidos na página Assine. Todos os formatos continuam identificados como coloridos.</p>
        <div className="form-grid" style={{ marginTop: "12px" }}>
          {moneyField("Cartão de visita", "printBusinessCardPrice")}
          {moneyField("Padrão", "printStandardPrice")}
          {moneyField("1/4 de página", "printQuarterPrice")}
          {moneyField("Meia página", "printHalfPrice")}
          {moneyField("Página inteira", "printFullPrice")}
        </div>
      </section>

      <section className="form-section">
        <h2>Painéis digitais</h2>
        <div className="form-grid">
          {moneyField(
            "3 painéis — São João do Sul + Praia Grande + Passo de Torres",
            "ledThreeCitiesPrice",
            "Preço individual do pacote com os três painéis de LED.",
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Pacotes: impresso + painéis</h2>
        <p className="helper-text">
          Estes são os valores finais do combinado. O desconto mostrado no site é calculado automaticamente comparando este campo com a soma dos itens separados.
        </p>
        <div className="form-grid" style={{ marginTop: "12px" }}>
          {moneyField("Cartão de visita + 3 painéis", "comboBusinessCardLedPrice")}
          {moneyField("Padrão + 3 painéis", "comboStandardLedPrice")}
          {moneyField("1/4 de página + 3 painéis", "comboQuarterLedPrice")}
          {moneyField("Meia página + 3 painéis", "comboHalfLedPrice")}
          {moneyField("Página inteira + 3 painéis", "comboFullLedPrice")}
        </div>
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar valores"}
          </button>
        </div>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Alterar estes campos muda apenas os preços públicos e os preços sugeridos correspondentes no catálogo Comercial. Não altera vendas, propostas ou cobranças já existentes.
        </p>
      </section>
    </>
  );
}
