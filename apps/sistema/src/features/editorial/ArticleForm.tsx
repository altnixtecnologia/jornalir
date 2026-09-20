"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Article,
  ArticleMedia,
  EditorialPlacementType,
  EditorialSection,
  EditorialTextStyle,
  Locality,
  MediaAsset,
  NewspaperEdition,
  NotificationMode,
} from "@ir/types";
import { archiveArticle, createArticle, updateArticle } from "../../app/sistema/editorial/materias/actions";
import type { ArticleFormIntent, ArticleFormPayload } from "./articleFormTypes";
import {
  addGalleryMedia,
  moveGalleryMedia,
  removeCoverMedia,
  removeGalleryMedia,
  setCoverMedia,
  setMediaCaption,
  setMediaCredit,
} from "./articleMediaState";
import { ArticleBodyEditor } from "./ArticleBodyEditor";
import { ArticleMediaPicker } from "./ArticleMediaPicker";
import { DestinoEditorial } from "./DestinoEditorial";
import { TextStyleControl } from "./TextStyleControl";
import {
  articleOriginLabels,
  articleStatusLabels,
  editionPageLabel,
  formatDateTime,
  notificationLabels,
  placementLabels,
} from "./editorialLabels";
import { DEFAULT_TEXT_STYLE, textStyleToCss } from "./textStyle";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../../lib/datetimeLocal";

const LIST_HREF = "/sistema/editorial/materias";
const UNSAVED_CHANGES_MESSAGE =
  "Existem alterações não salvas nesta matéria. Deseja realmente sair sem salvar?";

interface ArticleFormProps {
  mode: "create" | "edit";
  article?: Article;
  sections: EditorialSection[];
  localities: Locality[];
  mediaAssets: MediaAsset[];
  editions?: NewspaperEdition[];
}

const PLACEMENT_OPTIONS: EditorialPlacementType[] = [
  "none",
  "headline",
  "mainHighlight",
  "secondaryHighlight",
  "urgent",
  "sectionHighlight",
  "special",
];

const NOTIFICATION_OPTIONS: NotificationMode[] = ["none", "normal", "urgent"];

