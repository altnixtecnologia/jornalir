"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveEditorialBirthday, setEditorialBirthdayActive, setBirthdayPublication, prepareBirthdayEditionMessage,
  saveManualBirthdayMessage, setBirthdayEntryPhoto, removeBirthdayEntryPhoto, savePersonalizedBirthdayProfile,
  pickBirthdayMessageTemplate, generateBirthdayMessageWithAI, isBirthdayAiConfigured,
  listBirthdayMessageTemplates, saveBirthdayMessageTemplate,
} from "../../app/sistema/aniversariantes/actions";
import type { BirthdayMessageTemplateRow } from "../../app/sistema/aniversariantes/actions";
import type { EditorialBirthdayInput, EditorialBirthdayMessage } from "./editorialBirthdayTypes";
import { FAMILY_LABELS, listTemplateSummaries, renderTemplateByKey, type TemplateSummary } from "./messageGenerator";
import {
  dayIndexWithinRange,
  formatBirthDateShort,
  formatDateLong,
  formatDateShort,
  getMonthRange,
  getNewspaperWeekRange,
  isBirthdayWithinRange,
  isSameDay,
  listNewspaperWeekDays,
  matchesDay,
  shiftWeeks,
  weekdayAbbr,
  weekdayFull,
  type BirthdayEntry,
  type BirthdayGroup,
  type BirthdayOrigin,
} from "./birthdayTypes";
import { buildBirthdayPreviewSeed } from "./birthdayPreviewData";
import { fuzzyMatches } from "../../lib/fuzzySearch";
import {parseBirthdayDateInput,dayMonthInputFromBirthday,yearInputFromBirthday} from "./birthdayDateInput";
import styles from "./BirthdaysList.module.css";

import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { notify } from "../../lib/feedback/notify";
import {
  extractSafeEditorialPhrase,
  formatEditorialDayLabel,
  generateBirthdayMessage,
  type AvoidHints,
  type PersonProfile,
  type UsageCounts,
} from "./messageGenerator";

function emptyUsage(): UsageCounts {
  return { family: {}, opening: {}, ending: {} };
}

function trackUsage(usage: UsageCounts, state: Pick<EditionMessageState, "family" | "opening" | "ending">): void {
  usage.family[state.family] = (usage.family[state.family] ?? 0) + 1;
  usage.opening[state.opening] = (usage.opening[state.opening] ?? 0) + 1;
  usage.ending[state.ending] = (usage.ending[state.ending] ?? 0) + 1;
}

type PeriodFilter = "all" | "newspaper" | "today" | "month" | "custom";
type PublishFilter = "all" | "yes" | "no";
type OriginFilter = "all" | BirthdayOrigin;

/**
 * Mensagem pertence à EDIÇÃO (Semana do Jornal atual), não ao aniversariante
 * — por isso vive num Map separado, chaveado por `${editionKey}::${entryId}`.
 * Na visualização local é efêmero; no sistema real, é carregado do Supabase.
 */
interface EditionMessageState {
  text: string;
  family: string;
  opening: string;
  ending: string;
  manuallyEdited: boolean;
}

interface EntryDraft {
  displayName: string;
  birthDate: string;
  birthYearKnown?: boolean;
  city: string;
  relationship: string;
  active: boolean;
  publishInPrint: boolean;
  notes: string;
  profession: string;
  organization: string;
  knownAs: string;
  messageContext: string;
}

type DeleteTarget =
  | { kind: "member"; groupId: string; entryId: string; name: string; groupLabel: string }
  | { kind: "group"; groupId: string; label: string; groupKind: "individual" | "company"; memberCount: number };

const ORIGIN_LABELS: Record<BirthdayOrigin, string> = {
  cadastro: "Cadastro",
  familiar: "Familiar",
  manual: "Manual",
};

/** Personalização editorial para pessoas já vinculadas ao Cadastro mestre
 * (origin "cadastro") — nunca inclui nome/nascimento/fundação, que continuam
 * exclusivos do Cadastro mestre. */
interface EditorialProfilePatch {
  profession: string;
  organization: string;
  knownAs: string;
  messageContext: string;
}

function profilePatchFromEntry(entry: BirthdayEntry): EditorialProfilePatch {
  return {
    profession: entry.profession ?? "",
    organization: entry.organization ?? "",
    knownAs: entry.knownAs ?? "",
    messageContext: entry.messageContext ?? "",
  };
}

function draftFromEntry(entry: BirthdayEntry): EntryDraft {
  return {
    displayName: entry.displayName,
    birthDate: entry.birthDate,
    birthYearKnown: entry.birthYearKnown,
    city: entry.city,
    relationship: entry.relationship ?? "",
    active: entry.active,
    publishInPrint: entry.publishInPrint,
    notes: entry.notes ?? "",
    profession: entry.profession ?? "",
    organization: entry.organization ?? "",
    knownAs: entry.knownAs ?? "",
    messageContext: entry.messageContext ?? "",
  };
}

function resolveProfile(entry: BirthdayEntry, dateLabel: string | null): PersonProfile {
  return {
    name: entry.displayName,
    city: entry.city?.trim() || undefined,
    profession: entry.profession?.trim() || undefined,
    organization: entry.organization?.trim() || undefined,
    knownAs: entry.knownAs?.trim() || undefined,
    editorialPhrase: extractSafeEditorialPhrase(entry.messageContext),
    dateLabel,
  };
}

/** Ano virtual bissexto: filtra somente por dia e mês. */
function parseDayMonth(raw:string):{day:number;month:number;key:number}|null{
  const digits=raw.trim().replace(/\D/g,"");
  if(digits.length!==4)return null;
  const day=Number(digits.slice(0,2)),month=Number(digits.slice(2));
  const d=new Date(2000,month-1,day,12);
  if(day<1||month<1||d.getMonth()+1!==month||d.getDate()!==day)return null;
  return {day,month,key:month*100+day};
}
function ddmmKey(iso:string):number{
  return Number(iso.slice(5,7))*100+Number(iso.slice(8,10));
}
function getActiveRange(
  period: PeriodFilter,
  weekReference: Date,
  customStart: string,
  customEnd: string,
): { start: Date; end: Date } | null {
  if (period === "newspaper") return getNewspaperWeekRange(weekReference);
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "month") return getMonthRange(new Date());
  if (period === "custom") {
    if (!customStart || !customEnd) return null;
    const start = new Date(`${customStart}T00:00:00`);
    const end = new Date(`${customEnd}T23:59:59`);
    return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
  }
  return null;
}

