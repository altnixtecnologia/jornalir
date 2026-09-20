import type { EditorialPlacementType, NotificationMode } from "@ir/types";
import { formatDateTime, notificationLabels, placementLabels } from "./editorialLabels";

export interface DestinoEditorialProps {
  sectionName?: string;
  localityName?: string;
  placementType: EditorialPlacementType;
  placementStartsAt?: string;
  placementEndsAt?: string;
  notificationMode: NotificationMode;
  /** Frase pronta descrevendo a publicação (ex.: "Publicada em 21/09/2026", "Programada para..."). */
  publicationLine: string;
  editionLine?: string | null;
  /** Presente e com URL real = link ativo; ausente = nunca inventamos a URL. */
  digitalEditionUrl?: string;
}

/**
 * Resumo derivado — nunca inventa regra nova, só lê o que a própria matéria
 * (ou o candidato em revisão) já tem configurado, para responder de forma
 * simples "para onde essa matéria vai" antes de salvar/converter.
 */
export function DestinoEditorial({
  sectionName,
  localityName,
  placementType,
  placementStartsAt,
  placementEndsAt,
  notificationMode,
  publicationLine,
  editionLine,
  digitalEditionUrl,
}: DestinoEditorialProps): JSX.Element {
  const hasPlacement = placementType !== "none";

  return (
    <div className="destino-box">
      <p className="destino-title">Destino editorial</p>
      <ul className="destino-list">
        <li>
          <span className="destino-label">Editoria</span>
          <span>{sectionName ?? "Ainda não selecionada"}</span>
        </li>
        <li>
          <span className="destino-label">Localidade/região</span>
          <span>{localityName ?? "Ainda não selecionada"}</span>
        </li>
        <li>
          <span className="destino-label">Capa/destaque</span>
          <span>
            {hasPlacement ? placementLabels[placementType] : "Nenhum — aparece só na editoria/localidade acima"}
            {hasPlacement && (placementStartsAt || placementEndsAt) ? (
              <span className="destino-window">
                {" "}
                ({placementStartsAt ? formatDateTime(placementStartsAt) : "início livre"} até{" "}
                {placementEndsAt ? formatDateTime(placementEndsAt) : "fim livre"})
              </span>
            ) : null}
          </span>
        </li>
        <li>
          <span className="destino-label">Publicação</span>
          <span>{publicationLine}</span>
        </li>
        <li>
          <span className="destino-label">Notificação</span>
          <span>{notificationLabels[notificationMode]}</span>
        </li>
        {editionLine ? (
          <li>
            <span className="destino-label">Edição digital</span>
            <span>
              {editionLine}
              {digitalEditionUrl ? (
                <>
                  {" — "}
                  <a href={digitalEditionUrl} target="_blank" rel="noreferrer">
                    Ver esta matéria na edição digital
                  </a>
                </>
              ) : (
                <span className="destino-muted"> — link para a edição digital indisponível ainda</span>
              )}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