export function ArticleForm({
  mode,
  article,
  sections,
  localities,
  mediaAssets,
  editions = [],
}: ArticleFormProps): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [titleStyle, setTitleStyle] = useState<EditorialTextStyle>(article?.titleStyle ?? DEFAULT_TEXT_STYLE);
  const [subtitle, setSubtitle] = useState(article?.subtitle ?? "");
  const [subtitleStyle, setSubtitleStyle] = useState<EditorialTextStyle>(
    article?.subtitleStyle ?? DEFAULT_TEXT_STYLE,
  );
  const [body, setBody] = useState(article?.body ?? "");
  const [sectionId, setSectionId] = useState(article?.sectionId ?? "");
  const [localityId, setLocalityId] = useState(article?.localityId ?? "");
  const [notificationMode, setNotificationMode] = useState<NotificationMode>(
    article?.notificationMode ?? "none",
  );
  const [placementType, setPlacementType] = useState<EditorialPlacementType>(
    article?.placement.type ?? "none",
  );
  const [placementStartsAt, setPlacementStartsAt] = useState(
    toDatetimeLocalValue(article?.placement.startsAt),
  );
  const [placementEndsAt, setPlacementEndsAt] = useState(
    toDatetimeLocalValue(article?.placement.endsAt),
  );
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(article?.scheduledAt));
  const [editionPageNumber, setEditionPageNumber] = useState(article?.editionPageNumber?.toString() ?? "");
  const [media, setMedia] = useState<ArticleMedia[]>(article?.media ?? []);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasPlacementWindow = placementType !== "none";

  const edition = article?.editionId ? editions.find((item) => item.id === article.editionId) : undefined;
  const selectedSection = sections.find((section) => section.id === sectionId);
  const selectedLocality = localities.find((locality) => locality.id === localityId);
  const publicationLine = (() => {
    if (article?.status === "published") return `Publicada em ${formatDateTime(article.publishedAt)}`;
    if (article?.status === "archived") return "Arquivada — fora de circulação";
    if (scheduledAt) return `Programada para ${formatDateTime(fromDatetimeLocalValue(scheduledAt))}`;
    return "Ainda em rascunho — não publicada";
  })();

  // Editorias/localidades inativas somem das opções de escolha, mas uma já
  // atribuída a esta matéria continua visível (nunca escondida por baixo dos
  // olhos de quem está editando um conteúdo existente).
  const availableSections = sections.filter((section) => section.active || section.id === article?.sectionId);
  const availableLocalities = localities.filter(
    (locality) => locality.active || locality.id === article?.localityId,
  );

  function buildPayload(): ArticleFormPayload {
    return {
      title,
      titleStyle,
      subtitle,
      subtitleStyle,
      body,
      sectionId,
      localityId,
      notificationMode,
      placementType,
      placementStartsAt: fromDatetimeLocalValue(placementStartsAt),
      placementEndsAt: fromDatetimeLocalValue(placementEndsAt),
      scheduledAt: fromDatetimeLocalValue(scheduledAt),
      media,
      editionPageNumber,
    };
  }

  // Snapshot dos valores iniciais (calculado uma única vez) para detectar
  // alterações não salvas e avisar antes de sair da edição.
  const [initialSnapshot] = useState(() =>
    JSON.stringify({
      title,
      titleStyle,
      subtitle,
      subtitleStyle,
      body,
      sectionId,
      localityId,
      notificationMode,
      placementType,
      placementStartsAt,
      placementEndsAt,
      scheduledAt,
      media,
      editionPageNumber,
    }),
  );
  const isDirty =
    initialSnapshot !==
    JSON.stringify({
      title,
      titleStyle,
      subtitle,
      subtitleStyle,
      body,
      sectionId,
      localityId,
      notificationMode,
      placementType,
      placementStartsAt,
      placementEndsAt,
      scheduledAt,
      media,
      editionPageNumber,
    });
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const justSavedRef = useRef(false);

  // Avisa ao fechar a aba, atualizar ou navegar para fora do site com
  // alterações não salvas. Não cobre navegação interna pela barra lateral
  // (exigiria um guard de rota mais amplo, fora do escopo desta fase).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!isDirtyRef.current || justSavedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function handleBack(): void {
    if (isDirty && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      return;
    }
    router.push(LIST_HREF);
  }

  function handleAction(intent: ArticleFormIntent): void {
    setFormError(null);
    const payload = buildPayload();
    startTransition(async () => {
      const result =
        mode === "edit" && article
          ? await updateArticle(article.id, payload, intent)
          : await createArticle(payload, intent);
      if (result?.error) {
        setFormError(result.error);
      } else {
        justSavedRef.current = true;
      }
    });
  }

  function handleArchive(): void {
    if (!article) return;
    if (!window.confirm("Arquivar esta matéria? Ela deixará de aparecer como conteúdo ativo.")) {
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await archiveArticle(article.id);
      if (result?.error) {
        setFormError(result.error);
      } else {
        justSavedRef.current = true;
      }
    });
  }

  return (
    <div className="article-form">
      <button type="button" className="secondary-link form-back-link" onClick={handleBack}>
        ← Voltar à listagem
      </button>

      <div className="article-form-layout">
        {/* Coluna principal: exatamente a prioridade do dia a dia — fotos, título, subtítulo, texto. */}
        <div className="article-form-main">
          <section className="form-section form-section--first" aria-labelledby="imagens-title">
            <h2 id="imagens-title">Imagens</h2>
            <p className="helper-text">
              Nenhuma, uma ou várias fotos. Com várias: escolha a capa, monte a galeria, ordene e
              defina legenda e crédito individuais.
            </p>
            <ArticleMediaPicker
              mediaAssets={mediaAssets}
              media={media}
              onSetCover={(id) => setMedia((prev) => setCoverMedia(prev, id))}
              onRemoveCover={() => setMedia((prev) => removeCoverMedia(prev))}
              onAddToGallery={(id) => setMedia((prev) => addGalleryMedia(prev, id))}
              onRemoveFromGallery={(id) => setMedia((prev) => removeGalleryMedia(prev, id))}
              onMoveGalleryItem={(id, direction) => setMedia((prev) => moveGalleryMedia(prev, id, direction))}
              onSetCaption={(id, caption) => setMedia((prev) => setMediaCaption(prev, id, caption))}
              onSetCredit={(id, credit) => setMedia((prev) => setMediaCredit(prev, id, credit))}
            />
          </section>

          <section className="form-section" aria-labelledby="identificacao-title">
            <h2 id="identificacao-title">Identificação</h2>
            <div className="form-field">
              <div className="field-label-row">
                <label htmlFor="field-title" className="field-label">
                  Título
                </label>
                <TextStyleControl label="Título" value={titleStyle} onChange={setTitleStyle} />
              </div>
              <input
                id="field-title"
                className="field-title-input"
                style={textStyleToCss(titleStyle, "title")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título da matéria"
              />
            </div>
            <div className="form-field">
              <div className="field-label-row">
                <label htmlFor="field-subtitle" className="field-label">
                  Subtítulo <span className="field-optional">(opcional)</span>
                </label>
                <TextStyleControl label="Subtítulo" value={subtitleStyle} onChange={setSubtitleStyle} />
              </div>
              <input
                id="field-subtitle"
                className="field-subtitle-input"
                style={textStyleToCss(subtitleStyle, "subtitle")}
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                placeholder="Subtítulo da matéria"
              />
            </div>
          </section>

          <section className="form-section" aria-labelledby="conteudo-title">
            <h2 id="conteudo-title">Texto</h2>
            <ArticleBodyEditor value={body} onChange={setBody} />
          </section>
        </div>

        {/* Coluna secundária: editoria/localidade, publicação sempre à mão, e o que é usado com menos frequência dentro de "Mais opções". */}
        <div className="article-form-aside">
          {article ? (
            <section className="form-section form-section--compact" aria-labelledby="origem-title">
              <h2 id="origem-title">Origem</h2>
              <p className="helper-text">
                <span className={`origin-pill origin-pill--${article.origin}`}>
                  {articleOriginLabels[article.origin]}
                </span>
              </p>
              {edition ? (
                <>
                  <p className="field-static-value">{editionPageLabel(edition.title, article.editionPageNumber)}</p>
                  <div className="form-field">
                    <label htmlFor="field-edition-page" className="field-label">
                      Página na edição <span className="field-optional">(corrigir se necessário)</span>
                    </label>
                    <input
                      id="field-edition-page"
                      type="number"
                      min={1}
                      value={editionPageNumber}
                      onChange={(event) => setEditionPageNumber(event.target.value)}
                    />
                  </div>
                  {edition.pdfUrl ? (
                    <a href={edition.pdfUrl} target="_blank" rel="noreferrer" className="section-more">
                      Ver esta matéria na edição digital
                    </a>
                  ) : (
                    <p className="helper-text destino-muted">
                      Link para a edição digital indisponível ainda.
                    </p>
                  )}
                </>
              ) : (
                <p className="helper-text">Matéria cadastrada diretamente no painel, sem vínculo com edição impressa.</p>
              )}
            </section>
          ) : null}

          <section className="form-section form-section--compact" aria-labelledby="classificacao-title">
            <h2 id="classificacao-title">Classificação</h2>
            <div className="form-field">
              <label htmlFor="field-section" className="field-label">
                Editoria
              </label>
              <select id="field-section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                <option value="">Selecione a editoria</option>
                {availableSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="field-locality" className="field-label">
                Localidade
              </label>
              <select id="field-locality" value={localityId} onChange={(event) => setLocalityId(event.target.value)}>
                <option value="">Selecione a localidade</option>
                {availableLocalities.map((locality) => (
                  <option key={locality.id} value={locality.id}>
                    {locality.name}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="form-section form-section--compact" aria-labelledby="publicacao-title">
            <h2 id="publicacao-title">Publicação</h2>
            {article ? (
              <p className="helper-text">
                Status atual:{" "}
                <span className={`status-pill status-pill--${article.status}`}>
                  {articleStatusLabels[article.status]}
                </span>
              </p>
            ) : (
              <p className="helper-text">Status inicial: rascunho, a menos que você publique ou programe agora.</p>
            )}
            <div className="form-field">
              <label htmlFor="field-scheduled-at" className="field-label">
                Data e hora da programação <span className="field-optional">(obrigatório para programar)</span>
              </label>
              <input
                id="field-scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
          </section>

          <DestinoEditorial
            sectionName={selectedSection?.name}
            localityName={selectedLocality?.name}
            placementType={placementType}
            placementStartsAt={fromDatetimeLocalValue(placementStartsAt)}
            placementEndsAt={fromDatetimeLocalValue(placementEndsAt)}
            notificationMode={notificationMode}
            publicationLine={publicationLine}
            editionLine={edition ? editionPageLabel(edition.title, article?.editionPageNumber) : null}
            digitalEditionUrl={edition?.pdfUrl}
          />

          <details className="more-options">
            <summary>Mais opções</summary>
            <div className="more-options-panel">
              <div className="form-field">
                <span className="field-label">Referência interna</span>
                <p className="field-static-value">{article?.reference ?? "Gerada automaticamente ao salvar"}</p>
              </div>

              <p className="field-label">Exposição editorial</p>
              <p className="helper-text">O destaque é temporário e não altera a editoria da matéria.</p>
              <div className="form-field">
                <label htmlFor="field-placement" className="field-label">
                  Posição editorial
                </label>
                <select
                  id="field-placement"
                  value={placementType}
                  onChange={(event) => setPlacementType(event.target.value as EditorialPlacementType)}
                >
                  {PLACEMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "none" ? "Nenhuma" : placementLabels[option]}
                    </option>
                  ))}
                </select>
              </div>
              {hasPlacementWindow ? (
                <>
                  <div className="form-field">
                    <label htmlFor="field-placement-start" className="field-label">
                      Início do destaque <span className="field-optional">(opcional)</span>
                    </label>
                    <input
                      id="field-placement-start"
                      type="datetime-local"
                      value={placementStartsAt}
                      onChange={(event) => setPlacementStartsAt(event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="field-placement-end" className="field-label">
                      Fim do destaque <span className="field-optional">(opcional)</span>
                    </label>
                    <input
                      id="field-placement-end"
                      type="datetime-local"
                      value={placementEndsAt}
                      onChange={(event) => setPlacementEndsAt(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
              <div className="form-field">
                <label htmlFor="field-notification" className="field-label">
                  Notificação
                </label>
                <select
                  id="field-notification"
                  value={notificationMode}
                  onChange={(event) => setNotificationMode(event.target.value as NotificationMode)}
                >
                  {NOTIFICATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {notificationLabels[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>
        </div>
      </div>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" onClick={() => handleAction("draft")} disabled={pending}>
          Salvar rascunho
        </button>
        <button
          type="button"
          className="form-action-primary"
          onClick={() => handleAction("publish")}
          disabled={pending}
        >
          Publicar agora
        </button>
        <button type="button" onClick={() => handleAction("schedule")} disabled={pending}>
          Programar
        </button>
        {mode === "edit" ? (
          <button type="button" className="form-action-danger" onClick={handleArchive} disabled={pending}>
            Arquivar
          </button>
        ) : null}
      </div>
    </div>
  );
}
