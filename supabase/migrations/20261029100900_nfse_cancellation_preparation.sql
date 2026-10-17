-- Item 5, Lote 2, Tarefa 5: preparação do cancelamento de NFS-e.
-- NÃO aplicada ainda. NÃO executa cancelamento real — este módulo só
-- REGISTRA a solicitação (motivo/justificativa, histórico, resultado)
-- localmente. O envio real do evento de cancelamento ao Sistema
-- Nacional permanece bloqueado (ver CancellationSubmissionNotReadyError
-- em cancellation-service.ts) até homologação completa.
--
-- CÓDIGO DO EVENTO (nunca inventado): "e101101 - Cancelamento de NFS-e"
-- é o código oficial confirmado diretamente no XSD vendorizado deste
-- projeto (tiposEventos_v1.01.xsd, TE101101) — a fonte mais
-- autoritativa disponível (schema oficial, não um resumo de terceiro).
-- O mesmo schema define os únicos 2 campos do evento de cancelamento:
-- cMotivo (TSCodJustCanc: 1=Erro na Emissão, 2=Serviço não Prestado,
-- 9=Outros) e xMotivo (TSMotivo: texto livre, 15 a 255 caracteres) —
-- os únicos valores usados abaixo, nenhum outro código/prazo/regra
-- municipal foi presumido.
create table if not exists public.nfse_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  issued_note_id uuid not null references public.nfse_issued_notes(id) on delete restrict,
  justification_code smallint not null check (justification_code in (1, 2, 9)),
  justification_text text not null check (length(justification_text) between 15 and 255),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'rejected', 'uncertain')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  response_summary text,
  rejection_code text,
  rejection_message text,
  created_at timestamptz not null default now()
);

-- Evita cancelamentos repetidos: só pode existir UMA solicitação ativa
-- (pending/submitted/confirmed) por nota autorizada ao mesmo tempo.
-- Uma solicitação 'rejected'/'uncertain' NÃO conta — o operador pode
-- registrar uma NOVA tentativa (linha nova, histórico sempre
-- preservado, nunca sobrescrito — mesmo princípio de
-- nfse_transmission_attempts: append-only).
create unique index if not exists idx_nfse_cancellation_one_active_per_note
  on public.nfse_cancellation_requests(issued_note_id)
  where status in ('pending', 'submitted', 'confirmed');

create index if not exists idx_nfse_cancellation_note
  on public.nfse_cancellation_requests(issued_note_id, created_at desc);

alter table public.nfse_cancellation_requests enable row level security;
revoke all on table public.nfse_cancellation_requests from public, anon, authenticated;
grant select, insert, update on table public.nfse_cancellation_requests to service_role;

comment on table public.nfse_cancellation_requests is
  'Preparação do cancelamento de NFS-e (Item 5, Lote 2, Tarefa 5) — registra motivo/justificativa e histórico de solicitações/resultados. NUNCA executa o cancelamento real (sem homologação completa, ver cancellation-service.ts); status fica pending até essa decisão.';
comment on column public.nfse_cancellation_requests.justification_code is
  'Código oficial TSCodJustCanc do XSD vendorizado (tiposSimples_v1.01.xsd): 1=Erro na Emissão, 2=Serviço não Prestado, 9=Outros. Nunca um valor inventado.';
comment on column public.nfse_cancellation_requests.status is
  'pending = preparado localmente, nunca enviado. submitted/confirmed/rejected/uncertain só existiriam depois de uma submissão real ao Sistema Nacional — indisponível nesta fase (ver CancellationSubmissionNotReadyError).';
