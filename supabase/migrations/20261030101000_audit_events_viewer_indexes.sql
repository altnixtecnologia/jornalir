-- Índices de apoio para a tela /sistema/configuracoes/auditoria (18/10/2026).
-- Puramente aditivo: nenhuma mudança de RLS, de coluna ou de dado — só
-- acelera os filtros reais usados por listAuditEventsAdminPageSupabase
-- para consultas eficientes em grande volume, como pedido pelo usuário.
--
-- PENDENTE DE APLICAÇÃO: preparada e versionada, não executada no Supabase
-- remoto nesta etapa.

-- Filtro "Módulo (entidade)" sozinho (o índice original
-- audit_events_entity_idx é composto com entity_id e não cobre bem uma
-- busca só por entity_type).
create index if not exists audit_events_entity_type_idx on public.audit_events (entity_type);

-- Filtro "Usuário"/"Origem" e o join com profiles na tela.
create index if not exists audit_events_user_id_idx on public.audit_events (user_id);

-- Filtros "Origem" (joir/cron/trigger) e "Resultado" (falha/ignorado) —
-- ambos leem a mesma chave de metadata repetidamente.
create index if not exists audit_events_metadata_origin_idx on public.audit_events ((metadata ->> 'origin'));
create index if not exists audit_events_metadata_result_idx on public.audit_events ((metadata ->> 'result'));