function EntryRow({
  entry,
  isPrincipal,
  highlighted,
  onSave,
  onDelete,
  editorial,
  onChangeMessage,
  onSaveManualMessage,
  onUploadPhoto,
  onRemovePhoto,
  readonlyPrincipal = false,
  onTogglePublication,
  onSaveProfile,
  onPickTemplate,
  onGenerateAI,
  aiConfigured = false,
  aiBusy = false,
  customTemplates = [],
  canManageTemplates = false,
  onSaveCustomTemplate,
  onReloadCustomTemplates,
  pending = false,
}: {
  entry: BirthdayEntry;
  isPrincipal: boolean;
  highlighted: boolean;
  onSave: (next: BirthdayEntry) => void;
  onDelete: () => void;
  editorial: EditionMessageState | null;
  onChangeMessage: () => void;
  onSaveManualMessage: (text: string) => void;
  onUploadPhoto: (file: File) => void;
  onRemovePhoto: () => void;
  readonlyPrincipal?: boolean;
  onTogglePublication?: () => void;
  onSaveProfile?: (patch: EditorialProfilePatch) => void;
  onPickTemplate?: (templateKey: string, templateSource: "builtin" | "custom") => void;
  onGenerateAI?: () => void;
  aiConfigured?: boolean;
  aiBusy?: boolean;
  customTemplates?: BirthdayMessageTemplateRow[];
  canManageTemplates?: boolean;
  onSaveCustomTemplate?: (input: CustomTemplateFormInput) => Promise<boolean>;
  onReloadCustomTemplates?: () => void;
  pending?: boolean;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromEntry(entry));
  const [editDayMonth,setEditDayMonth]=useState(()=>dayMonthInputFromBirthday(entry.birthDate));
  const [editYear,setEditYear]=useState(()=>yearInputFromBirthday(entry.birthDate,entry.birthYearKnown));
  const [dateError,setDateError]=useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [personalizing, setPersonalizing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<EditorialProfilePatch>(() => profilePatchFromEntry(entry));
  const [homenagemOpen, setHomenagemOpen] = useState(false);
  const [homenagemView, setHomenagemView] = useState<"message" | "models" | "manage">("message");
  const homenagemDialogRef = useRef<HTMLDialogElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = homenagemDialogRef.current;
    if (!dialog) return;
    if (homenagemOpen && !dialog.open) { setHomenagemView("message"); dialog.showModal(); }
    if (!homenagemOpen && dialog.open) dialog.close();
  }, [homenagemOpen]);

  function startEdit(): void {
    setDraft(draftFromEntry(entry));
    setEditDayMonth(dayMonthInputFromBirthday(entry.birthDate));
    setEditYear(yearInputFromBirthday(entry.birthDate,entry.birthYearKnown));
    setDateError("");
    setEditing(true);
  }

  function save(): void {
    const birthdayDate=parseBirthdayDateInput(editDayMonth,editYear);
    if(!birthdayDate){setDateError("Informe DD/MM válido e, se souber, o ano com quatro dígitos.");return;}
    setDateError("");
    onSave({
      ...entry,
      displayName: draft.displayName.trim() || entry.displayName,
      birthDate: birthdayDate.birthDate,
      birthYearKnown: birthdayDate.birthYearKnown,
      city: draft.city,
      relationship: isPrincipal ? undefined : draft.relationship || undefined,
      active: draft.active,
      publishInPrint: draft.publishInPrint,
      notes: draft.notes || undefined,
      profession: draft.profession.trim() || undefined,
      organization: draft.organization.trim() || undefined,
      knownAs: draft.knownAs.trim() || undefined,
      messageContext: draft.messageContext.trim() || undefined,
    });
    setEditing(false);
  }

  function startPersonalize(): void {
    setProfileDraft(profilePatchFromEntry(entry));
    setPersonalizing(true);
  }

  function saveProfile(): void {
    onSaveProfile?.({
      profession: profileDraft.profession.trim(),
      organization: profileDraft.organization.trim(),
      knownAs: profileDraft.knownAs.trim(),
      messageContext: profileDraft.messageContext.trim(),
    });
    setPersonalizing(false);
  }

  async function copyMessage(): Promise<void> {
    if (!editorial) return;
    try {
      await navigator.clipboard.writeText(editorial.text);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2500);
    }
  }

  if (editing) {
    return (
      <div className="aniv-entry aniv-entry--editing">
        <div className="cadastro-grid">
          <label className={`cadastro-field ${isPrincipal ? "cadastro-field--span-4" : "cadastro-field--span-3"}`}>
            <span className="field-label">Nome para publicação</span>
            <input type="text" value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
          </label>
          {!isPrincipal ? (
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">Parentesco</span>
              <input type="text" value={draft.relationship} onChange={(e) => setDraft((d) => ({ ...d, relationship: e.target.value }))} />
            </label>
          ) : null}
          <label className={`cadastro-field ${isPrincipal ? "cadastro-field--span-2" : "cadastro-field--span-2"}`}>
            <span className="field-label">Dia/mês (DD/MM)</span>
            <input type="text" inputMode="numeric" maxLength={5} placeholder="DD/MM" value={editDayMonth} onChange={(e)=>setEditDayMonth(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">Ano (opcional)</span>
            <input type="text" inputMode="numeric" maxLength={4} placeholder="Se souber" value={editYear} onChange={(e)=>setEditYear(e.target.value)} />
          </label>
          <label className={`cadastro-field ${isPrincipal ? "cadastro-field--span-3" : "cadastro-field--span-2"}`}>
            <span className="field-label">Cidade para publicação</span>
            <input type="text" value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
          </label>
          <label className={`cadastro-field ${isPrincipal ? "cadastro-field--span-3" : "cadastro-field--span-3"}`}>
            <span className="field-label">Profissão / atividade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={draft.profession} onChange={(e) => setDraft((d) => ({ ...d, profession: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Empresa / entidade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={draft.organization} onChange={(e) => setDraft((d) => ({ ...d, organization: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Como é conhecido <span className="field-optional">(opcional)</span></span>
            <input type="text" value={draft.knownAs} onChange={(e) => setDraft((d) => ({ ...d, knownAs: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Informações para a mensagem <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={draft.messageContext} onChange={(e) => setDraft((d) => ({ ...d, messageContext: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Observação <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          </label>
        </div>
        <div className="aniv-entry-switches">
          <button
            type="button"
            role="switch"
            aria-checked={draft.active}
            className={`switch-control${draft.active ? " is-on" : ""}`}
            onClick={() => setDraft((d) => ({ ...d, active: !d.active }))}
          >
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span>Ativo</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={draft.publishInPrint}
            className={`switch-control${draft.publishInPrint ? " is-on" : ""}`}
            onClick={() => setDraft((d) => ({ ...d, publishInPrint: !d.publishInPrint }))}
          >
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span>Publicar no jornal</span>
          </button>
        </div>
        {dateError?<p className="form-error" role="alert">{dateError}</p>:null}
        <div className="aniv-entry-actions">
          <button type="button" className="cadastros-btn-primary" disabled={pending} onClick={save}>Salvar alterações</button>
          <button type="button" className="cadastros-btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (personalizing) {
    return (
      <div className="aniv-entry aniv-entry--editing aniv-entry--personalize">
        <p className="helper-text">
          Nome e {entry.isFounding ? "fundação" : "nascimento"} continuam exclusivos do Cadastro mestre — estes campos só
          personalizam a mensagem de homenagem, sem alterar o cadastro.
        </p>
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Cargo / função / atividade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={profileDraft.profession} placeholder="Ex.: Vereador, Empresário"
              onChange={(e) => setProfileDraft((d) => ({ ...d, profession: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Empresa / instituição <span className="field-optional">(opcional)</span></span>
            <input type="text" value={profileDraft.organization} placeholder="Ex.: Câmara de Vereadores de São João do Sul"
              onChange={(e) => setProfileDraft((d) => ({ ...d, organization: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Como é conhecido <span className="field-optional">(opcional)</span></span>
            <input type="text" value={profileDraft.knownAs}
              onChange={(e) => setProfileDraft((d) => ({ ...d, knownAs: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Informações para a mensagem <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={profileDraft.messageContext} placeholder="Ex.: Atua na comunidade e participa de projetos sociais."
              onChange={(e) => setProfileDraft((d) => ({ ...d, messageContext: e.target.value }))} />
          </label>
        </div>
        <div className="aniv-entry-actions">
          <button type="button" className="cadastros-btn-primary" disabled={pending} onClick={saveProfile}>Salvar personalização</button>
          <button type="button" className="cadastros-btn-secondary" onClick={() => setPersonalizing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`aniv-entry${highlighted ? " is-match" : ""}${entry.photoUrl ? " aniv-entry--has-photo" : ""}`}>
      <div className="aniv-entry-main">
        {entry.photoUrl ? (
          <span className="aniv-entry-photo" title="Foto de destaque">
            <img src={entry.photoUrl} alt={`Foto de destaque de ${entry.displayName}`} />
          </span>
        ) : null}
        <span className="aniv-entry-name">{entry.displayName}</span>
        {entry.relationship ? <span className="aniv-entry-relationship">{entry.relationship}</span> : null}
        <span className="aniv-entry-date" title={entry.isFounding ? "Data de fundação" : "Data de nascimento"}>{formatBirthDateShort(entry.birthDate)}</span>
        {entry.createdAt ? <span className="aniv-entry-created" title="Data em que o cadastro foi criado">Cadastrado em {new Date(entry.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span> : null}
        <span className="aniv-entry-city">{entry.city || "—"}</span>
        {entry.profession ? <span className="aniv-entry-profession">{entry.profession}</span> : null}
        <span className="cadastro-role-badge">{entry.isFounding ? "Fundação" : ORIGIN_LABELS[entry.origin]}</span>
        {!entry.active ? <span className="status-pill status-pill--archived">Inativo</span> : null}
        <span className={`status-pill ${entry.publishInPrint ? "status-pill--published" : "status-pill--draft"}`}>
          {entry.publishInPrint ? "Publica" : "Não publica"}
        </span>
      </div>
      <div className="aniv-entry-row-actions no-print">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadPhoto(file);
            e.target.value = "";
          }}
        />
        <button type="button" className="cadastros-btn-secondary" disabled={pending} onClick={() => photoInputRef.current?.click()}>
          {entry.photoUrl ? "Trocar foto" : "Adicionar foto"}
        </button>
        {onPickTemplate ? (
          <button type="button" className="cadastros-btn-secondary" disabled={pending} onClick={() => setHomenagemOpen(true)}>
            Homenagem
          </button>
        ) : null}
        {entry.photoUrl ? (
          <button type="button" className="cadastros-btn-secondary" disabled={pending} onClick={onRemovePhoto}>
            Remover foto
          </button>
        ) : null}
        {readonlyPrincipal ? (
          <>
            <button type="button" className="cadastros-btn-secondary" disabled={pending}
              onClick={onTogglePublication}>{entry.publishInPrint?"Desativar publicação":"Autorizar publicação"}</button>
            <Link href={`/sistema/clientes/${entry.id}/editar`} className="cadastros-btn-secondary">
              {entry.isFounding ? "Editar fundação no cadastro" : "Editar nascimento no cadastro"}
            </Link>
            {onSaveProfile ? (
              <button type="button" className="cadastros-btn-secondary" disabled={pending} onClick={startPersonalize}>
                Personalizar perfil e mensagem
              </button>
            ) : null}
          </>
        ):(
          <>
            <button type="button" className="cadastros-btn-secondary aniv-edit-btn"
              disabled={pending} onClick={startEdit}>Editar</button>
            <button type="button" className="aniv-delete-btn aniv-entry-remove" disabled={pending}
              onClick={onDelete} aria-label={`Retirar ${entry.displayName} da lista de aniversariantes`}
              title="Retirar da lista editorial (arquivar, sem excluir o Cadastro mestre)">
              {pending ? "…" : "×"}
            </button>
          </>
        )}
      </div>
      {editorial ? (
        <div className="aniv-editorial no-print">
          {editingMessage ? (
            <div className="aniv-editorial-manual-edit">
              <textarea
                rows={3}
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                maxLength={600}
              />
              <div className="aniv-editorial-actions">
                <button type="button" className="cadastros-btn-primary" disabled={pending || !messageDraft.trim()}
                  onClick={() => { onSaveManualMessage(messageDraft.trim()); setEditingMessage(false); }}>
                  Salvar texto
                </button>
                <button type="button" className="cadastros-btn-secondary" onClick={() => setEditingMessage(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="aniv-editorial-text">
                Mensagem{editorial.manuallyEdited ? <span className="aniv-editorial-manual-badge"> (editada manualmente)</span> : null}:
                <br />
                &ldquo;{editorial.text}&rdquo;
              </p>
              <div className="aniv-editorial-actions">
                <button type="button" className="aniv-editorial-btn" onClick={onChangeMessage}>
                  Trocar mensagem
                </button>
                <button type="button" className="aniv-editorial-btn" onClick={() => { setMessageDraft(editorial.text); setEditingMessage(true); }}>
                  Editar manualmente
                </button>
                <button type="button" className="aniv-editorial-btn" onClick={copyMessage}>
                  {copied ? "Copiado ✓" : "Copiar mensagem"}
                </button>
                {copyError ? <span className="aniv-editorial-error">Não foi possível copiar.</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
      {onPickTemplate ? (
        <dialog ref={homenagemDialogRef} className="ir-modal ir-modal--form" aria-labelledby="homenagem-title"
          onCancel={(e) => { e.preventDefault(); setHomenagemOpen(false); }}>
          <h2 id="homenagem-title">Homenagem — {entry.displayName}</h2>
          {homenagemView === "message" ? (
            <div className="aniv-homenagem-message">
              {editorial ? (
                <>
                  <p className="aniv-editorial-text">
                    Mensagem{editorial.manuallyEdited ? <span className="aniv-editorial-manual-badge"> (editada manualmente)</span> : null}:
                    <br />
                    &ldquo;{editorial.text}&rdquo;
                  </p>
                  {editingMessage ? (
                    <div className="aniv-editorial-manual-edit">
                      <textarea rows={3} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} maxLength={600} />
                      <div className="aniv-editorial-actions">
                        <button type="button" className="cadastros-btn-primary" disabled={pending || !messageDraft.trim()}
                          onClick={() => { onSaveManualMessage(messageDraft.trim()); setEditingMessage(false); }}>
                          Salvar texto
                        </button>
                        <button type="button" className="cadastros-btn-secondary" onClick={() => setEditingMessage(false)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="aniv-editorial-actions">
                      <button type="button" className="aniv-editorial-btn" disabled={pending} onClick={onChangeMessage}>Outra sugestão</button>
                      <button type="button" className="aniv-editorial-btn" disabled={pending}
                        onClick={() => { setMessageDraft(editorial.text); setEditingMessage(true); }}>
                        Editar texto
                      </button>
                      <button type="button" className="aniv-editorial-btn" disabled={pending || aiBusy || !onGenerateAI}
                        onClick={onGenerateAI} title={aiConfigured ? "" : "Depende de configuração do provedor de IA no servidor"}>
                        {aiBusy ? "Gerando…" : "Criar com IA"}
                      </button>
                      <button type="button" className="aniv-editorial-btn" onClick={() => setHomenagemView("models")}>Ver modelos</button>
                      <button type="button" className="aniv-editorial-btn" onClick={copyMessage}>{copied ? "Copiado ✓" : "Copiar mensagem"}</button>
                      {copyError ? <span className="aniv-editorial-error">Não foi possível copiar.</span> : null}
                    </div>
                  )}
                  {!aiConfigured ? (
                    <p className="helper-text">
                      "Criar com IA" depende de configuração do provedor no servidor (variáveis BIRTHDAY_AI_PROVIDER/BIRTHDAY_AI_API_KEY) — as demais opções continuam funcionando normalmente.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="helper-text">Nenhuma mensagem preparada ainda para a edição atual desta pessoa.</p>
              )}
            </div>
          ) : null}
          {homenagemView === "models" ? (
            <HomenagemModelLibrary
              entry={entry}
              customTemplates={customTemplates}
              canManageTemplates={canManageTemplates}
              pending={pending}
              onBack={() => setHomenagemView("message")}
              onManage={() => setHomenagemView("manage")}
              onPick={(key, source) => { onPickTemplate(key, source); setHomenagemView("message"); }}
            />
          ) : null}
          {homenagemView === "manage" && onSaveCustomTemplate ? (
            <HomenagemTemplateManager
              customTemplates={customTemplates}
              onBack={() => setHomenagemView("models")}
              onSave={async (input) => { const ok = await onSaveCustomTemplate(input); if (ok) onReloadCustomTemplates?.(); return ok; }}
            />
          ) : null}
          <div className="aniv-entry-actions" style={{ marginTop: "16px" }}>
            <button type="button" className="cadastros-btn-secondary" onClick={() => setHomenagemOpen(false)}>Fechar</button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}

interface CustomTemplateFormInput {
  id?: string; family: string; body: string;
  needsCity: boolean; needsProfession: boolean; needsOrganization: boolean;
  needsKnownAs: boolean; needsEditorialPhrase: boolean;
}

/** Biblioteca "Ver modelos" — os 44 modelos originais (sempre disponíveis,
 * agrupados por família) + os modelos adicionais do administrador. Nunca
 * modifica os 44 originais. */
function HomenagemModelLibrary({
  entry, customTemplates, canManageTemplates, pending, onBack, onManage, onPick,
}: {
  entry: BirthdayEntry;
  customTemplates: BirthdayMessageTemplateRow[];
  canManageTemplates: boolean;
  pending: boolean;
  onBack: () => void;
  onManage: () => void;
  onPick: (key: string, source: "builtin" | "custom") => void;
}): JSX.Element {
  const summaries = useMemo(() => listTemplateSummaries(), []);
  const grouped = useMemo(() => {
    const map = new Map<string, TemplateSummary[]>();
    for (const s of summaries) {
      const list = map.get(s.family) ?? [];
      list.push(s);
      map.set(s.family, list);
    }
    return [...map.entries()];
  }, [summaries]);

  function builtinEligible(needs: TemplateSummary["needs"]): boolean {
    if (needs.city && !entry.city) return false;
    if (needs.profession && !entry.profession) return false;
    if (needs.organization && !(entry.profession && entry.organization)) return false;
    if (needs.knownAs && !entry.knownAs) return false;
    if (needs.editorialPhrase && !entry.messageContext) return false;
    return true;
  }
  function customEligible(tpl: BirthdayMessageTemplateRow): boolean {
    if (tpl.needsCity && !entry.city) return false;
    if (tpl.needsProfession && !entry.profession) return false;
    if (tpl.needsOrganization && !(entry.profession && entry.organization)) return false;
    if (tpl.needsKnownAs && !entry.knownAs) return false;
    if (tpl.needsEditorialPhrase && !entry.messageContext) return false;
    return true;
  }

  return (
    <div className="aniv-model-library">
      {customTemplates.length > 0 ? (
        <>
          <h3 className="aniv-model-group-title">{FAMILY_LABELS.custom}</h3>
          <ul className="aniv-model-list">
            {customTemplates.map((tpl) => {
              const eligible = customEligible(tpl);
              return (
                <li key={tpl.id} className="aniv-model-item">
                  <p>{tpl.body}</p>
                  <button type="button" className="cadastros-btn-secondary" disabled={pending || !eligible}
                    title={eligible ? "" : "Exige um dado que esta pessoa não possui"}
                    onClick={() => onPick(tpl.id, "custom")}>
                    Usar este modelo
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {grouped.map(([family, items]) => (
        <div key={family}>
          <h3 className="aniv-model-group-title">{FAMILY_LABELS[family] ?? family}</h3>
          <ul className="aniv-model-list">
            {items.map((tpl) => {
              const eligible = builtinEligible(tpl.needs);
              return (
                <li key={tpl.key} className="aniv-model-item">
                  <p>{tpl.preview}</p>
                  <button type="button" className="cadastros-btn-secondary" disabled={pending || !eligible}
                    title={eligible ? "" : "Exige um dado que esta pessoa não possui"}
                    onClick={() => onPick(tpl.key, "builtin")}>
                    Usar este modelo
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="aniv-entry-actions">
        <button type="button" className="cadastros-btn-secondary" onClick={onBack}>Voltar</button>
        {canManageTemplates ? (
          <button type="button" className="cadastros-btn-secondary" onClick={onManage}>Gerenciar modelos</button>
        ) : null}
      </div>
    </div>
  );
}

/** Gerenciamento (criar/editar) dos modelos adicionais — permissão
 * administrativa é validada pelo servidor (policy no banco + checagem na
 * action); aqui só evitamos mostrar o formulário a quem claramente não é
 * admin, mas o botão "Gerenciar modelos" só aparece quando canManageTemplates. */
function HomenagemTemplateManager({
  customTemplates, onBack, onSave,
}: {
  customTemplates: BirthdayMessageTemplateRow[];
  onBack: () => void;
  onSave: (input: CustomTemplateFormInput) => Promise<boolean>;
}): JSX.Element {
  const blank: CustomTemplateFormInput = {
    family: "", body: "", needsCity: false, needsProfession: false,
    needsOrganization: false, needsKnownAs: false, needsEditorialPhrase: false,
  };
  const [draft, setDraft] = useState<CustomTemplateFormInput>(blank);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!draft.body.trim()) return;
    setSaving(true); setSaveError(null);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setDraft(blank);
    else setSaveError("Não foi possível salvar — confira se sua conta tem permissão de administrador.");
  }

  return (
    <div className="aniv-model-manager">
      <p className="helper-text">
        Modelos adicionais usam placeholders: <code>{"{{name}}"}</code> <code>{"{{city}}"}</code>{" "}
        <code>{"{{profession}}"}</code> <code>{"{{organization}}"}</code> <code>{"{{knownAs}}"}</code>{" "}
        <code>{"{{editorialPhrase}}"}</code> <code>{"{{dateLabel}}"}</code>.
      </p>
      <div className="cadastro-grid">
        <label className="cadastro-field cadastro-field--span-3">
          <span className="field-label">Rótulo/família <span className="field-optional">(opcional)</span></span>
          <input type="text" value={draft.family} onChange={(e) => setDraft((d) => ({ ...d, family: e.target.value }))} />
        </label>
        <label className="cadastro-field cadastro-field--span-12">
          <span className="field-label">Texto do modelo</span>
          <textarea rows={3} value={draft.body} maxLength={600}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
        </label>
      </div>
      <div className="aniv-entry-switches">
        {([
          ["needsCity", "Exige cidade"],
          ["needsProfession", "Exige cargo/profissão"],
          ["needsOrganization", "Exige profissão + instituição"],
          ["needsKnownAs", "Exige apelido"],
          ["needsEditorialPhrase", "Exige contexto editorial"],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" role="switch" aria-checked={draft[key]}
            className={`switch-control${draft[key] ? " is-on" : ""}`}
            onClick={() => setDraft((d) => ({ ...d, [key]: !d[key] }))}>
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      <div className="aniv-entry-actions">
        <button type="button" className="cadastros-btn-primary" disabled={saving || !draft.body.trim()} onClick={submit}>
          {saving ? "Salvando…" : draft.id ? "Salvar alterações" : "Adicionar modelo"}
        </button>
        <button type="button" className="cadastros-btn-secondary" onClick={onBack}>Voltar</button>
      </div>
      {customTemplates.length > 0 ? (
        <>
          <h3 className="aniv-model-group-title">Modelos adicionais existentes</h3>
          <ul className="aniv-model-list">
            {customTemplates.map((tpl) => (
              <li key={tpl.id} className="aniv-model-item">
                <p>{tpl.body}</p>
                <button type="button" className="cadastros-btn-secondary"
                  onClick={() => setDraft({
                    id: tpl.id, family: tpl.family, body: tpl.body, needsCity: tpl.needsCity,
                    needsProfession: tpl.needsProfession, needsOrganization: tpl.needsOrganization,
                    needsKnownAs: tpl.needsKnownAs, needsEditorialPhrase: tpl.needsEditorialPhrase,
                  })}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function AddMemberForm({ kind, onAdd, localPreview }: { kind: "individual" | "company"; onAdd: (entry: BirthdayEntry) => Promise<boolean>; localPreview: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dayMonth,setDayMonth]=useState("");
  const [year,setYear]=useState("");
  const [dateError,setDateError]=useState("");
  const [city, setCity] = useState("");
  const [saving,setSaving]=useState(false);

  async function submit():Promise<void> {
    if(saving)return;
    const parsed=parseBirthdayDateInput(dayMonth,year);
    if(!name.trim()||!parsed){setDateError("Informe o nome e o dia/mês válido. O ano é opcional.");return;}
    setDateError("");
    setSaving(true);
    let success=false;
    try{success=await onAdd({
      id: `local-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      displayName: name.trim(),
      birthDate:parsed.birthDate,
      birthYearKnown:parsed.birthYearKnown,
      city: city.trim(),
      relationship: relationship.trim() || undefined,
      origin: kind === "individual" ? "familiar" : "manual",
      active: true,
      publishInPrint: false,
    });}catch{success=false;}finally{setSaving(false);}
    if(!success){setDateError("Não foi possível incluir. Verifique os dados e tente novamente.");return;}
    setName("");
    setRelationship("");
    setDayMonth("");setYear("");
    setCity("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="cadastros-btn-secondary aniv-add-btn no-print" onClick={() => setOpen(true)}>
        + {kind === "individual" ? "Adicionar familiar" : "Adicionar pessoa"}
      </button>
    );
  }

  return (
    <div className="aniv-entry aniv-entry--editing no-print">
      {localPreview ? <p className="helper-text">Visualização de demonstração: as alterações não serão salvas.</p> : <p className="helper-text">Esta pessoa será vinculada ao cadastro selecionado, sem alterar os dados do Cadastro mestre.</p>}
      <div className="cadastro-grid">
        <label className="cadastro-field cadastro-field--span-4">
          <span className="field-label">Nome</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="cadastro-field cadastro-field--span-3">
          <span className="field-label">Parentesco <span className="field-optional">(opcional)</span></span>
          <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder={kind === "individual" ? "Cônjuge, Filho(a)..." : "Responsável, Sócio..."} />
        </label>
        <label className="cadastro-field cadastro-field--span-2">
          <span className="field-label">Dia/mês (DD/MM)</span>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="DD/MM" value={dayMonth} onChange={(e)=>setDayMonth(e.target.value)} />
        </label>
        <label className="cadastro-field cadastro-field--span-2">
          <span className="field-label">Ano (opcional)</span>
          <input type="text" inputMode="numeric" maxLength={4} placeholder="Se souber" value={year} onChange={(e)=>setYear(e.target.value)} />
        </label>
        <label className="cadastro-field cadastro-field--span-3">
          <span className="field-label">Cidade</span>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      {dateError?<p className="form-error" role="alert">{dateError}</p>:null}
      <div className="aniv-entry-actions">
        <button type="button" className="cadastros-btn-primary" disabled={saving} onClick={()=>void submit()}>{saving?"Salvando…":localPreview ? "Adicionar (preview)" : "Salvar pessoa"}</button>
        <button type="button" className="cadastros-btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

export function BirthdaysList({ localPreview, initialGroups = [], initialMessages = [], initialWeekStart = "", todayISO = "", canManageTemplates = false }: {
  localPreview: boolean;
  initialGroups?: BirthdayGroup[];
  initialMessages?: EditorialBirthdayMessage[];
  initialWeekStart?: string;
  todayISO?: string;
  canManageTemplates?: boolean;
}): JSX.Element {
  const router=useRouter();
  const templatesAllowed=localPreview || canManageTemplates;
  const [busy,setBusy]=useState(false);
  // Avisos flutuantes globais (Fase 20, revisão de 28/10/2026): cada
  // handler chama `notify.*` diretamente no momento do resultado, em vez de
  // guardar texto em estado e depender de um `useEffect` — uma ponte por
  // estado podia deixar de notificar uma segunda falha IDÊNTICA à anterior
  // (React não re-renderiza quando o novo valor de string é igual ao
  // atual, então o efeito nunca disparava de novo). Chamada direta garante
  // exatamente um aviso por resultado de operação, sempre.
  const requested=useRef(new Set<string>());
  const persisted=useRef(new Set(initialMessages.map(m=>`${m.edition_week_start}::${m.birthday_entry_id}`)));
  const [groups, setGroups] = useState<BirthdayGroup[]>(() => localPreview ? buildBirthdayPreviewSeed() : initialGroups);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("newspaper");
  const [weekReference, setWeekReference] = useState<Date>(() => todayISO ? new Date(todayISO+"T12:00:00") : new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [city, setCity] = useState("all");
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [includeOpen, setIncludeOpen] = useState(false);
  const includeDialogRef = useRef<HTMLDialogElement>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<BirthdayMessageTemplateRow[]>([]);
  useEffect(() => {
    if (localPreview) return;
    void isBirthdayAiConfigured().then(setAiConfigured).catch(() => setAiConfigured(false));
    void reloadCustomTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só uma vez, ao montar.
  }, [localPreview]);
  function reloadCustomTemplates(): Promise<void> {
    if (localPreview) return Promise.resolve();
    return listBirthdayMessageTemplates().then((result) => {
      if ("ok" in result) setCustomTemplates(result.data);
    }).catch(() => undefined);
  }
  const [editionMessages, setEditionMessages] = useState<Map<string, EditionMessageState>>(
    () => new Map(initialMessages.map(m=>[`${m.edition_week_start}::${m.birthday_entry_id}`,{
      text:m.message,family:m.family,opening:m.opening,ending:m.ending,manuallyEdited:Boolean(m.manually_edited),
    }]))
  );
  useEffect(()=>{
    if(localPreview)return;
    setGroups(initialGroups);
  },[initialGroups,localPreview]);
  useEffect(()=>{
    if(localPreview)return;
    setEditionMessages(old=>{
      const next=new Map(old);
      for(const m of initialMessages){
        const key=`${m.edition_week_start}::${m.birthday_entry_id}`;
        next.set(key,{text:m.message,family:m.family,opening:m.opening,ending:m.ending,manuallyEdited:Boolean(m.manually_edited)});
      }
      return next;
    });
  },[localPreview,initialMessages]);

  useEffect(() => {
    const dialog = includeDialogRef.current;
    if (!dialog) return;
    if (includeOpen && !dialog.open) dialog.showModal();
    if (!includeOpen && dialog.open) dialog.close();
  }, [includeOpen]);

  const newspaperRange = useMemo(() => getNewspaperWeekRange(weekReference), [weekReference]);
  const weekDays = useMemo(() => listNewspaperWeekDays(newspaperRange), [newspaperRange]);
  const activeRange = useMemo(() => getActiveRange(period, weekReference, customStart, customEnd), [period, weekReference, customStart, customEnd]);

  // Chave da edição = início da Semana do Jornal corrente; muda só quando o usuário navega de semana.
  const editionKey = useMemo(() => newspaperRange.start.toISOString().slice(0, 10), [newspaperRange]);

  // Chave da semana editorial ATUAL (a que contém a data de hoje) — mensagens só aparecem/geram nela.
  const currentEditionKey = useMemo(() => initialWeekStart ||
    getNewspaperWeekRange(new Date()).start.toISOString().slice(0,10), [initialWeekStart]);
  const isCurrentEditorialWeek = editionKey === currentEditionKey;

  // Base de verdade da edição: TODOS os aniversariantes da semana (independente dos filtros de
  // busca/cidade/publicação/origem) — mensagem pertence à semana inteira, não à lista filtrada
  // visível, pra não regenerar nada quando o usuário muda um filtro.
  const weekEntries = useMemo(() => {
    const out: Array<{ entry: BirthdayEntry; dayLabel: string }> = [];
    groups.forEach((group) => {
      const candidates = [group.principal, group.foundingEntry, ...group.members].filter((e): e is BirthdayEntry => e != null);
      candidates.forEach((entry) => {
        const day = weekDays.find((d) => matchesDay(entry.birthDate, d));
        if (day) out.push({ entry, dayLabel: formatEditorialDayLabel(weekdayFull(day), day) });
      });
    });
    return out;
  }, [groups, weekDays]);

  // Gera mensagem só para quem ainda não tem uma na edição ATUAL — nunca sobrescreve uma já
  // existente, então filtrar/buscar/recolher nunca troca o texto de ninguém. Semanas
  // anterior/futura não geram mensagem automaticamente (decisão aprovada desta fase).
  // A diversidade considera a edição INTEIRA: family/opening/ending são contados conforme
  // cada mensagem é atribuída, então a 5ª pessoa já evita o que as 4 anteriores usaram.
  useEffect(() => {
    if (!localPreview || period !== "newspaper" || !isCurrentEditorialWeek) return;
    setEditionMessages((prev) => {
      let changed = false;
      const next = new Map(prev);
      const usedTexts = new Set<string>();
      const usage = emptyUsage();
      next.forEach((value, key) => {
        if (!key.startsWith(`${editionKey}::`)) return;
        usedTexts.add(value.text);
        trackUsage(usage, value);
      });
      let previous: AvoidHints = {};
      weekEntries.forEach(({ entry, dayLabel }) => {
        const key = `${editionKey}::${entry.id}`;
        const existing = next.get(key);
        if (existing) {
          previous = { family: existing.family, opening: existing.opening, ending: existing.ending };
          return;
        }
        const profile = resolveProfile(entry, dayLabel);
        const generated = generateBirthdayMessage(profile, usedTexts, usage, previous, `${key}::0`);
        usedTexts.add(generated.text);
        trackUsage(usage, generated);
        previous = { family: generated.family, opening: generated.opening, ending: generated.ending };
        next.set(key, { ...generated, manuallyEdited: false });
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [period, isCurrentEditorialWeek, editionKey, weekEntries, localPreview]);

  // A versão original gera automaticamente. No sistema real, salvamos UMA VEZ
  // por pessoa/edição; atualizar o estado das mensagens não cancela requisições.
  useEffect(()=>{
    if(localPreview || !isCurrentEditorialWeek || period!=="newspaper")return;
    let active=true;
    void (async()=>{
      for(const {entry} of weekEntries){
        if(!active)break;
        if(!entry.active)continue;
        const key=`${editionKey}::${entry.id}`;
        if(persisted.current.has(key)||requested.current.has(key))continue;
        requested.current.add(key);
        try{
          const result=await prepareBirthdayEditionMessage(
            entry.origin==="cadastro"?"cliente":"editorial",entry.id,false
          );
          if("error" in result){
            requested.current.delete(key);
            // Preparação silenciosa em segundo plano (não é ação do
            // operador) — nunca um toast; só registro para diagnóstico.
            console.error("Falha ao preparar mensagem de aniversário:",result.error);
            continue;
          }
          persisted.current.add(key);
          if(active){
            setEditionMessages(prev=>{
              const m=new Map(prev);
              m.set(key,{text:result.data.message,family:result.data.family,
                opening:result.data.opening,ending:result.data.ending,manuallyEdited:Boolean(result.data.manually_edited)});
              return m;
            });
          }
        }catch{
          requested.current.delete(key);
          console.error("Falha ao preparar mensagens da semana.");
        }
      }
    })();
    return ()=>{active=false;};
  },[localPreview,isCurrentEditorialWeek,period,editionKey,weekEntries]);

  function changeMessage(entryId: string): void {
    if(!localPreview){
      if(busy)return;
      const key=`${editionKey}::${entryId}`;
      const found=weekEntries.find(w=>w.entry.id===entryId);
      if(!found)return;
      setBusy(true);
      void prepareBirthdayEditionMessage(
        found.entry.origin==="cadastro"?"cliente":"editorial",entryId,true
      ).then(result=>{
        if("error" in result){notify.error("Mensagem não trocada",result.error);return;}
        persisted.current.add(key);
        setEditionMessages(prev=>{
          const m=new Map(prev);
          m.set(key,{text:result.data.message,family:result.data.family,
            opening:result.data.opening,ending:result.data.ending,manuallyEdited:Boolean(result.data.manually_edited)});
          return m;
        });
        notify.success("Mensagem atualizada","Nova mensagem salva na edição.");
        router.refresh();
      }).catch(()=>notify.error("Mensagem não trocada","Não foi possível trocar a mensagem."))
        .finally(()=>setBusy(false));
      return;
    }
    const found = weekEntries.find((w) => w.entry.id === entryId);
    if (!found) return;
    const key = `${editionKey}::${entryId}`;
    setEditionMessages((prev) => {
      const current = prev.get(key);
      const usedTexts = new Set<string>();
      const usage = emptyUsage();
      prev.forEach((value, k) => {
        if (!k.startsWith(`${editionKey}::`) || k === key) return;
        usedTexts.add(value.text);
        trackUsage(usage, value);
      });
      if (current) usedTexts.add(current.text);
      const profile = resolveProfile(found.entry, found.dayLabel);
      const avoidPrevious: AvoidHints = current ? { family: current.family, opening: current.opening, ending: current.ending } : {};
      const generated = generateBirthdayMessage(profile, usedTexts, usage, avoidPrevious, `${key}::${Date.now()}`);
      const next = new Map(prev);
      next.set(key, { ...generated, manuallyEdited: false });
      return next;
    });
  }

  /** "Ver modelos" -> "Usar este modelo" para UMA pessoa — nunca toca a
   * mensagem de ninguém mais, mesmo princípio de changeMessage. */
  function pickTemplateFor(entryId: string, templateKey: string, templateSource: "builtin" | "custom"): void {
    const found = weekEntries.find((w) => w.entry.id === entryId);
    if (!found) return;
    const key = `${editionKey}::${entryId}`;
    if (!localPreview) {
      if (busy) return;
      setBusy(true);
      void pickBirthdayMessageTemplate(
        found.entry.origin === "cadastro" ? "cliente" : "editorial", entryId, templateKey, templateSource,
      ).then((result) => {
        if ("error" in result) { notify.error("Modelo não aplicado", result.error); return; }
        persisted.current.add(key);
        setEditionMessages((prev) => {
          const m = new Map(prev);
          m.set(key, { text: result.data.message, family: result.data.family,
            opening: result.data.opening, ending: result.data.ending, manuallyEdited: Boolean(result.data.manually_edited) });
          return m;
        });
        notify.success("Modelo aplicado", "Modelo aplicado e salvo na edição.");
        router.refresh();
      }).catch(() => notify.error("Modelo não aplicado", "Não foi possível aplicar o modelo escolhido."))
        .finally(() => setBusy(false));
      return;
    }
    const profile = resolveProfile(found.entry, found.dayLabel);
    const generated = templateSource === "builtin" ? renderTemplateByKey(templateKey, profile) : null;
    if (!generated) { notify.error("Modelo não aplicado", "Este modelo exige um dado que esta pessoa não possui."); return; }
    setEditionMessages((prev) => {
      const next = new Map(prev);
      next.set(key, { ...generated, manuallyEdited: false });
      return next;
    });
  }

  /** "Criar com IA" — a pedido explícito do operador para UMA pessoa só. */
  function generateAIFor(entryId: string): void {
    if (localPreview) { notify.error("IA indisponível", "Geração por IA não está disponível na visualização de demonstração."); return; }
    const found = weekEntries.find((w) => w.entry.id === entryId);
    if (!found || busy) return;
    const key = `${editionKey}::${entryId}`;
    setBusy(true);
    void generateBirthdayMessageWithAI(found.entry.origin === "cadastro" ? "cliente" : "editorial", entryId)
      .then((result) => {
        if ("error" in result) { notify.error("Homenagem não gerada", result.error); return; }
        persisted.current.add(key);
        setEditionMessages((prev) => {
          const m = new Map(prev);
          m.set(key, { text: result.data.message, family: result.data.family,
            opening: result.data.opening, ending: result.data.ending, manuallyEdited: Boolean(result.data.manually_edited) });
          return m;
        });
        notify.success("Homenagem gerada", "Homenagem gerada por IA e salva na edição.");
        router.refresh();
      }).catch(() => notify.error("Homenagem não gerada", "Não foi possível gerar a homenagem por IA."))
      .finally(() => setBusy(false));
  }

  async function saveCustomTemplate(input: {
    id?: string; family: string; body: string; needsCity: boolean; needsProfession: boolean;
    needsOrganization: boolean; needsKnownAs: boolean; needsEditorialPhrase: boolean;
  }): Promise<boolean> {
    if (localPreview) return false;
    const result = await saveBirthdayMessageTemplate(input);
    if ("error" in result) { notify.error("Modelo não salvo", result.error); return false; }
    notify.success("Modelo salvo", "O modelo de mensagem foi salvo.");
    return true;
  }

  function editorialFor(entryId: string): EditionMessageState | null {
    if (period !== "newspaper" || !isCurrentEditorialWeek) return null;
    return editionMessages.get(`${editionKey}::${entryId}`) ?? null;
  }

  function saveManualMessage(entryId: string, text: string): void {
    const key = `${editionKey}::${entryId}`;
    if (!localPreview) {
      if (busy) return;
      setBusy(true);
      void saveManualBirthdayMessage(entryId, text).then((result) => {
        if ("error" in result) { notify.error("Edição não salva", result.error); return; }
        setEditionMessages((prev) => {
          const m = new Map(prev);
          m.set(key, {
            text: result.data.message, family: result.data.family,
            opening: result.data.opening, ending: result.data.ending,
            manuallyEdited: Boolean(result.data.manually_edited),
          });
          return m;
        });
        notify.success("Mensagem editada", "Mensagem editada manualmente.");
        router.refresh();
      }).catch(() => notify.error("Edição não salva", "Não foi possível salvar a edição manual."))
        .finally(() => setBusy(false));
      return;
    }
    setEditionMessages((prev) => {
      const current = prev.get(key);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(key, { ...current, text, manuallyEdited: true });
      return next;
    });
  }

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((group) => {
      if (group.principal?.city) set.add(group.principal.city);
      if (group.foundingEntry?.city) set.add(group.foundingEntry.city);
      group.members.forEach((member) => { if (member.city) set.add(member.city); });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [groups]);

  function entryMatchesNonPeriod(entry: BirthdayEntry): boolean {
    if(!entry.active && period!=="all")return false;
    if (search.trim()) {
      const dateSearch = parseDayMonth(search);
      if (dateSearch ? ddmmKey(entry.birthDate) !== dateSearch.key
        : !fuzzyMatches(search, entry.displayName)) return false;
    }
    if (city !== "all" && entry.city !== city) return false;
    if (publishFilter !== "all" && entry.publishInPrint !== (publishFilter === "yes")) return false;
    if (originFilter !== "all" && entry.origin !== originFilter) return false;
    return true;
  }

  function entryMatchesPeriod(entry: BirthdayEntry): boolean {
    if (period === "all") return true;
    if (period === "newspaper" && selectedDay) return matchesDay(entry.birthDate, selectedDay);
    if (!activeRange) return false;
    return isBirthdayWithinRange(entry.birthDate, activeRange.start, activeRange.end);
  }

  function entryMatchesAll(entry: BirthdayEntry): boolean {
    return entryMatchesNonPeriod(entry) && entryMatchesPeriod(entry);
  }

  // Lista plana (pessoa + grupo), base de verdade pra contagem, ordenação e relatório.
  const matchingFlat = useMemo(() => {
    const out: Array<{ entry: BirthdayEntry; group: BirthdayGroup; isPrincipal: boolean }> = [];
    groups.forEach((group) => {
      if (group.principal && entryMatchesAll(group.principal)) out.push({ entry: group.principal, group, isPrincipal: true });
      if (group.foundingEntry && entryMatchesAll(group.foundingEntry)) out.push({ entry: group.foundingEntry, group, isPrincipal: true });
      group.members.forEach((member) => {
        if (entryMatchesAll(member)) out.push({ entry: member, group, isPrincipal: false });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entryMatchesAll fecha sobre todos os filtros já listados abaixo.
  }, [groups, search, city, publishFilter, originFilter, period, activeRange, selectedDay]);

  // Auto-expande grupos com match de busca, pra nunca escondenr o resultado numa árvore fechada.
  useEffect(() => {
    if (!search.trim()) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      matchingFlat.forEach(({ group }) => next.add(group.id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à busca.
  }, [search]);

  const matchingGroupIds = useMemo(() => new Set(matchingFlat.map((m) => m.group.id)), [matchingFlat]);

  const visibleGroups = useMemo(() => {
    const list = groups.filter(g=>matchingGroupIds.has(g.id));
    if (!activeRange && !(period === "newspaper" && selectedDay)) {
      return [...list].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    }
    function earliestIndex(group: BirthdayGroup): number {
      const entries = [group.principal, group.foundingEntry, ...group.members].filter((e): e is BirthdayEntry => e != null && entryMatchesAll(e));
      const idxs = entries
        .map((e) => {
          if (selectedDay) return matchesDay(e.birthDate, selectedDay) ? 0 : Infinity;
          return activeRange ? dayIndexWithinRange(e.birthDate, activeRange.start, activeRange.end) ?? Infinity : Infinity;
        })
        .filter((i) => i !== null);
      return idxs.length ? Math.min(...idxs) : Infinity;
    }
    return [...list].sort((a, b) => {
      const diff = earliestIndex(a) - earliestIndex(b);
      return diff !== 0 ? diff : a.label.localeCompare(b.label, "pt-BR");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, matchingGroupIds, activeRange, selectedDay, period,search,city,publishFilter,originFilter]);

  function dayCount(day: Date): number {
    let count = 0;
    groups.forEach((group) => {
      const entries = [group.principal, group.foundingEntry, ...group.members].filter((e): e is BirthdayEntry => Boolean(e));
      entries.forEach((e) => {
        if (entryMatchesNonPeriod(e) && matchesDay(e.birthDate, day)) count += 1;
      });
    });
    return count;
  }

  function toggleExpanded(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function editorialInput(entry:BirthdayEntry,groupId:string|null):EditorialBirthdayInput {
    return {
      ...(entry.id.startsWith("local-")?{}:{id:entry.id}),
      displayName:entry.displayName,birthDate:entry.birthDate,city:entry.city,
      groupClientId:groupId && /^[a-f0-9-]{36}$/i.test(groupId)?groupId:null,
      relationship:entry.relationship||"",profession:entry.profession||"",
      organization:entry.organization||"",knownAs:entry.knownAs||"",
      messageContext:entry.messageContext||"",notes:entry.notes||"",
      birthYearKnown:entry.birthYearKnown,
      publishInPrint:entry.publishInPrint,active:entry.active,
    };
  }
  async function saveRealEntry(entry:BirthdayEntry,groupId:string|null):Promise<string|null>{
    const result=await saveEditorialBirthday(editorialInput(entry,groupId));
    if("error" in result){notify.error("Não foi possível salvar o registro",result.error);return null;}
    // router.refresh busca snapshots do banco, sem exigir F5 do navegador;
    // o estado local também é atualizado ao confirmar a gravação.
    router.refresh();
    return result.data.id;
  }
  // Foto de destaque é metadado editorial (nunca o cadastro mestre) — funciona para
  // QUALQUER origem, inclusive entradas readonly (origin "cadastro"), ao contrário de
  // updateEntry (que bloqueia edição de nascimento/fundação vindos do cadastro).
  function applyPhotoToGroups(entryId: string, photoUrl: string | undefined): void {
    setGroups((prev) => prev.map((group) => ({
      ...group,
      principal: group.principal?.id === entryId ? { ...group.principal, photoUrl } : group.principal,
      foundingEntry: group.foundingEntry?.id === entryId ? { ...group.foundingEntry, photoUrl } : group.foundingEntry,
      members: group.members.map((m) => (m.id === entryId ? { ...m, photoUrl } : m)),
    })));
  }
  function uploadEntryPhoto(entryId: string, file: File): void {
    if (localPreview) {
      applyPhotoToGroups(entryId, URL.createObjectURL(file));
      return;
    }
    if (busy) return;
    setBusy(true);
    const formData = new FormData();
    formData.append("file", file);
    void setBirthdayEntryPhoto(entryId, formData).then((result) => {
      if ("error" in result) { notify.error("Foto não enviada", result.error); return; }
      applyPhotoToGroups(entryId, result.data.photoUrl);
      notify.success("Foto salva", "Foto de destaque salva.");
      router.refresh();
    }).catch(() => notify.error("Foto não enviada", "Não foi possível enviar a foto."))
      .finally(() => setBusy(false));
  }
  function removeEntryPhoto(entryId: string): void {
    if (localPreview) {
      applyPhotoToGroups(entryId, undefined);
      return;
    }
    if (busy) return;
    setBusy(true);
    void removeBirthdayEntryPhoto(entryId).then((result) => {
      if ("error" in result) { notify.error("Foto não removida", result.error); return; }
      applyPhotoToGroups(entryId, undefined);
      notify.success("Foto removida", "Foto de destaque removida.");
      router.refresh();
    }).catch(() => notify.error("Foto não removida", "Não foi possível remover a foto."))
      .finally(() => setBusy(false));
  }
  function updateEntry(groupId: string, entryId: string, next: BirthdayEntry): void {
    if(!localPreview){
      if(next.origin==="cadastro"){notify.error("Não é possível editar","O nascimento deve ser editado no cadastro mestre.");return;}
      if(busy)return;
      setBusy(true);
      void saveRealEntry(next,groupId).then(saved=>{
        if(saved){
          setGroups(prev=>prev.map(group=>{
            if(group.id!==groupId)return group;
            if(group.principal?.id===entryId)return {...group,principal:next};
            if(group.foundingEntry?.id===entryId)return {...group,foundingEntry:next};
            return {...group,members:group.members.map(m=>m.id===entryId?next:m)};
          }));
          notify.success("Aniversariante atualizado","Os dados foram atualizados.");
        }
      }).catch(()=>notify.error("Não foi possível salvar","Não foi possível salvar este registro."))
        .finally(()=>setBusy(false));
      return;
    }
    setGroups(prev=>prev.map(group=>{
      if(group.id!==groupId)return group;
      if(group.principal?.id===entryId)return {...group,principal:next};
      if(group.foundingEntry?.id===entryId)return {...group,foundingEntry:next};
      return {...group,members:group.members.map(m=>m.id===entryId?next:m)};
    }));
  }
  // Personalização editorial de uma pessoa já vinculada ao Cadastro mestre
  // (origin "cadastro") — nunca toca nome/nascimento/fundação, por isso não
  // passa pelo bloqueio de updateEntry nem usa saveEditorialBirthday (que
  // rejeita qualquer edição de registro com source_client_id preenchido).
  function savePersonalizedProfile(groupId: string, entryId: string, patch: EditorialProfilePatch): void {
    if (!localPreview) {
      if (busy) return;
      setBusy(true);
      void savePersonalizedBirthdayProfile(entryId, patch).then(result => {
        if ("error" in result) { notify.error("Personalização não salva", result.error); return; }
        notify.success("Personalização salva", "Personalização editorial salva.");
        router.refresh();
      }).catch(() => notify.error("Personalização não salva", "Não foi possível salvar a personalização."))
        .finally(() => setBusy(false));
      return;
    }
    setGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      const apply = (e: BirthdayEntry | undefined): BirthdayEntry | undefined => (e && e.id === entryId ? { ...e, ...patch } : e);
      return { ...group, principal: apply(group.principal), foundingEntry: apply(group.foundingEntry) };
    }));
  }
  async function addMember(groupId:string,entry:BirthdayEntry):Promise<boolean>{
    if(localPreview){
      setGroups(prev=>prev.map(g=>g.id===groupId?{...g,members:[...g.members,entry]}:g));
      return true;
    }
    if(busy)return false;
    setBusy(true);
    try{
      const saved=await saveRealEntry(entry,groupId);
      if(!saved)return false;
      setGroups(prev=>prev.map(group=>group.id===groupId?{
        ...group,members:group.members.some(m=>m.id===saved)?group.members:
          [...group.members,{...entry,id:saved}]
      }:group));
      notify.success("Aniversariante incluído","Aniversariante incluído neste grupo.");
      return true;
    }catch{notify.error("Aniversariante não incluído","Falha ao incluir aniversariante.");return false;}
    finally{setBusy(false);}
  }
  async function addIndependent(entry:BirthdayEntry):Promise<boolean>{
    if(localPreview){
      setGroups(prev=>[...prev,{id:`local-group-${Date.now()}`,
        kind:"individual",label:entry.displayName,city:entry.city,principal:entry,members:[]}]);
      return true;
    }
    if(busy)return false;
    setBusy(true);
    try{
      const saved=await saveRealEntry(entry,null);
      if(!saved)return false;
      setGroups(prev=>prev.some(g=>g.id===`exception:${saved}`)?prev:[...prev,{
        id:`exception:${saved}`,kind:"individual",label:entry.displayName,city:entry.city,
        principal:{...entry,id:saved},members:[],
      }]);
      notify.success("Aniversariante incluído","Novo aniversariante incluído.");
      return true;
    }catch{notify.error("Aniversariante não incluído","Falha ao incluir aniversariante.");return false;}
    finally{setBusy(false);}
  }
  function togglePublication(entry:BirthdayEntry):void{
    if(localPreview||busy)return;
    setBusy(true);
    void setBirthdayPublication(entry.origin==="cadastro"?"cliente":"editorial",
      entry.id,!entry.publishInPrint).then(result=>{
      if("error" in result){notify.error("Não foi possível alterar a publicação",result.error);return;}
      setGroups(prev=>prev.map(group=>({
        ...group,
        principal:group.principal?.id===entry.id?
          {...group.principal,publishInPrint:result.data.published}:group.principal,
        foundingEntry:group.foundingEntry?.id===entry.id?
          {...group.foundingEntry,publishInPrint:result.data.published}:group.foundingEntry,
        members:group.members.map(m=>m.id===entry.id?
          {...m,publishInPrint:result.data.published}:m),
      })));
      notify.success(result.data.published?"Publicação autorizada":"Publicação desativada",
        result.data.published?"Publicação autorizada.":"Publicação desativada.");
      router.refresh();
    }).catch(()=>notify.error("Não foi possível alterar a publicação","Falha ao alterar publicação."))
      .finally(()=>setBusy(false));
  }
  function confirmDelete():void{
    if(!deleteTarget||busy)return;
    if(!localPreview){
      const group=groups.find(g=>g.id===deleteTarget.groupId);
      const entryId=deleteTarget.kind==="member"?deleteTarget.entryId:group?.principal?.id;
      if(!entryId||entryId===group?.id&&group?.principal?.origin==="cadastro"){
        notify.error("Não é permitido arquivar","Não é permitido arquivar o cadastro mestre.");setDeleteTarget(null);return;
      }
      setBusy(true);
      void setEditorialBirthdayActive(entryId,false).then(result=>{
        if("error" in result)notify.error("Não foi possível arquivar",result.error);
        else{notify.success("Registro arquivado","Registro editorial arquivado.");router.refresh();}
      }).catch(()=>notify.error("Não foi possível arquivar","Falha ao arquivar o registro."))
        .finally(()=>{setBusy(false);setDeleteTarget(null);});
      return;
    }
    if(deleteTarget.kind==="member"){
      setGroups(prev=>prev.map(g=>g.id===deleteTarget.groupId?
        {...g,members:g.members.filter(m=>m.id!==deleteTarget.entryId)}:g));
    }else{
      setGroups(prev=>prev.filter(g=>g.id!==deleteTarget.groupId));
    }
    setDeleteTarget(null);
  }

  function activateNewspaperWeek(): void {
    setPeriod("newspaper");
    setWeekReference(todayISO ? new Date(todayISO+"T12:00:00") : new Date());
    setSelectedDay(null);
  }

  function shiftWeek(delta: number): void {
    setWeekReference((prev) => shiftWeeks(prev, delta));
    setSelectedDay(null);
  }

  function toggleSelectedDay(day: Date): void {
    setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day));
  }

  function clearFilters(): void {
    setSearch("");
    setPeriod("all");
    setCity("all");
    setPublishFilter("all");
    setOriginFilter("all");
    setCustomStart("");
    setCustomEnd("");
    setSelectedDay(null);
  }

  // --- Relatório semanal (editorial — pessoas, nunca a árvore administrativa) ---
  // Padrão aprovado: DATA | NOME | CIDADE, uma pessoa por linha, ordem
  // cronológica e, dentro da data, alfabética — SEM título obrigatório e SEM
  // separador por dia (ver docs/ACORDOS-E-FONTE-DA-VERDADE.md, pedido de
  // 17/10/2026). Nunca inclui a mensagem de homenagem. Respeita só "ativo" e
  // "autorizado a publicar" — nunca exige mensagem preparada.
  const reportRange = useMemo(() => {
    if (selectedDay) return { start: selectedDay, end: selectedDay };
    if (period === "newspaper") return newspaperRange;
    return activeRange;
  }, [selectedDay, period, newspaperRange, activeRange]);
  const reportRows = useMemo(() => {
    const printable = matchingFlat.filter((item) => item.entry.active && item.entry.publishInPrint);
    const withDay = printable
      .map(({ entry }) => {
        if (!reportRange) return { entry, dayIndex: 0 };
        const idx = dayIndexWithinRange(entry.birthDate, reportRange.start, reportRange.end);
        return idx === null ? null : { entry, dayIndex: idx };
      })
      .filter((x): x is { entry: BirthdayEntry; dayIndex: number } => x !== null);
    return withDay.sort((a, b) => (
      a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.entry.displayName.localeCompare(b.entry.displayName, "pt-BR")
    )).map((x) => x.entry);
  }, [matchingFlat, reportRange]);

  const [reportCopied, setReportCopied] = useState(false);
  async function copyReport(): Promise<void> {
    const text = reportRows.map((entry) => `${formatBirthDateShort(entry.birthDate)}\t${entry.displayName}\t${entry.city || ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setReportCopied(true);
      window.setTimeout(() => setReportCopied(false), 1800);
    } catch {
      notify.error("Não foi possível copiar", "Não foi possível copiar a relação.");
    }
  }

  const totalPeople = matchingFlat.length;
  const totalGroups = visibleGroups.length;

  // Mensagens preparadas na edição inteira (não só da lista filtrada visível) — pro resumo do cabeçalho.
  const preparedMessageCount = useMemo(() => {
    if (!isCurrentEditorialWeek) return 0;
    return weekEntries.filter(({ entry }) => editionMessages.has(`${editionKey}::${entry.id}`)).length;
  }, [isCurrentEditorialWeek, weekEntries, editionMessages, editionKey]);

  function summaryText(): string {
    if (period === "newspaper") {
      const dayLabel = selectedDay
        ? formatDateLong(selectedDay)
        : `${formatDateShort(newspaperRange.start)} a ${formatDateShort(newspaperRange.end)}`;
      const base = `Semana do jornal · ${dayLabel} — ${totalPeople} aniversariante(s)`;
      if (!isCurrentEditorialWeek) return base;
      return `${base} · ${preparedMessageCount} mensagem(ns) preparada(s)`;
    }
    if (period === "all") return `Todos os aniversariantes — ${totalPeople} pessoa(s) em ${totalGroups} grupo(s)`;
    return `${totalPeople} aniversariante(s) encontrado(s)`;
  }

  return (
    <div className={`aniv-module ${styles.root}`}>
      <>
          <div className="aniv-week-cta-row no-print">
            <button type="button" className={`aniv-week-cta${period === "newspaper" ? " is-active" : ""}`} onClick={activateNewspaperWeek}>
              <strong>SEMANA DO JORNAL</strong>
              <span>{formatDateShort(newspaperRange.start)} → {formatDateShort(newspaperRange.end)}</span>
            </button>
            {period === "newspaper" ? (
              <div className="aniv-week-nav">
                <button type="button" className="cadastros-btn-secondary" onClick={() => shiftWeek(-1)}>‹ Semana anterior</button>
                <button type="button" className="cadastros-btn-secondary" onClick={() => setWeekReference(todayISO?new Date(todayISO+"T12:00:00"):new Date())}>Semana atual</button>
                <button type="button" className="cadastros-btn-secondary" onClick={() => shiftWeek(1)}>Próxima semana ›</button>
              </div>
            ) : null}
            <button type="button" className="cadastros-btn-primary aniv-create-birthday"
              title="Novo aniversariante, familiar ou caso extraordinário" onClick={() => setIncludeOpen(true)}>
              Novo +
            </button>
          </div>

          {period === "newspaper" ? (
            <div className="aniv-week-strip no-print" role="group" aria-label="Dias da semana do jornal">
              {weekDays.map((day) => {
                const count = dayCount(day);
                const selected = selectedDay ? isSameDay(selectedDay, day) : false;
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`aniv-day-cell${count > 0 ? " has-entries" : ""}${selected ? " is-selected" : ""}`}
                    onClick={() => toggleSelectedDay(day)}
                    aria-pressed={selected}
                  >
                    <span className="aniv-day-weekday">{weekdayAbbr(day)}</span>
                    <span className="aniv-day-number">{String(day.getDate()).padStart(2, "0")}</span>
                    <span className="aniv-day-count">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {period === "newspaper" && !isCurrentEditorialWeek ? (
            <p className="aniv-editorial-note no-print">
              As mensagens automáticas são preparadas para a semana editorial atual.
            </p>
          ) : null}

          <div className="cadastros-filters-bar no-print">
            <label className="cadastros-search">
              <span className="sr-only">Buscar</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome (tolera erro de digitação)" aria-label="Buscar por nome ou DD/MM" />
            </label>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as PeriodFilter);
                setSelectedDay(null);
              }}
              aria-label="Período"
              title="Período"
            >
              <option value="all">Todos</option>
              <option value="newspaper">Semana do jornal</option>
              <option value="today">Hoje</option>
              <option value="month">Este mês</option>
              <option value="custom">Personalizado</option>
            </select>
            {period === "custom" ? (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="De" title="De" />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="Até" title="Até" />
              </>
            ) : null}
            <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Cidade" title="Cidade">
              <option value="all">Cidade: todas</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={publishFilter} onChange={(e) => setPublishFilter(e.target.value as PublishFilter)} aria-label="Publicação" title="Publicação">
              <option value="all">Publicação: todas</option>
              <option value="yes">Publica no jornal</option>
              <option value="no">Não publica</option>
            </select>
            <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as OriginFilter)} aria-label="Origem" title="Origem">
              <option value="all">Origem: todas</option>
              <option value="cadastro">Cadastro</option>
              <option value="familiar">Familiar</option>
              <option value="manual">Manual</option>
            </select>
            <div className="cadastros-filters-actions">
              <button type="button" className="cadastros-btn-secondary" onClick={clearFilters}>
                Limpar filtros
              </button>
              <button type="button" className="cadastros-btn-secondary" onClick={copyReport}>
                {reportCopied ? "Copiado ✓" : "Copiar relação (tabulada)"}
              </button>
              <button type="button" className="cadastros-btn-primary" onClick={() => window.print()}>
                Gerar relatório
              </button>
            </div>
          </div>

          <p className="cadastros-count no-print">{summaryText()}</p>

          <div className="aniv-tree no-print">
            {visibleGroups.map((group) => {
              const isOpen = expanded.has(group.id);
              const memberCount = group.members.length;
              // Filtros aplicados também aos itens da árvore expandida:
              // não exibir pessoas de fora da semana sob um grupo que tem só um match.
              const shownMembers=group.members.filter(entryMatchesAll);
              const showPrincipal=Boolean(group.principal && entryMatchesAll(group.principal));
              const showFounding=Boolean(group.foundingEntry && entryMatchesAll(group.foundingEntry));
              return (
                <div key={group.id} className="aniv-group">
                  <div className="aniv-group-header-row">
                    <button
                      type="button"
                      className="aniv-group-header"
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(group.id)}
                    >
                      <span className="aniv-group-chevron" aria-hidden="true">{isOpen ? "▼" : "▶"}</span>
                      <span className="aniv-group-label">{group.label}</span>
                      {group.principal ? (
                        <>
                          <span className="aniv-entry-date">{formatBirthDateShort(group.principal.birthDate)}</span>
                          <span className="aniv-entry-city">{group.principal.city}</span>
                        </>
                      ) : group.foundingEntry ? (
                        <>
                          <span className="aniv-entry-date" title="Data de fundação">{formatBirthDateShort(group.foundingEntry.birthDate)}</span>
                          <span className="aniv-entry-city">{group.foundingEntry.city}</span>
                          <span className="aniv-group-meta">{memberCount} aniversariante(s) relacionado(s)</span>
                        </>
                      ) : (
                        <span className="aniv-group-meta">{memberCount} aniversariante(s) relacionado(s)</span>
                      )}
                      {group.kind === "individual" ? <span className="cadastro-kind-hint">Origem: Cadastro</span> : null}
                    </button>
                    {!group.principal && !group.foundingEntry && localPreview ? (
                      <button
                        type="button"
                        className="aniv-delete-btn"
                        onClick={() => setDeleteTarget({ kind: "group", groupId: group.id, label: group.label, groupKind: group.kind, memberCount })}
                      >
                        Excluir grupo
                      </button>
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="aniv-group-body">
                      {showPrincipal && group.principal ? (
                        <EntryRow
                          entry={group.principal}
                          isPrincipal
                          highlighted={Boolean(search.trim()) && fuzzyMatches(search, group.principal.displayName)}
                          readonlyPrincipal={!localPreview && group.principal.origin==="cadastro"}
                          pending={busy}
                          onTogglePublication={()=>togglePublication(group.principal!)}
                          onSave={(next) => updateEntry(group.id, group.principal!.id, next)}
                          onSaveProfile={(patch) => savePersonalizedProfile(group.id, group.principal!.id, patch)}
                          onDelete={() => setDeleteTarget({ kind: "group", groupId: group.id, label: group.label, groupKind: group.kind, memberCount })}
                          editorial={editorialFor(group.principal.id)}
                          onChangeMessage={() => changeMessage(group.principal!.id)}
                          onSaveManualMessage={(text) => saveManualMessage(group.principal!.id, text)}
                          onUploadPhoto={(file) => uploadEntryPhoto(group.principal!.id, file)}
                          onRemovePhoto={() => removeEntryPhoto(group.principal!.id)}
                          onPickTemplate={(key, src) => pickTemplateFor(group.principal!.id, key, src)}
                          onGenerateAI={() => generateAIFor(group.principal!.id)}
                          aiConfigured={aiConfigured}
                          aiBusy={busy}
                          customTemplates={customTemplates}
                          canManageTemplates={templatesAllowed}
                          onSaveCustomTemplate={saveCustomTemplate}
                          onReloadCustomTemplates={reloadCustomTemplates}
                        />
                      ) : null}
                      {showFounding && group.foundingEntry ? (
                        <EntryRow
                          entry={group.foundingEntry}
                          isPrincipal
                          highlighted={Boolean(search.trim()) && fuzzyMatches(search, group.foundingEntry.displayName)}
                          readonlyPrincipal={!localPreview && group.foundingEntry.origin==="cadastro"}
                          pending={busy}
                          onTogglePublication={()=>togglePublication(group.foundingEntry!)}
                          onSave={(next) => updateEntry(group.id, group.foundingEntry!.id, next)}
                          onSaveProfile={(patch) => savePersonalizedProfile(group.id, group.foundingEntry!.id, patch)}
                          onDelete={() => setDeleteTarget({ kind: "group", groupId: group.id, label: group.label, groupKind: group.kind, memberCount })}
                          editorial={editorialFor(group.foundingEntry.id)}
                          onChangeMessage={() => changeMessage(group.foundingEntry!.id)}
                          onSaveManualMessage={(text) => saveManualMessage(group.foundingEntry!.id, text)}
                          onUploadPhoto={(file) => uploadEntryPhoto(group.foundingEntry!.id, file)}
                          onRemovePhoto={() => removeEntryPhoto(group.foundingEntry!.id)}
                          onPickTemplate={(key, src) => pickTemplateFor(group.foundingEntry!.id, key, src)}
                          onGenerateAI={() => generateAIFor(group.foundingEntry!.id)}
                          aiConfigured={aiConfigured}
                          aiBusy={busy}
                          customTemplates={customTemplates}
                          canManageTemplates={templatesAllowed}
                          onSaveCustomTemplate={saveCustomTemplate}
                          onReloadCustomTemplates={reloadCustomTemplates}
                        />
                      ) : null}
                      {shownMembers.map((member) => (
                        <div key={member.id} className="aniv-member-row">
                          <EntryRow
                            entry={member}
                            isPrincipal={false}
                            highlighted={Boolean(search.trim()) && fuzzyMatches(search, member.displayName)}
                            pending={busy}
                            onSave={(next) => updateEntry(group.id, member.id, next)}
                            onDelete={() => setDeleteTarget({ kind: "member", groupId: group.id, entryId: member.id, name: member.displayName, groupLabel: group.label })}
                            editorial={editorialFor(member.id)}
                            onChangeMessage={() => changeMessage(member.id)}
                            onSaveManualMessage={(text) => saveManualMessage(member.id, text)}
                            onUploadPhoto={(file) => uploadEntryPhoto(member.id, file)}
                            onRemovePhoto={() => removeEntryPhoto(member.id)}
                            onPickTemplate={(key, src) => pickTemplateFor(member.id, key, src)}
                            onGenerateAI={() => generateAIFor(member.id)}
                            aiConfigured={aiConfigured}
                            aiBusy={busy}
                            customTemplates={customTemplates}
                            canManageTemplates={templatesAllowed}
                            onSaveCustomTemplate={saveCustomTemplate}
                            onReloadCustomTemplates={reloadCustomTemplates}
                          />
                        </div>
                      ))}
                      {(localPreview || /^[a-f0-9-]{36}$/i.test(group.id))?
                        <AddMemberForm kind={group.kind} localPreview={localPreview} onAdd={(entry) => addMember(group.id, entry)} /> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {visibleGroups.length === 0 ? <p className="helper-text">Nenhum aniversariante encontrado com os filtros atuais.</p> : null}
          </div>

          {/* Relatório — só existe no print (CSS @media print); na tela fica oculto.
              Padrão aprovado: DATA | NOME | CIDADE, sem título obrigatório, sem
              separador por dia, ordem cronológica e, dentro da data, alfabética. */}
          <div className="aniv-print-report">
            <table className="aniv-print-table">
              <tbody>
                {reportRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="aniv-print-col-date">{formatBirthDateShort(entry.birthDate)}</td>
                    <td className="aniv-print-col-name">{entry.displayName}</td>
                    <td className="aniv-print-col-city">{entry.city || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </>

      <dialog ref={includeDialogRef} className="ir-modal ir-modal--form" aria-labelledby="aniv-include-title" onCancel={(e) => { e.preventDefault(); setIncludeOpen(false); }}>
        <IncludeForm
          localPreview={localPreview}
          groups={groups}
          onCancel={() => setIncludeOpen(false)}
          onSubmit={async(linkGroupId,entry)=>{
            const saved=linkGroupId?await addMember(linkGroupId,entry):await addIndependent(entry);
            if(saved)setIncludeOpen(false);
            return saved;
          }}
        />
      </dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "group" ? `Excluir ${deleteTarget.groupKind === "company" ? "grupo" : "aniversariante"} de "${deleteTarget.label}"?` : `Excluir "${deleteTarget?.name}"?`}
        description={
          deleteTarget?.kind === "group" ? (
            deleteTarget.memberCount > 0 ? (
              <>
                <p>
                  {deleteTarget.groupKind === "company"
                    ? `Este grupo possui ${deleteTarget.memberCount} aniversariante(s) relacionado(s).`
                    : `Este grupo possui ${deleteTarget.memberCount} familiar(es) relacionado(s).`}
                </p>
                <p>Serão removidos da lista editorial: "{deleteTarget.label}" e {deleteTarget.memberCount} registro(s) relacionado(s).</p>
                <p><strong>O Cadastro mestre não será alterado.</strong></p>
              </>
            ) : (
              <p>
                Você está prestes a excluir "{deleteTarget.label}" da lista editorial de aniversariantes.{" "}
                <strong>O Cadastro mestre não será alterado.</strong>
              </p>
            )
          ) : deleteTarget ? (
            <p>
              Você está prestes a excluir "{deleteTarget.name}" da lista editorial de aniversariantes
              {deleteTarget.kind === "member" ? ` relacionados a "${deleteTarget.groupLabel}"` : ""}.{" "}
              <strong>O Cadastro mestre não será alterado.</strong>
            </p>
          ) : null
        }
        confirmLabel={localPreview?"Excluir":"Arquivar registro"}
        onConfirm={()=>confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function IncludeForm({
  groups,
  onCancel,
  onSubmit,
  localPreview,
}: {
  groups: BirthdayGroup[];
  localPreview: boolean;
  onCancel: () => void;
  onSubmit: (linkGroupId: string | null, entry: BirthdayEntry) => Promise<boolean>;
}): JSX.Element {
  const [name, setName] = useState("");
  const [dayMonth,setDayMonth]=useState("");
  const [year,setYear]=useState("");
  const [dateError,setDateError]=useState("");
  const [cityValue, setCityValue] = useState("");
  const [linkGroupId, setLinkGroupId] = useState<string>("");
  const [relationship, setRelationship] = useState("");
  const [profession, setProfession] = useState("");
  const [organization, setOrganization] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [messageContext, setMessageContext] = useState("");
  const [publishInPrint, setPublishInPrint] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving,setSaving]=useState(false);

  async function submit():Promise<void> {
    if(saving)return;
    const parsed=parseBirthdayDateInput(dayMonth,year);
    if(!name.trim()||!parsed){setDateError("Preencha nome e dia/mês válido. O ano pode ficar em branco.");return;}
    setDateError("");
    const targetGroup = groups.find((g) => g.id === linkGroupId);
    const origin: BirthdayOrigin = !linkGroupId ? "manual" : targetGroup?.kind === "individual" ? "familiar" : "manual";
    setSaving(true);
    let success=false;
    try{success=await onSubmit(linkGroupId || null, {
      id: `local-${Date.now()}`,
      displayName: name.trim(),
      birthDate:parsed.birthDate,
      birthYearKnown:parsed.birthYearKnown,
      city: cityValue.trim(),
      relationship: linkGroupId ? relationship.trim() || undefined : undefined,
      origin,
      active: true,
      publishInPrint,
      notes: notes.trim() || undefined,
      profession: profession.trim() || undefined,
      organization: organization.trim() || undefined,
      knownAs: knownAs.trim() || undefined,
      messageContext: messageContext.trim() || undefined,
    });}catch{success=false;}finally{setSaving(false);}
    if(!success)setDateError("Não foi possível salvar. Verifique os dados e tente novamente.");
  }

  return (
    <div>
      <h2 id="aniv-include-title">Novo aniversariante</h2>
      <p className="helper-text">Para um caso excepcional, deixe a origem sem vínculo. Empresas e pessoas podem ser selecionadas como grupo.</p>
      <div className="ir-modal-scroll">
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-6 ir-modal-field--primary">
            <span className="field-label">Nome para publicação</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Dia/mês da data</span>
            <input type="text" inputMode="numeric" maxLength={5} placeholder="DD/MM" value={dayMonth} onChange={(e)=>setDayMonth(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">Ano (opcional)</span>
            <input type="text" inputMode="numeric" maxLength={4} placeholder="Se souber" value={year} onChange={(e)=>setYear(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Cidade</span>
            <input type="text" value={cityValue} onChange={(e) => setCityValue(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Origem / vínculo</span>
            <select value={linkGroupId} onChange={(e) => setLinkGroupId(e.target.value)}>
              <option value="">Caso extraordinário (sem vínculo com cliente)</option>
              {groups.filter(g=>localPreview||/^[a-f0-9-]{36}$/i.test(g.id)).map((g) => <option key={g.id} value={g.id}>Vincular a: {g.label}</option>)}
            </select>
          </label>
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Relação / parentesco <span className="field-optional">(opcional)</span></span>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={!linkGroupId}
              placeholder="Ex.: esposa, filho, sócio, responsável"
            />
          </label>
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Profissão / atividade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Ex.: Empresário, Professora" />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Empresa / entidade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Como é conhecido / apelido <span className="field-optional">(opcional)</span></span>
            <input type="text" value={knownAs} onChange={(e) => setKnownAs(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Informações para a mensagem <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={messageContext} onChange={(e) => setMessageContext(e.target.value)} placeholder="Ex.: integrante da Associação Comercial" />
          </label>
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Observação <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="aniv-entry-switches">
          <button type="button" role="switch" aria-checked={publishInPrint} className={`switch-control${publishInPrint ? " is-on" : ""}`} onClick={() => setPublishInPrint((v) => !v)}>
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span>Publicar no jornal</span>
          </button>
        </div>
      </div>
      {dateError?<p className="form-error" role="alert">{dateError}</p>:null}
      <div className="ir-confirm-actions">
        <button type="button" disabled={saving} onClick={onCancel}>Cancelar</button>
        <button type="button" disabled={saving} className="form-action-primary" onClick={()=>void submit()}>{saving?"Salvando…":"Salvar aniversariante"}</button>
      </div>
    </div>
  );
}
