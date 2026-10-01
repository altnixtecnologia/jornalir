"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Article,
  ArticleMedia,
  EditorialPlacementType,
  EditorialSection,
  EditorialTextStyle,
  Locality,
  LocalityScope,
  MediaAsset,
  NewspaperEdition,
  NotificationMode,
} from "@ir/types";
import { archiveArticle, createArticle, updateArticle } from "../../app/sistema/editorial/materias/actions";
import { createLocality } from "../../app/sistema/editorial/localidades/actions";
import type { ArticleFormIntent, ArticleFormPayload } from "./articleFormTypes";
import {
  addGalleryMedia,
  reorderArticleMedia,
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
  localityScopeLabels,
  notificationLabels,
  placementDescriptions,
  placementLabels,
} from "./editorialLabels";
import { DEFAULT_TEXT_STYLE, textStyleToCss } from "./textStyle";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../../lib/datetimeLocal";

const LIST_HREF = "/sistema/editorial/materias";
const UNSAVED_CHANGES_MESSAGE =
  "Existem alterações não salvas nesta matéria. Deseja realmente sair sem salvar?";

type ArticleEditorTab = "conteudo" | "imagens" | "publicacao";

interface ArticleFormProps {
  mode: "create" | "edit";
  article?: Article;
  sections: EditorialSection[];
  localities: Locality[];
  mediaAssets: MediaAsset[];
  editions?: NewspaperEdition[];
  initialTab?: ArticleEditorTab;
}

const PLACEMENT_OPTIONS: EditorialPlacementType[] = [
  "none",
  "mainCover",
  "highlightStrip",
  "latestNews",
  "localSpotlight",
];

const NOTIFICATION_OPTIONS: NotificationMode[] = ["none", "normal", "urgent"];

