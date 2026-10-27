/** Store externo dos avisos flutuantes (toasts) — framework-free de
 * propósito: `notify.success/error/warning(...)` (ver `notify.ts`) precisa
 * ser chamável de qualquer função client-side (handler de evento, callback
 * assíncrono) sem exigir um hook no topo do componente chamador. Um
 * singleton de módulo com pub/sub resolve isso; `ToastProvider` é o único
 * lugar que o lê, via `useSyncExternalStore`.
 *
 * Este é o sistema GLOBAL de avisos de resultado de operação — diferente
 * da central de notificações (`features/notificacoes`), de push
 * (`AdminNotificationBell`/`SiteRequestNotificationBell`) e dos diálogos de
 * confirmação (`ConfirmDialog`). Nunca usar para substituir nenhum desses.
 */
export type ToastKind = "success" | "error" | "warning";

export interface ToastRecord {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: number;
  /** `null` = nunca fecha automaticamente (erro e aviso importante). */
  durationMs: number | null;
}

type Listener = () => void;

const MAX_VISIBLE = 4;
const SUCCESS_DURATION_MS = 5000;
// Mesmo kind+título+descrição repetido numa janela curta é tratado como
// duplicata (ex.: clique duplo antes do botão desabilitar, ou um efeito
// disparando de novo por causa de uma dependência) — nunca empilha.
const DEDUPE_WINDOW_MS = 4000;

let visible: ToastRecord[] = [];
let queue: ToastRecord[] = [];
const listeners = new Set<Listener>();
let idCounter = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function promoteFromQueue(): void {
  while (visible.length < MAX_VISIBLE && queue.length > 0) {
    visible = [...visible, queue[0]];
    queue = queue.slice(1);
  }
}

function isDuplicate(kind: ToastKind, title: string, description: string | undefined, now: number): boolean {
  return [...visible, ...queue].some(
    (toast) =>
      toast.kind === kind &&
      toast.title === title &&
      toast.description === description &&
      now - toast.createdAt < DEDUPE_WINDOW_MS,
  );
}

/** Nunca chamar direto — use `notify.success/error/warning` em `notify.ts`. */
export function pushToast(kind: ToastKind, title: string, description?: string): string | null {
  const now = Date.now();
  if (isDuplicate(kind, title, description, now)) return null;
  const id = `toast-${++idCounter}-${now}`;
  const record: ToastRecord = {
    id,
    kind,
    title,
    description,
    createdAt: now,
    durationMs: kind === "success" ? SUCCESS_DURATION_MS : null,
  };
  if (visible.length < MAX_VISIBLE) {
    visible = [...visible, record];
  } else {
    queue = [...queue, record];
  }
  emit();
  return id;
}

export function dismissToast(id: string): void {
  const wasVisible = visible.some((toast) => toast.id === id);
  visible = visible.filter((toast) => toast.id !== id);
  queue = queue.filter((toast) => toast.id !== id);
  if (wasVisible) promoteFromQueue();
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVisibleToasts(): ToastRecord[] {
  return visible;
}

/** Só para testes — nunca usar em código de produção. */
export function resetToastStoreForTests(): void {
  visible = [];
  queue = [];
  idCounter = 0;
}
