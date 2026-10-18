-- Biblioteca de modelos de mensagem de aniversário GERENCIÁVEL pelo
-- administrador — pedido explícito do usuário em 17/10/2026 ("Ver modelos"
-- com gerenciamento, edição e inclusão). NÃO aplicada ainda (local apenas,
-- regra de trabalho vigente: desenvolver agora, aplicar depois).
--
-- DECISÃO: os 44 modelos originais de messageGenerator.ts PERMANECEM
-- hardcoded no código (nunca migrados para esta tabela) — são a biblioteca
-- "de fábrica", sempre disponíveis, nunca editáveis (preserva o
-- comportamento/testes existentes). Esta tabela guarda só modelos
-- ADICIONAIS criados pelo administrador pela tela "Ver modelos" — um
-- reforço à biblioteca, não uma substituição.
--
-- `body` usa os mesmos placeholders de messageGenerator.ts por nome
-- ({{name}}, {{city}}, {{profession}}, {{organization}}, {{knownAs}},
-- {{editorialPhrase}}, {{dateLabel}}) — a aplicação faz a substituição
-- (nunca `eval`/template engine arbitrário). As colunas needs_* dizem quais
-- campos este modelo exige para ficar elegível, mesmo princípio de
-- TemplateNeeds em messageGenerator.ts.
create table if not exists public.birthday_message_templates (
  id uuid primary key default gen_random_uuid(),

  family text not null default 'custom',
  body text not null,

  needs_city boolean not null default false,
  needs_profession boolean not null default false,
  needs_organization boolean not null default false,
  needs_known_as boolean not null default false,
  needs_editorial_phrase boolean not null default false,

  active boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint birthday_message_templates_body_not_blank check (length(trim(body)) > 0)
);

comment on table public.birthday_message_templates is
  'Modelos de mensagem de aniversário ADICIONAIS ao conjunto original de 44 templates hardcoded em messageGenerator.ts. Gerenciados pelo administrador na tela "Ver modelos" (criar/editar) — nunca substituem ou alteram os 44 modelos originais.';
comment on column public.birthday_message_templates.body is
  'Texto do modelo com placeholders {{name}}/{{city}}/{{profession}}/{{organization}}/{{knownAs}}/{{editorialPhrase}}/{{dateLabel}} — substituição literal de texto, nunca um template engine arbitrário.';
comment on column public.birthday_message_templates.active is
  'false = removido da biblioteca sem apagar o histórico (soft delete), mesmo princípio de birthday_entries.active.';

create index if not exists birthday_message_templates_active_idx
  on public.birthday_message_templates (active) where active;

do $$ begin
  if to_regclass('public.birthday_message_templates') is not null
     and to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists birthday_message_templates_set_updated_at on public.birthday_message_templates;
    create trigger birthday_message_templates_set_updated_at
      before update on public.birthday_message_templates
      for each row
      execute function public.set_updated_at();
  end if;
end $$;

alter table public.birthday_message_templates enable row level security;

-- Leitura: toda a equipe ativa (mesmo padrão de birthday_entries) — qualquer
-- operador com acesso ao módulo precisa ver os modelos disponíveis ao
-- escolher uma homenagem.
drop policy if exists birthday_message_templates_select_staff on public.birthday_message_templates;
create policy birthday_message_templates_select_staff
  on public.birthday_message_templates for select
  to authenticated
  using (public.is_active_staff());

-- Escrita (criar/editar modelos): só admin/owner, por pedido explícito do
-- usuário ("persistindo alterações com permissão administrativa").
drop policy if exists birthday_message_templates_insert_admin on public.birthday_message_templates;
create policy birthday_message_templates_insert_admin
  on public.birthday_message_templates for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

drop policy if exists birthday_message_templates_update_admin on public.birthday_message_templates;
create policy birthday_message_templates_update_admin
  on public.birthday_message_templates for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- Sem policy de delete — "remover" um modelo é sempre active = false
-- (soft delete), mesmo princípio do restante do projeto.