export function ArticleForm({
  mode,
  article,
  sections,
  localities,
  mediaAssets,
  editions = [],
  initialTab = "conteudo",
}: ArticleFormProps): JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ArticleEditorTab>(initialTab);
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
  const [pinned, setPinned] = useState(article?.placement.pinned ?? false);
  const [urgent, setUrgent] = useState(article?.urgent ?? false);
  const [placementStartsAt, setPlacementStartsAt] = useState(
    toDatetimeLocalValue(article?.placement.startsAt),
  );
  const [placementEndsAt, setPlacementEndsAt] = useState(
    toDatetimeLocalValue(article?.placement.endsAt),
  );
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(article?.scheduledAt));
  const [editionPageNumber, setEditionPageNumber] = useState(article?.editionPageNumber?.toString() ?? "");
  const [media, setMedia] = useState<ArticleMedia[]>(article?.media ?? []);
  const [availableMediaAssets, setAvailableMediaAssets] = useState<MediaAsset[]>(mediaAssets);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Abrangência (Fase 49) — lista local para poder adicionar uma nova sem
  // sair da matéria nem recarregar a página (a redação não precisa abrir
  // o módulo Localidades para uma cidade nova).
  const [localityOptions, setLocalityOptions] = useState<Locality[]>(localities);
  const [showNewLocality, setShowNewLocality] = useState(false);
  const [newLocalityName, setNewLocalityName] = useState("");
  const [newLocalityScope, setNewLocalityScope] = useState<LocalityScope>("city");
  const [newLocalityError, setNewLocalityError] = useState<string | null>(null);
  const [creatingLocality, startCreatingLocality] = useTransition();

  function handleCreateLocality(): void {
    setNewLocalityError(null);
    startCreatingLocality(async () => {
      const result = await createLocality({ name: newLocalityName, scope: newLocalityScope });
      if ("error" in result) {
        setNewLocalityError(result.error);
        return;
      }
      setLocalityOptions((current) => [...current, result.locality]);
      setLocalityId(result.locality.id);
      setNewLocalityName("");
      setShowNewLocality(false);
    });
  }

  const hasPlacementWindow = placementType !== "none";
  const edition = article?.editionId ? editions.find((item) => item.id === article.editionId) : undefined;
  const selectedSection = sections.find((section) => section.id === sectionId);
  const selectedLocality = localityOptions.find((locality) => locality.id === localityId);
  const availableSections = sections.filter((section) => section.active || section.id === article?.sectionId);
  const availableLocalities = localityOptions.filter(
    (locality) => locality.active || locality.id === article?.localityId,
  );

  const publicationLine = (() => {
    if (article?.status === "published") return `Publicada em ${formatDateTime(article.publishedAt)}`;
    if (article?.status === "archived") return "Arquivada — fora de circulação";
    if (scheduledAt) return `Programada para ${formatDateTime(fromDatetimeLocalValue(scheduledAt))}`;
    return "Ainda em rascunho — não publicada";
  })();

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
      pinned,
      urgent,
      placementStartsAt: fromDatetimeLocalValue(placementStartsAt),
      placementEndsAt: fromDatetimeLocalValue(placementEndsAt),
      scheduledAt: fromDatetimeLocalValue(scheduledAt),
      media,
      editionPageNumber,
    };
  }

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
      pinned,
      urgent,
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
      pinned,
      urgent,
      placementStartsAt,
      placementEndsAt,
      scheduledAt,
      media,
      editionPageNumber,
    });
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const justSavedRef = useRef(false);

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
    if (isDirty && !window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
    router.push(LIST_HREF);
  }

  function handleAction(intent: ArticleFormIntent, returnTab?: ArticleEditorTab): void {
    setFormError(null);
    const payload = buildPayload();
    startTransition(async () => {
      const result =
        mode === "edit" && article
          ? await updateArticle(article.id, payload, intent, returnTab)
          : await createArticle(payload, intent, returnTab);
      if (result?.error) {
        setFormError(result.error);
      } else {
        justSavedRef.current = true;
      }
    });
  }

  function handleArchive(): void {
    if (!article) return;
    if (!window.confirm("Arquivar esta matéria? Ela deixará de aparecer como conteúdo ativo.")) return;
    setFormError(null);
    startTransition(async () => {
      const result = await archiveArticle(article.id);
      if (result?.error) setFormError(result.error);
      else justSavedRef.current = true;
    });
  }

  const tabs: { id: ArticleEditorTab; label: string; step: string }[] = [
    { id: "conteudo", label: "Matéria", step: "1" },
    { id: "imagens", label: "Imagens", step: "2" },
    { id: "publicacao", label: "Publicação e destaque", step: "3" },
  ];

  return (
    <div className="article-form">
      <button type="button" className="form-back-link" onClick={handleBack}>
        ← Voltar às matérias
      </button>

      <nav className="article-tabs" aria-label="Etapas da matéria">
        {tabs.map((tab) => {
          const disabled = mode === "create" && tab.id !== "conteudo";
          return (
            <button
              key={tab.id}
              type="button"
              className={`article-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => !disabled && setActiveTab(tab.id)}
              disabled={disabled}
              aria-current={activeTab === tab.id ? "step" : undefined}
            >
              <span>{tab.step}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "conteudo" ? (
        <div className="article-step-layout">
          <div className="article-step-main">
            <section className="form-section form-section--first" aria-labelledby="identificacao-title">
              <h2 id="identificacao-title">Matéria</h2>
              <p className="helper-text article-step-intro">
                Escreva primeiro o conteúdo e classifique o assunto. Depois salve para seguir às imagens.
              </p>

              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="field-title" className="field-label">Título</label>
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

              <div className="form-field">
                <span className="field-label">Texto</span>
                <ArticleBodyEditor value={body} onChange={setBody} />
              </div>
            </section>
          </div>

          <aside className="article-step-aside">
            <section className="form-section form-section--compact" aria-labelledby="classificacao-title">
              <h2 id="classificacao-title">Assunto e localidade</h2>
              <div className="form-field">
                <label htmlFor="field-section" className="field-label">Assunto / editoria</label>
                <select id="field-section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                  <option value="">Selecione o assunto</option>
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="field-locality" className="field-label">Abrangência</label>
                <select id="field-locality" value={localityId} onChange={(event) => setLocalityId(event.target.value)}>
                  <option value="">Selecione a abrangência</option>
                  {availableLocalities.map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setShowNewLocality((value) => !value)}
                >
                  {showNewLocality ? "Cancelar" : "+ Nova abrangência"}
                </button>
                {showNewLocality ? (
                  <div className="inline-form inline-form--compact">
                    <div className="form-grid">
                      <label className="form-field">
                        <span className="field-label">Nome</span>
                        <input
                          value={newLocalityName}
                          onChange={(event) => setNewLocalityName(event.target.value)}
                          placeholder="Ex.: Balneário Gaivota"
                        />
                      </label>
                      <label className="form-field">
                        <span className="field-label">Tipo</span>
                        <select
                          value={newLocalityScope}
                          onChange={(event) => setNewLocalityScope(event.target.value as LocalityScope)}
                        >
                          {(["country", "state", "region", "city"] as LocalityScope[]).map((scope) => (
                            <option key={scope} value={scope}>{localityScopeLabels[scope]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {newLocalityError ? (
                      <p className="form-error" role="alert">{newLocalityError}</p>
                    ) : null}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="form-action-primary"
                        onClick={handleCreateLocality}
                        disabled={creatingLocality || !newLocalityName.trim()}
                      >
                        {creatingLocality ? "Cadastrando…" : "Cadastrar e selecionar"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

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
                      <label htmlFor="field-edition-page" className="field-label">Página na edição</label>
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
                        Abrir edição digital
                      </a>
                    ) : null}
                  </>
                ) : (
                  <p className="helper-text">Cadastro direto pelo painel.</p>
                )}
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}

      {activeTab === "imagens" ? (
        <section className="article-step-single" aria-labelledby="imagens-title">
          <div className="article-step-heading">
            <div>
              <p className="eyebrow">ETAPA 2</p>
              <h2 id="imagens-title">Imagens</h2>
            </div>
          </div>
          <ArticleMediaPicker
            mediaAssets={availableMediaAssets}
            media={media}
            onSetCover={(id) => setMedia((prev) => setCoverMedia(prev, id))}
            onRemoveCover={() => setMedia((prev) => removeCoverMedia(prev))}
            onAddToGallery={(id) => setMedia((prev) => addGalleryMedia(prev, id))}
            onRemoveFromGallery={(id) => setMedia((prev) => removeGalleryMedia(prev, id))}
            onReorderMedia={(draggedId, targetId, placement) =>
              setMedia((prev) => reorderArticleMedia(prev, draggedId, targetId, placement))
            }
            onSetCaption={(id, caption) => setMedia((prev) => setMediaCaption(prev, id, caption))}
            onSetCredit={(id, credit) => setMedia((prev) => setMediaCredit(prev, id, credit))}
            onFilesUploaded={(uploaded) => {
              setAvailableMediaAssets((prev) => [...uploaded, ...prev]);
              setMedia((prev) => {
                let next = prev;
                for (const asset of uploaded) {
                  next = next.some((item) => item.role === "cover")
                    ? addGalleryMedia(next, asset.id)
                    : setCoverMedia(next, asset.id);
                }
                return next;
              });
            }}
          />
        </section>
      ) : null}

      {activeTab === "publicacao" ? (
        <div className="article-step-layout">
          <div className="article-step-main">
            <section className="form-section form-section--first" aria-labelledby="publicacao-title">
              <h2 id="publicacao-title">Publicação</h2>
              {article ? (
                <p className="helper-text">
                  Status atual:{" "}
                  <span className={`status-pill status-pill--${article.status}`}>
                    {articleStatusLabels[article.status]}
                  </span>
                </p>
              ) : null}
              <div className="form-field">
                <label htmlFor="field-scheduled-at" className="field-label">Data e hora para programar</label>
                <input
                  id="field-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="field-placement" className="field-label">Destaque na página principal</label>
                <select
                  id="field-placement"
                  value={placementType}
                  onChange={(event) => setPlacementType(event.target.value as EditorialPlacementType)}
                >
                  {PLACEMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{placementLabels[option]}</option>
                  ))}
                </select>
                <p className="helper-text">{placementDescriptions[placementType]}</p>
                <p className="helper-text">
                  Aqui você define o destino desta matéria. Para organizar todos os destaques juntos, use{" "}
                  <Link href="/sistema/editorial/destaques" className="text-link text-link--inline">
                    Gestão de destaques
                  </Link>.
                </p>
              </div>

              {placementType === "mainCover" ? (
                <label className="form-checkbox">
                  <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
                  Fixar na capa
                </label>
              ) : null}

              {hasPlacementWindow ? (
                <div className="form-grid">
                  <label className="form-field">
                    <span className="field-label">Início do destaque</span>
                    <input
                      type="datetime-local"
                      value={placementStartsAt}
                      onChange={(event) => setPlacementStartsAt(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Fim do destaque</span>
                    <input
                      type="datetime-local"
                      value={placementEndsAt}
                      onChange={(event) => setPlacementEndsAt(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              <div className="publication-options">
                <label className="form-checkbox">
                  <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />
                  Marcar como urgente
                </label>
                <div className="form-field">
                  <label htmlFor="field-notification" className="field-label">Notificação</label>
                  <select
                    id="field-notification"
                    value={notificationMode}
                    onChange={(event) => setNotificationMode(event.target.value as NotificationMode)}
                  >
                    {NOTIFICATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>{notificationLabels[option]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </div>

          <aside className="article-step-aside">
            <DestinoEditorial
              sectionName={selectedSection?.name}
              localityName={selectedLocality?.name}
              placementType={placementType}
              pinned={pinned}
              urgent={urgent}
              placementStartsAt={fromDatetimeLocalValue(placementStartsAt)}
              placementEndsAt={fromDatetimeLocalValue(placementEndsAt)}
              notificationMode={notificationMode}
              publicationLine={publicationLine}
              editionLine={edition ? editionPageLabel(edition.title, article?.editionPageNumber) : null}
              digitalEditionUrl={edition?.pdfUrl}
            />
            {article ? (
              <div className="article-reference-box">
                <span className="field-label">Referência interna</span>
                <p className="field-static-value">{article.reference}</p>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {formError ? <p className="form-error" role="alert">{formError}</p> : null}

      <div className="form-actions article-step-actions">
        {activeTab === "conteudo" ? (
          <button
            type="button"
            className="form-action-primary"
            onClick={() => handleAction(mode === "edit" ? "save" : "draft", "imagens")}
            disabled={pending}
          >
            {pending ? "Salvando…" : "Salvar e continuar para imagens"}
          </button>
        ) : null}

        {activeTab === "imagens" ? (
          <>
            <button type="button" onClick={() => setActiveTab("conteudo")} disabled={pending}>← Matéria</button>
            <button
              type="button"
              className="form-action-primary"
              onClick={() => handleAction("save", "publicacao")}
              disabled={pending}
            >
              {pending ? "Salvando…" : "Salvar e continuar para publicação"}
            </button>
          </>
        ) : null}

        {activeTab === "publicacao" ? (
          <>
            <button type="button" onClick={() => setActiveTab("imagens")} disabled={pending}>← Imagens</button>
            <button type="button" onClick={() => handleAction("save", "publicacao")} disabled={pending}>
              Salvar alterações
            </button>
            <button
              type="button"
              className="form-action-primary"
              onClick={() => handleAction("publish", "publicacao")}
              disabled={pending}
            >
              Publicar agora
            </button>
            <button type="button" onClick={() => handleAction("schedule", "publicacao")} disabled={pending}>
              Programar
            </button>
            {mode === "edit" ? (
              <button type="button" className="form-action-danger" onClick={handleArchive} disabled={pending}>
                Arquivar
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
