-- Aniversariantes — base editorial própria (Fase "persistência preparada").
-- Incremental sobre 20261025100001_clients_fiscal_fields.sql (renomeada de
-- 20261025100000 na reconciliação de migrations — ver relatório da tarefa).
-- NÃO aplicada
-- ainda (regra de trabalho vigente: desenvolver agora, aplicar depois).
--
-- DECISÃO ARQUITETURAL (confirmada com o usuário, repetida nas tarefas de
-- UX/preview): Aniversariantes é uma base editorial SEPARADA de
-- public.clients. Não é CRM familiar genérico — não transforma todo
-- aniversariante num cliente, e os dados editoriais aqui (display_name,
-- birth_date, city, profissão, etc.) são SNAPSHOT/dados próprios do módulo.
-- Editar um aniversariante aqui NUNCA altera public.clients. Excluir aqui
-- (active = false) NUNCA apaga o cadastro mestre.
--
-- VÍNCULOS — dois FKs nullable para public.clients, nomes escolhidos para
-- não serem ambíguos:
--   group_client_id  -> o cadastro PF/PJ que funciona como agrupador/
--                       origem da árvore (o Cristian da família, ou a
--                       Ótica Exemplo Ltda. agrupadora). Nulo quando o
--                       registro é manual e totalmente independente.
--   source_client_id -> quando o PRÓPRIO aniversariante também possui um
--                       clients.id (ex.: o titular PF, cujo principal É o
--                       cadastro; ou uma pessoa relacionada a uma PJ que
--                       também tem cadastro próprio). Nulo para a maioria
--                       dos familiares/pessoas manuais, que não têm
--                       cadastro próprio.
-- Alternativas consideradas e descartadas: "parent_client_id"/"client_id"
-- (ambíguo — não dá pra saber se aponta pro agrupador ou pro próprio
-- aniversariante só pelo nome); "anchor_client_id"/"person_client_id"
-- (menos claro que "group"/"source" sobre QUAL papel cada FK representa).
--
-- on delete RESTRICT em ambos (nunca CASCADE, nunca SET NULL): a regra de
-- domínio de Cadastros é que o cadastro mestre não é fisicamente excluído na
-- operação normal — "Excluir" em Clientes é sempre inativação (status =
-- inactive), nunca DELETE, e public.clients não tem policy de delete. Um
-- DELETE físico só poderia acontecer por uma via administrativa fora da
-- aplicação (ex.: acesso direto ao banco); se isso acontecer e existir
-- algum birthday_entries dependente, RESTRICT bloqueia o DELETE com um erro
-- de integridade referencial claro, em vez de aplicar SET NULL e então
-- estourar a própria CHECK de origin (birthday_entries_origin_link exige
-- source_client_id para origin='cadastro' e group_client_id para
-- origin='familiar' — SET NULL deixaria essas linhas inválidas antes mesmo
-- da constraint rodar, trocando um erro de FK claro por um erro de CHECK
-- confuso no meio da própria operação de delete). RESTRICT/NO ACTION têm o
-- mesmo efeito prático em Postgres quando não há adiamento (deferred) da
-- constraint; usamos RESTRICT por deixar essa intenção explícita no SQL.
-- Em nenhum caso uma FK de Aniversariantes pode apagar public.clients.
--
-- DATA DE ANIVERSÁRIO — NUNCA `date` sozinho. Aniversário é recorrente
-- anualmente e, principalmente para familiares, o ano de nascimento real
-- muitas vezes não é conhecido. Um `date not null` obrigaria a aplicação a
-- inventar um ano (ex.: o ano da edição) só para o banco aceitar a linha —
-- exatamente o que o requisito proíbe. Por isso: `birth_month`/`birth_day`
-- (sempre conhecidos, not null) + `birth_year` (nullable, só quando
-- realmente sabido). A projeção pro ano de uma edição específica (incluindo
-- virada de ano, ex.: a semana 29/12->04/01) é sempre calculada pela
-- APLICAÇÃO a partir de (mês, dia) — nunca armazenada aqui como uma data
-- fixa de um ano específico.
create table public.birthday_entries (
  id uuid primary key default gen_random_uuid(),

  group_client_id uuid references public.clients (id) on delete restrict,
  source_client_id uuid references public.clients (id) on delete restrict,

  origin text not null check (origin in ('cadastro', 'familiar', 'manual')),

  -- Dados editoriais — SNAPSHOT independente de public.clients (ver nota
  -- acima). display_name pode divergir do nome do cadastro de propósito
  -- ("nome para publicação").
  display_name text not null,
  birth_month smallint not null,
  birth_day smallint not null,
  birth_year smallint,
  city text,

  relationship text,
  profession text,
  organization text,
  known_as text,
  message_context text,
  notes text,

  active boolean not null default true,
  publish_in_print boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint birthday_entries_birth_month_range check (birth_month between 1 and 12),
  constraint birthday_entries_birth_day_range check (birth_day between 1 and 31),
  -- Dia válido pro mês informado — fevereiro aceita até 29 aqui (não dá pra
  -- saber se é ano bissexto sem o ano, e o ano é opcional); meses de 30 dias
  -- não aceitam 31. Isto pega erro de digitação grosseiro (ex.: 31/04) sem
  -- exigir o ano.
  constraint birthday_entries_birth_day_valid_for_month check (
    birth_day <= case birth_month
      when 2 then 29
      when 4 then 30
      when 6 then 30
      when 9 then 30
      when 11 then 30
      else 31
    end
  ),
  constraint birthday_entries_birth_year_range check (birth_year is null or birth_year between 1900 and 2100),

  -- Vínculo explícito por origem — mais preciso que "origin != manual exige
  -- algum vínculo": cada origem exige exatamente a FK que a representa.
  --   cadastro  -> a própria pessoa É um clients.id -> source_client_id obrigatório.
  --   familiar  -> pertence a um grupo/cadastro principal -> group_client_id
  --                obrigatório; source_client_id continua opcional (fica
  --                preenchido só se esse familiar também vier a ganhar
  --                cadastro mestre próprio no futuro).
  --   manual    -> pode existir sem vínculo nenhum com clients.
  constraint birthday_entries_origin_link check (
    (origin = 'cadastro' and source_client_id is not null)
    or (origin = 'familiar' and group_client_id is not null)
    or (origin = 'manual')
  )
);

