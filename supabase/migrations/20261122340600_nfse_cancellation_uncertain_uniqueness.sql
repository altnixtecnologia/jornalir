-- NFS-e: resultado incerto de cancelamento nunca libera nova solicitacao.
-- A API pode ter registrado o evento mesmo apos timeout. Uma segunda
-- solicitacao antes da conciliacao seria duplicidade fiscal.
-- Migration preparada para banco ISOLADO; NUNCA aplicada na producao
-- sem backup/revisao/consentimento.
--
-- A constraint anterior cobria pending, submitted, confirmed, mas NAO
-- uncertain. Revisar previamente linhas historicas conflitantes; falhar
-- com unique_violation se existirem, sem apagar dados automaticamente.

drop index if exists public.idx_nfse_cancellation_one_active_per_note;
create unique index idx_nfse_cancellation_one_active_per_note
on public.nfse_cancellation_requests (issued_note_id)
where status in ('pending', 'submitted', 'confirmed', 'uncertain');

comment on index public.idx_nfse_cancellation_one_active_per_note
is 'Impede segundo pedido enquanto o cancelamento estiver pendente, enviado, incerto ou confirmado; so rejeicao definitiva permite novo pedido.';

-- O modelo anterior considerava uncertain inativo na UI/repository;
-- corrigidos juntos para garantir a mesma semantica em todas as camadas.
