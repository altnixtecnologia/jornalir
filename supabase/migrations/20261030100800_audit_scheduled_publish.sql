-- Auditoria dos eventos de agendador/serviço (18/10/2026) — item explícito
-- do pedido do usuário: "Eventos importantes de integrações, agendadores e
-- serviços" precisam aparecer em public.audit_events, reaproveitando a
-- estrutura já existente (Fase P), sem criar um sistema paralelo.
--
-- PENDENTE DE APLICAÇÃO: preparada e versionada, não executada no Supabase
-- remoto nesta etapa (aguardando autorização separada).
--
-- public.publish_due_scheduled_articles() é o job pg_cron
-- (`publish-due-scheduled-articles`, a cada minuto, criado em
-- 20260930100000_public_content_and_scheduling.sql, já aplicado em
-- produção) que publica matérias agendadas cujo horário chegou. Hoje ele
-- muda o status no banco mas não deixa nenhum rastro em audit_events —
-- diferente da publicação manual (agora auditada em
-- apps/sistema/.../editorial/materias/actions.ts). Esta migration só
-- troca o CORPO da função (mesmo nome, mesma assinatura, mesmo job
-- cron.schedule já agendado — não precisa recriar o agendamento) para
-- também registrar cada publicação automática.
--
-- user_id = null identifica uma ação do sistema (agendador), não de uma
-- pessoa logada — consistente com o mesmo padrão usado em
-- queue_article_push_on_publish (20261030100600).

create or replace function public.publish_due_scheduled_articles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, title from public.articles
    where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
  loop
    update public.articles
    set status = 'published', published_at = scheduled_at
    where id = r.id;

    update public.article_placements
    set active = true
    where article_id = r.id and active = true;

    insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
    values (
      null, 'articles', r.id, 'publish',
      jsonb_build_object(
        'title', left(r.title, 140),
        'statusChange', 'Agendado → Publicado',
        'origin', 'cron:publish-due-scheduled-articles'
      )
    );
  end loop;
end;
$$;

comment on function public.publish_due_scheduled_articles() is
  'Job do pg_cron (publish-due-scheduled-articles, a cada minuto): publica matérias scheduled cujo horário chegou e reativa o placement. Registra cada publicação automática em audit_events (user_id null = ação do agendador, não de uma pessoa) — 18/10/2026.';
