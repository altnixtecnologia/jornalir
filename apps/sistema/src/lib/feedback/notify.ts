import { pushToast } from "./toastStore";

/** API pública dos avisos flutuantes globais (Fase 20 — toasts).
 *
 * `notify.success(titulo, descricao)` / `notify.error(...)` / `notify.warning(...)`.
 * Título curto e explícito; descrição objetiva e contextual — nunca "Sucesso"
 * ou "Erro inesperado" sem contexto, nunca afirmar entrega de e-mail,
 * pagamento confirmado ou operação concluída sem evidência real (ex.: um
 * convite aceito pelo Supabase não significa que o destinatário recebeu).
 * Erros e avisos importantes exigem fechamento manual; sucesso fecha só
 * depois de 5s (ver `toastStore.ts`/`ToastProvider.tsx`).
 *
 * Não usar para validação de campo de formulário (manter inline, perto do
 * campo) nem para texto meramente informativo — só para o RESULTADO real
 * de uma operação (salvou, falhou, foi aceito pelo servidor).
 */
export const notify = {
  success(title: string, description?: string): void {
    pushToast("success", title, description);
  },
  error(title: string, description?: string): void {
    pushToast("error", title, description);
  },
  warning(title: string, description?: string): void {
    pushToast("warning", title, description);
  },
};
