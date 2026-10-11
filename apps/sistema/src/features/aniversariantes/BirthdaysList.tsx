"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
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
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
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

function trackUsage(usage: UsageCounts, state: EditionMessageState): void {
  usage.family[state.family] = (usage.family[state.family] ?? 0) + 1;
  usage.opening[state.opening] = (usage.opening[state.opening] ?? 0) + 1;
  usage.ending[state.ending] = (usage.ending[state.ending] ?? 0) + 1;
}

type PeriodFilter = "all" | "newspaper" | "today" | "month" | "custom";
type PublishFilter = "all" | "yes" | "no";
type OriginFilter = "all" | BirthdayOrigin;

/**
 * Mensagem pertence à EDIÇÃO (Semana do Jornal atual), não ao aniversariante
 * — por isso vive num Map separado, chaveado por `${editionKey}::${entryId}`,
 * nunca dentro de `BirthdayEntry`. Preview puro: estado em memória, resetado
 * ao recarregar a página (nenhuma persistência). Sem destaque e sem edição
 * manual — só "Trocar mensagem" e "Copiar mensagem" (decisão aprovada).
 */
interface EditionMessageState {
  text: string;
  family: string;
  opening: string;
  ending: string;
}

interface EntryDraft {
  displayName: string;
  birthDate: string;
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

function draftFromEntry(entry: BirthdayEntry): EntryDraft {
  return {
    displayName: entry.displayName,
    birthDate: entry.birthDate,
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
    return { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T23:59:59`) };
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
}: {
  entry: BirthdayEntry;
  isPrincipal: boolean;
  highlighted: boolean;
  onSave: (next: BirthdayEntry) => void;
  onDelete: () => void;
  editorial: EditionMessageState | null;
  onChangeMessage: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromEntry(entry));
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  function startEdit(): void {
    setDraft(draftFromEntry(entry));
    setEditing(true);
  }

  function save(): void {
    onSave({
      ...entry,
      displayName: draft.displayName.trim() || entry.displayName,
      birthDate: draft.birthDate || entry.birthDate,
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
            <span className="field-label">Nascimento</span>
            <input type="date" value={draft.birthDate} onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))} />
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
        <div className="aniv-entry-actions">
          <button type="button" className="cadastros-btn-primary" onClick={save}>Salvar (preview)</button>
          <button type="button" className="cadastros-btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`aniv-entry${highlighted ? " is-match" : ""}`}>
      <div className="aniv-entry-main">
        <span className="aniv-entry-name">{entry.displayName}</span>
        {entry.relationship ? <span className="aniv-entry-relationship">{entry.relationship}</span> : null}
        <span className="aniv-entry-date">{formatBirthDateShort(entry.birthDate)}</span>
        <span className="aniv-entry-city">{entry.city || "—"}</span>
        {entry.profession ? <span className="aniv-entry-profession">{entry.profession}</span> : null}
        <span className="cadastro-role-badge">{ORIGIN_LABELS[entry.origin]}</span>
        {!entry.active ? <span className="status-pill status-pill--archived">Inativo</span> : null}
        <span className={`status-pill ${entry.publishInPrint ? "status-pill--published" : "status-pill--draft"}`}>
          {entry.publishInPrint ? "Publica" : "Não publica"}
        </span>
      </div>
      <div className="aniv-entry-row-actions no-print">
        <button type="button" className="cadastros-btn-secondary aniv-edit-btn" onClick={startEdit}>
          Editar
        </button>
        <button type="button" className="aniv-delete-btn" onClick={onDelete}>
          Excluir
        </button>
      </div>
      {editorial ? (
        <div className="aniv-editorial no-print">
          <p className="aniv-editorial-text">
            Mensagem:
            <br />
            &ldquo;{editorial.text}&rdquo;
          </p>
          <div className="aniv-editorial-actions">
            <button type="button" className="aniv-editorial-btn" onClick={onChangeMessage}>
              Trocar mensagem
            </button>
            <button type="button" className="aniv-editorial-btn" onClick={copyMessage}>
              {copied ? "Copiado ✓" : "Copiar mensagem"}
            </button>
            {copyError ? <span className="aniv-editorial-error">Não foi possível copiar.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddMemberForm({ kind, onAdd }: { kind: "individual" | "company"; onAdd: (entry: BirthdayEntry) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");

  function submit(): void {
    if (!name.trim() || !birthDate) return;
    onAdd({
      id: `local-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      displayName: name.trim(),
      birthDate,
      city: city.trim(),
      relationship: relationship.trim() || undefined,
      origin: kind === "individual" ? "familiar" : "manual",
      active: true,
      publishInPrint: true,
    });
    setName("");
    setRelationship("");
    setBirthDate("");
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
      <p className="helper-text">Demonstração local (preview) — nada é salvo de verdade ainda.</p>
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
          <span className="field-label">Nascimento</span>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </label>
        <label className="cadastro-field cadastro-field--span-3">
          <span className="field-label">Cidade</span>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      <div className="aniv-entry-actions">
        <button type="button" className="cadastros-btn-primary" onClick={submit}>Adicionar (preview)</button>
        <button type="button" className="cadastros-btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

export function BirthdaysList({ localPreview }: { localPreview: boolean }): JSX.Element {
  const [groups, setGroups] = useState<BirthdayGroup[]>(() => (localPreview ? buildBirthdayPreviewSeed() : []));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [weekReference, setWeekReference] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [city, setCity] = useState("all");
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [includeOpen, setIncludeOpen] = useState(false);
  const includeDialogRef = useRef<HTMLDialogElement>(null);
  const [editionMessages, setEditionMessages] = useState<Map<string, EditionMessageState>>(() => new Map());

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
  const currentEditionKey = useMemo(() => getNewspaperWeekRange(new Date()).start.toISOString().slice(0, 10), []);
  const isCurrentEditorialWeek = editionKey === currentEditionKey;

  // Base de verdade da edição: TODOS os aniversariantes da semana (independente dos filtros de
  // busca/cidade/publicação/origem) — mensagem pertence à semana inteira, não à lista filtrada
  // visível, pra não regenerar nada quando o usuário muda um filtro.
  const weekEntries = useMemo(() => {
    const out: Array<{ entry: BirthdayEntry; dayLabel: string }> = [];
    groups.forEach((group) => {
      const candidates = [group.principal, ...group.members].filter((e): e is BirthdayEntry => e != null);
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
    if (period !== "newspaper" || !isCurrentEditorialWeek) return;
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
        next.set(key, generated);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [period, isCurrentEditorialWeek, editionKey, weekEntries]);

  function changeMessage(entryId: string): void {
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
      next.set(key, generated);
      return next;
    });
  }

  function editorialFor(entryId: string): EditionMessageState | null {
    if (period !== "newspaper" || !isCurrentEditorialWeek) return null;
    return editionMessages.get(`${editionKey}::${entryId}`) ?? null;
  }

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((group) => {
      if (group.principal?.city) set.add(group.principal.city);
      group.members.forEach((member) => { if (member.city) set.add(member.city); });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [groups]);

  function entryMatchesNonPeriod(entry: BirthdayEntry): boolean {
    if (search.trim() && !fuzzyMatches(search, entry.displayName)) return false;
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
    const list = groups.filter((g) => matchingGroupIds.has(g.id));
    if (!activeRange && !(period === "newspaper" && selectedDay)) {
      return [...list].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    }
    function earliestIndex(group: BirthdayGroup): number {
      const entries = [group.principal, ...group.members].filter((e): e is BirthdayEntry => e != null && entryMatchesAll(e));
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
  }, [groups, matchingGroupIds, activeRange, selectedDay, period]);

  function dayCount(day: Date): number {
    let count = 0;
    groups.forEach((group) => {
      const entries = [group.principal, ...group.members].filter((e): e is BirthdayEntry => Boolean(e));
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

  function updateEntry(groupId: string, entryId: string, next: BirthdayEntry): void {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        if (group.principal?.id === entryId) return { ...group, principal: next };
        return { ...group, members: group.members.map((m) => (m.id === entryId ? next : m)) };
      }),
    );
  }

  function addMember(groupId: string, entry: BirthdayEntry): void {
    setGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, members: [...group.members, entry] } : group)));
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "member") {
      setGroups((prev) => prev.map((g) => (g.id === deleteTarget.groupId ? { ...g, members: g.members.filter((m) => m.id !== deleteTarget.entryId) } : g)));
    } else {
      setGroups((prev) => prev.filter((g) => g.id !== deleteTarget.groupId));
    }
    setDeleteTarget(null);
  }

  function activateNewspaperWeek(): void {
    setPeriod("newspaper");
    setWeekReference(new Date());
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

  // --- Relatório (editorial — pessoas, nunca a árvore administrativa) ---
  const reportSections = useMemo(() => {
    if (!activeRange && !(period === "newspaper" && selectedDay)) {
      const sorted = [...matchingFlat].sort((a, b) => {
        const am = Number(a.entry.birthDate.slice(5, 7)) * 100 + Number(a.entry.birthDate.slice(8, 10));
        const bm = Number(b.entry.birthDate.slice(5, 7)) * 100 + Number(b.entry.birthDate.slice(8, 10));
        return am !== bm ? am - bm : a.entry.displayName.localeCompare(b.entry.displayName, "pt-BR");
      });
      return [{ label: null as string | null, entries: sorted.map((m) => m.entry) }];
    }
    const range = selectedDay ? { start: selectedDay, end: selectedDay } : activeRange!;
    const byDate = new Map<string, { date: Date; entries: BirthdayEntry[] }>();
    matchingFlat.forEach(({ entry }) => {
      const idx = selectedDay ? 0 : dayIndexWithinRange(entry.birthDate, range.start, range.end);
      if (idx === null) return;
      const date = new Date(range.start);
      date.setDate(date.getDate() + idx);
      const key = date.toDateString();
      if (!byDate.has(key)) byDate.set(key, { date, entries: [] });
      byDate.get(key)!.entries.push(entry);
    });
    return Array.from(byDate.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(({ date, entries }) => ({
        label: `${weekdayFull(date)} — ${formatDateShort(date)}`,
        entries: [...entries].sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR")),
      }));
  }, [matchingFlat, activeRange, selectedDay, period]);

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
    <div className="aniv-module">
      {!localPreview ? (
        <div className="aniv-empty-real">
          <p>Nenhum aniversariante cadastrado ainda.</p>
          <p className="helper-text">
            Este módulo ainda não tem persistência real — disponível apenas em visualização local de desenvolvimento.
          </p>
        </div>
      ) : (
        <>
          <div className="aniv-header-row no-print">
            <button type="button" className="cadastros-btn-primary" onClick={() => setIncludeOpen(true)}>
              + Incluir aniversariante
            </button>
          </div>

          <div className="aniv-week-cta-row no-print">
            <button type="button" className={`aniv-week-cta${period === "newspaper" ? " is-active" : ""}`} onClick={activateNewspaperWeek}>
              <strong>SEMANA DO JORNAL</strong>
              <span>{formatDateShort(newspaperRange.start)} → {formatDateShort(newspaperRange.end)}</span>
            </button>
            {period === "newspaper" ? (
              <div className="aniv-week-nav">
                <button type="button" className="cadastros-btn-secondary" onClick={() => shiftWeek(-1)}>‹ Semana anterior</button>
                <button type="button" className="cadastros-btn-secondary" onClick={() => setWeekReference(new Date())}>Semana atual</button>
                <button type="button" className="cadastros-btn-secondary" onClick={() => shiftWeek(1)}>Próxima semana ›</button>
              </div>
            ) : null}
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
              Mensagens são preparadas automaticamente para a semana editorial atual.
            </p>
          ) : null}

          <div className="cadastros-filters-bar no-print">
            <label className="cadastros-search">
              <span className="sr-only">Buscar</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome (tolera erro de digitação)" />
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
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="De" title="De" />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="Até" title="Até" />
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
                      ) : (
                        <span className="aniv-group-meta">{memberCount} aniversariante(s) relacionado(s)</span>
                      )}
                      {group.kind === "individual" ? <span className="cadastro-kind-hint">Origem: Cadastro</span> : null}
                    </button>
                    {!group.principal ? (
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
                      {group.principal ? (
                        <EntryRow
                          entry={group.principal}
                          isPrincipal
                          highlighted={Boolean(search.trim()) && fuzzyMatches(search, group.principal.displayName)}
                          onSave={(next) => updateEntry(group.id, group.principal!.id, next)}
                          onDelete={() => setDeleteTarget({ kind: "group", groupId: group.id, label: group.label, groupKind: group.kind, memberCount })}
                          editorial={editorialFor(group.principal.id)}
                          onChangeMessage={() => changeMessage(group.principal!.id)}
                        />
                      ) : null}
                      {group.members.map((member) => (
                        <div key={member.id} className="aniv-member-row">
                          <EntryRow
                            entry={member}
                            isPrincipal={false}
                            highlighted={Boolean(search.trim()) && fuzzyMatches(search, member.displayName)}
                            onSave={(next) => updateEntry(group.id, member.id, next)}
                            onDelete={() => setDeleteTarget({ kind: "member", groupId: group.id, entryId: member.id, name: member.displayName, groupLabel: group.label })}
                            editorial={editorialFor(member.id)}
                            onChangeMessage={() => changeMessage(member.id)}
                          />
                        </div>
                      ))}
                      <AddMemberForm kind={group.kind} onAdd={(entry) => addMember(group.id, entry)} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {visibleGroups.length === 0 ? <p className="helper-text">Nenhum aniversariante encontrado com os filtros atuais.</p> : null}
          </div>

          {/* Relatório — só existe no print (CSS @media print); na tela fica oculto. */}
          <div className="aniv-print-report">
            <h1>ANIVERSARIANTES</h1>
            <p className="aniv-print-period">
              {period === "all"
                ? "Período: todos"
                : period === "newspaper"
                  ? `Período: ${formatDateLong(newspaperRange.start)} a ${formatDateLong(newspaperRange.end)}${selectedDay ? ` (dia: ${formatDateLong(selectedDay)})` : ""}`
                  : activeRange
                    ? `Período: ${formatDateLong(activeRange.start)} a ${formatDateLong(activeRange.end)}`
                    : "Período personalizado incompleto"}
            </p>
            {reportSections.map((section, index) => (
              <div key={section.label ?? `sec-${index}`} className="aniv-print-section">
                {section.label ? <h2>{section.label}</h2> : null}
                <ul>
                  {section.entries.map((entry) => (
                    <li key={entry.id}>
                      {entry.displayName}
                      {entry.city ? ` — ${entry.city}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="aniv-print-total">Total: {matchingFlat.length} aniversariante(s)</p>
          </div>
        </>
      )}

      <dialog ref={includeDialogRef} className="ir-modal ir-modal--form" aria-labelledby="aniv-include-title" onCancel={(e) => { e.preventDefault(); setIncludeOpen(false); }}>
        <IncludeForm
          groups={groups}
          onCancel={() => setIncludeOpen(false)}
          onSubmit={(linkGroupId, entry) => {
            if (linkGroupId) {
              addMember(linkGroupId, entry);
            } else {
              setGroups((prev) => [
                ...prev,
                { id: `local-group-${Date.now()}`, kind: "individual", label: entry.displayName, city: entry.city, principal: entry, members: [] },
              ]);
            }
            setIncludeOpen(false);
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
        confirmLabel={deleteTarget?.kind === "group" ? "Excluir grupo" : "Excluir aniversariante"}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function IncludeForm({
  groups,
  onCancel,
  onSubmit,
}: {
  groups: BirthdayGroup[];
  onCancel: () => void;
  onSubmit: (linkGroupId: string | null, entry: BirthdayEntry) => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cityValue, setCityValue] = useState("");
  const [linkGroupId, setLinkGroupId] = useState<string>("");
  const [relationship, setRelationship] = useState("");
  const [profession, setProfession] = useState("");
  const [organization, setOrganization] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [messageContext, setMessageContext] = useState("");
  const [publishInPrint, setPublishInPrint] = useState(true);
  const [notes, setNotes] = useState("");

  function submit(): void {
    if (!name.trim() || !birthDate) return;
    const targetGroup = groups.find((g) => g.id === linkGroupId);
    const origin: BirthdayOrigin = !linkGroupId ? "manual" : targetGroup?.kind === "individual" ? "familiar" : "manual";
    onSubmit(linkGroupId || null, {
      id: `local-${Date.now()}`,
      displayName: name.trim(),
      birthDate,
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
    });
  }

  return (
    <div>
      <h2 id="aniv-include-title">Incluir aniversariante</h2>
      <p className="helper-text"><strong>Dados de demonstração — não persistidos.</strong></p>
      <div className="ir-modal-scroll">
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-6 ir-modal-field--primary">
            <span className="field-label">Nome para publicação</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Data de nascimento</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Cidade</span>
            <input type="text" value={cityValue} onChange={(e) => setCityValue(e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Origem / vínculo</span>
            <select value={linkGroupId} onChange={(e) => setLinkGroupId(e.target.value)}>
              <option value="">Registro manual independente</option>
              {groups.map((g) => <option key={g.id} value={g.id}>Vincular a: {g.label}</option>)}
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
      <div className="ir-confirm-actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="form-action-primary" onClick={submit}>Incluir (preview)</button>
      </div>
    </div>
  );
}