comment on table public.birthday_entries is
  'Base editorial de aniversariantes — separada de public.clients (NÃO é CRM familiar genérico). display_name/birth_month/birth_day/birth_year/city/profession/organization/known_as/message_context/notes são snapshot próprio do módulo; alterar aqui nunca altera clients. "Exclusão" editorial é sempre active = false (soft delete), nunca apaga a linha nem o cadastro mestre associado.';
comment on column public.birthday_entries.group_client_id is
  'Cadastro PF/PJ agrupador da árvore (ex.: o titular da família, ou a empresa agrupadora). Obrigatório quando origin = familiar; nulo em registros manuais totalmente independentes.';
comment on column public.birthday_entries.source_client_id is
  'Obrigatório quando origin = cadastro (a própria pessoa É um clients.id). Opcional para familiar (preenchido só se esse familiar também vier a ter cadastro próprio) e para manual.';
comment on column public.birthday_entries.origin is
  'cadastro: a própria pessoa é um clients.id (source_client_id obrigatório). familiar: membro de um grupo/cadastro principal (group_client_id obrigatório; normalmente sem cadastro próprio). manual: incluído direto no módulo, com ou sem vínculo a um grupo (ex.: pessoa relacionada a uma PJ).';
comment on column public.birthday_entries.display_name is
  'Nome para publicação no jornal — snapshot, pode divergir do nome em clients.';
comment on column public.birthday_entries.birth_month is
  'Mês de nascimento (1-12) — sempre conhecido, sempre obrigatório.';
comment on column public.birthday_entries.birth_day is
  'Dia de nascimento (1-31, validado contra o mês) — sempre conhecido, sempre obrigatório.';
comment on column public.birthday_entries.birth_year is
  'Ano de nascimento — OPCIONAL. Muitos familiares têm dia/mês conhecidos mas ano desconhecido; o sistema nunca inventa um ano só para preencher esta coluna. A projeção do aniversário para o ano de uma edição específica (Semana do Jornal), inclusive em semanas que atravessam virada de ano (ex.: 29/12->04/01), é sempre calculada pela aplicação a partir de (birth_month, birth_day) — nunca a partir desta coluna.';
comment on column public.birthday_entries.profession is
  'Profissão/atividade em texto livre, como o usuário quer que apareça na mensagem (ex.: "Empresária") — nunca inferida automaticamente. Opcional.';
comment on column public.birthday_entries.organization is
  'Empresa/entidade citada ocasionalmente na mensagem editorial. Não é o CNPJ/cadastro fiscal da PJ (isso fica em clients, se houver). Opcional.';
comment on column public.birthday_entries.known_as is
  'Apelido/como é conhecido — usado com moderação pelo gerador de mensagens, nunca substitui display_name. Opcional.';
comment on column public.birthday_entries.message_context is
  'Notas livres opcionais para ajudar a geração da mensagem (ex.: "integrante da Associação Comercial"). A aplicação só usa isto quando reconhece um padrão seguro — nunca interpreta livremente nem persiste a mensagem aqui (ver public.birthday_edition_messages).';
comment on column public.birthday_entries.active is
  'false = removido da base editorial ("Excluir" no módulo). Nunca hard delete, e nunca afeta public.clients.';

create index birthday_entries_group_client_id_idx on public.birthday_entries (group_client_id) where group_client_id is not null;
create index birthday_entries_source_client_id_idx on public.birthday_entries (source_client_id) where source_client_id is not null;
create index birthday_entries_active_idx on public.birthday_entries (active);
create index birthday_entries_publish_in_print_idx on public.birthday_entries (publish_in_print) where publish_in_print;
create index birthday_entries_created_at_idx on public.birthday_entries (created_at desc);
-- Mês/dia do aniversário é o filtro mais comum da tela (período, semana do
-- jornal, calendário) — índice direto nas colunas (sem extract(), já que
-- birth_month/birth_day não são mais derivadas de uma data completa).
create index birthday_entries_birth_month_day_idx on public.birthday_entries (birth_month, birth_day);

create trigger birthday_entries_set_updated_at
  before update on public.birthday_entries
  for each row
  execute function public.set_updated_at();

create or replace function public.set_birthday_entry_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.set_birthday_entry_actor() is
  'created_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente, mesmo princípio de set_client_actor()/set_media_asset_actor().';

create trigger birthday_entries_set_actor
  before insert on public.birthday_entries
  for each row
  execute function public.set_birthday_entry_actor();

alter table public.birthday_entries enable row level security;

-- Mesmo padrão de permissão de conteúdo editorial usado por articles/
-- editorial_sections/clients: is_active_staff() (owner/admin/operator).
-- Nenhuma policy nova inventada.
create policy birthday_entries_select_staff
  on public.birthday_entries for select
  to authenticated
  using (public.is_active_staff());

create policy birthday_entries_insert_staff
  on public.birthday_entries for insert
  to authenticated
  with check (public.is_active_staff());

create policy birthday_entries_update_staff
  on public.birthday_entries for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — "Excluir"/"Excluir grupo" no módulo é sempre
-- active = false (soft delete), mesmo princípio de clients/nfse_service_profiles.
