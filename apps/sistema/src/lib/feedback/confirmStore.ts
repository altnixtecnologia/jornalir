/**
 * Confirmação global com o modal do próprio sistema (`ConfirmDialog`,
 * centralizado na tela) — substitui `window.confirm()`, cuja caixa genérica
 * do navegador ("controle.altnix.com.br diz") o usuário pediu para não usar
 * mais (07/11/2026). Mesmo desenho do `toastStore`: singleton de módulo com
 * pub/sub, chamável de qualquer handler sem hook:
 *
 *   if (!(await confirmDialog({ title: "Remover?", description: "…" }))) return;
 *
 * `ConfirmHost` (montado uma vez em `RootProviders`) é o único leitor.
 */
export interface ConfirmOptions {
  title: string;
  /** Texto simples; parágrafos separados por linha em branco ("\n\n"). */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmar vermelho (padrão) ou azul (ação não destrutiva). */
  destructive?: boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
}

type Listener = () => void;

let current: PendingConfirm | null = null;
let queue: PendingConfirm[] = [];
const listeners = new Set<Listener>();
let idCounter = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const pending: PendingConfirm = { ...options, id: ++idCounter, resolve };
    if (current) queue = [...queue, pending];
    else current = pending;
    emit();
  });
}

/** Chamado pelo `ConfirmHost` quando o usuário escolhe (Escape/clique fora = cancelar). */
export function settleConfirm(id: number, confirmed: boolean): void {
  if (!current || current.id !== id) return;
  const settled = current;
  current = queue[0] ?? null;
  queue = queue.slice(1);
  emit();
  settled.resolve(confirmed);
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentConfirm(): PendingConfirm | null {
  return current;
}

/** Só para testes. */
export function resetConfirmStoreForTests(): void {
  current = null;
  queue = [];
  idCounter = 0;
}
