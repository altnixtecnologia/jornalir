import type { EditorialEmphasis, EditorialTextSize, EditorialTextStyle } from "@ir/types";
import { TEXT_EMPHASIS_LABELS, TEXT_SIZE_LABELS } from "./textStyle";

interface TextStyleControlProps {
  label: string;
  value: EditorialTextStyle;
  onChange: (value: EditorialTextStyle) => void;
}

const SIZE_OPTIONS: EditorialTextSize[] = ["default", "large", "xlarge"];
const EMPHASIS_OPTIONS: EditorialEmphasis[] = ["normal", "medium", "strong"];

/**
 * Botão pequeno e discreto para ajustes pontuais de título/subtítulo. Não é
 * um editor livre: apenas negrito, itálico, tamanho e peso/ênfase entre
 * opções limitadas (Plano Mestre, Parte C, item 7).
 */
export function TextStyleControl({ label, value, onChange }: TextStyleControlProps): JSX.Element {
  return (
    <details className="text-style-control">
      <summary aria-label={`Ajustes de formatação de ${label.toLowerCase()}`}>Aa</summary>
      <div className="text-style-panel">
        <div className="text-style-toggle-row">
          <button
            type="button"
            className={`text-style-toggle${value.bold ? " is-active" : ""}`}
            aria-pressed={value.bold}
            onClick={() => onChange({ ...value, bold: !value.bold })}
          >
            <strong>N</strong>
          </button>
          <button
            type="button"
            className={`text-style-toggle${value.italic ? " is-active" : ""}`}
            aria-pressed={value.italic}
            onClick={() => onChange({ ...value, italic: !value.italic })}
          >
            <em>I</em>
          </button>
        </div>
        <label className="text-style-field">
          Tamanho
          <select
            value={value.size}
            onChange={(event) => onChange({ ...value, size: event.target.value as EditorialTextSize })}
          >
            {SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {TEXT_SIZE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-style-field">
          Peso/ênfase
          <select
            value={value.emphasis}
            onChange={(event) => onChange({ ...value, emphasis: event.target.value as EditorialEmphasis })}
          >
            {EMPHASIS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {TEXT_EMPHASIS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
