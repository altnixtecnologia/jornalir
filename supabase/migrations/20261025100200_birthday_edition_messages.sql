-- Mensagem editorial de aniversário POR EDIÇÃO (Semana do Jornal). Incremental
-- sobre 20261025100100_birthday_entries.sql. NÃO aplicada ainda.
--
-- DECISÃO: a mensagem NÃO pertence permanentemente ao aniversariante — ela
-- pertence à edição (a semana quinta->quarta em que foi gerada). Por isso
-- fica numa tabela própria, nunca numa coluna de texto em
-- public.birthday_entries. Trocar de semana troca de edição; "Trocar
-- mensagem" faz UPDATE desta linha, nunca cria uma mensagem nova pendurada
-- em birthday_entries.
--
-- Sem Destaque, sem edição manual de texto, sem metadados do mecanismo
-- interno do gerador (ex.: seed/tentativa) — decisão final do módulo
-- removeu essas funcionalidades. family/opening/ending são persistidos
-- porque são o mínimo necessário pra o gerador continuar evitando repetição
-- estrutural ao reabrir a edição (sem eles, teria que reinterpretar o texto
-- livre pra saber "que tipo" de mensagem já foi usado).

create table public.birthday_edition_messages (
  id uuid primary key default gen_random_uuid(),

  birthday_entry_id uuid not null references public.birthday_entries (id) on delete cascade,

  -- Semana editorial quinta->quarta — ambas as datas guardadas explicitamente
  -- (evita recalcular "fim = início + 6" em toda consulta) mas a consistência
  -- é garantida por constraint abaixo.
  edition_week_start date not null,
  edition_week_end date not null,

  message text not null,
  family text not null,
  opening text not null,
  ending text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Uma mensagem por aniversariante por edição — "Trocar mensagem" dá
  -- UPDATE nesta linha (via upsert na chave abaixo), nunca insere uma
  -- segunda linha para a mesma pessoa na mesma semana.
  constraint birthday_edition_messages_unique_per_entry_week unique (birthday_entry_id, edition_week_start),

  -- Trava a regra "quinta->quarta" no banco, não só na aplicação: início
  -- sempre quinta-feira (dow = 4), fim sempre início + 6 dias.
  constraint birthday_edition_messages_week_is_thursday check (extract(dow from edition_week_start) = 4),
  constraint birthday_edition_messages_week_length check (edition_week_end = edition_week_start + 6)
);

comment on table public.birthday_edition_messages is
  'Mensagem editorial gerada para um aniversariante numa Semana do Jornal (quinta->quarta) específica. A mensagem pertence à EDIÇÃO, não ao aniversariante — reabrir a mesma semana devolve a mesma mensagem (estabilidade); "Trocar mensagem" sobrescreve esta linha. Sem destaque, sem edição manual, sem metadados do mecanismo interno do gerador além de family/opening/ending (mínimo necessário para evitar repetição estrutural ao reabrir a edição).';
comment on column public.birthday_edition_messages.edition_week_start is
  'Quinta-feira que inicia a Semana do Jornal desta mensagem (chave da edição, junto com birthday_entry_id).';
comment on column public.birthday_edition_messages.family is
  'Família estrutural do template usado (ex.: "plain", "city_leads", "profession_org") — usada só para o gerador priorizar variedade ao reabrir a edição ou trocar a mensagem, nunca exibida ao usuário.';

create index birthday_edition_messages_entry_id_idx on public.birthday_edition_messages (birthday_entry_id);
create index birthday_edition_messages_week_start_idx on public.birthday_edition_messages (edition_week_start);

create trigger birthday_edition_messages_set_updated_at
  before update on public.birthday_edition_messages
  for each row
  execute function public.set_updated_at();

alter table public.birthday_edition_messages enable row level security;

create policy birthday_edition_messages_select_staff
  on public.birthday_edition_messages for select
  to authenticated
  using (public.is_active_staff());

create policy birthday_edition_messages_insert_staff
  on public.birthday_edition_messages for insert
  to authenticated
  with check (public.is_active_staff());

create policy birthday_edition_messages_update_staff
  on public.birthday_edition_messages for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio do restante do projeto; uma
-- mensagem substituída é sempre UPDATE, nunca DELETE+INSERT.
