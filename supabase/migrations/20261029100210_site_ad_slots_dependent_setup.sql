-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Consolida 4 migrations que já existem (protegidas por
-- guarda to_regclass) e já estão aplicadas no remoto sob seus nomes
-- exatos, mas cujo timestamp é ANTERIOR a 20261029100200_site_ad_slots.sql
-- (que cria site_ad_slots/site_ad_media/site_ad_settings, aplicada
-- imediatamente antes desta):
--   20261014015734_site_ads_per_slot_rotation.sql
--   20261014022359_public_site_ad_slots_transition.sql
--   20261014124630_site_ads_managed_slot_persistence.sql
--   20261014124907_public_site_ad_slots_public_read.sql
-- Conteúdo idêntico ao de cada um, só reunido e reposicionado. Idempotente.

-- (1) 20261014015734 — rotação/efeito/formato por posição + view de mídia pública.
--
-- ATENÇÃO DE SEGURANÇA (verificação pré-aplicação, 17/10/2026): o arquivo
-- original fazia, depois do ADD COLUMN, um UPDATE incondicional copiando
-- o valor de public.site_ad_settings (singleton global) para TODAS as 6
-- posições — um backfill histórico de UMA VEZ só, da época em que esta
-- configuração era só global. Reaplicar esse UPDATE agora sobrescreveria
-- qualquer customização por posição feita depois pelo painel
-- (SiteAdSlotsPanel.tsx já permite tempo/efeito/formato próprios por
-- posição). Confirmado por amostragem de dados reais (restauração de
-- teste do backup de 17/10/2026): as 6 posições já têm
-- rotation_interval_ms/transition_effect/fit_mode preenchidos — o
-- backfill histórico (ou o próprio DEFAULT da coluna) já aconteceu.
-- Por isso o UPDATE foi retirado desta migration de reconciliação — só o
-- ADD COLUMN (idempotente, nunca sobrescreve valor existente) permanece.
alter table public.site_ad_slots
  add column if not exists rotation_interval_ms integer not null default 10000,
  add column if not exists transition_effect text not null default 'fade',
  add column if not exists fit_mode text not null default 'contain';

alter table public.site_ad_slots
  drop constraint if exists site_ad_slots_rotation_interval_ms_check,
  add constraint site_ad_slots_rotation_interval_ms_check
    check (rotation_interval_ms between 2000 and 120000),
  drop constraint if exists site_ad_slots_transition_effect_check,
  add constraint site_ad_slots_transition_effect_check
    check (transition_effect in ('none','fade','slide-left','slide-up','zoom-in','crossfade')),
  drop constraint if exists site_ad_slots_fit_mode_check,
  add constraint site_ad_slots_fit_mode_check
    check (fit_mode in ('contain','stretch'));

comment on column public.site_ad_slots.rotation_interval_ms is
  'Tempo de exibição de cada arte nesta posição antes de avançar para a próxima.';
comment on column public.site_ad_slots.transition_effect is
  'Efeito usado nesta posição ao trocar de arte.';
comment on column public.site_ad_slots.fit_mode is
  'contain mantém a proporção dentro do quadro; stretch estica a arte para preencher o quadro.';

create or replace view public.public_site_ad_media as
  select
    s.slot_number,
    m.id,
    ma.public_url as image_url,
    coalesce(m.alt_text, ma.alt_text) as alt_text,
    m.href,
    m.sort_order,
    s.rotation_interval_ms,
    s.transition_effect,
    s.fit_mode
  from public.site_ad_media m
  join public.site_ad_slots s on s.id = m.slot_id and s.active = true
  join public.media_assets ma on ma.id = m.media_asset_id
  where m.active = true
    and (m.active_from is null or m.active_from <= current_date)
    and (m.active_until is null or m.active_until >= current_date)
  order by s.slot_number, m.sort_order;

grant select on public.public_site_ad_media to anon, authenticated;

-- (2) 20261014022359 — PULADA de propósito nesta migration de reconciliação.
-- O arquivo original criava public_site_ad_slots com 6 colunas (sem
-- managed_by_panel); essa versão foi substituída pela de 7 colunas do
-- passo (3) já na execução histórica real (confirmado via backup
-- estrutural de 17/10/2026: a view no remoto já tem managed_by_panel).
-- CREATE OR REPLACE VIEW nunca pode remover uma coluna de saída já
-- existente — recriar a versão de 6 colunas aqui falharia com "cannot
-- drop columns from view" contra o estado real. Ir direto à versão final
-- do passo (3) é o comportamento correto tanto no remoto real quanto num
-- fresh install (que nunca precisa passar pela versão intermediária).

-- (3) 20261014124630 — managed_by_panel + view final (inclui o que seria o passo 2).
alter table public.site_ad_slots add column if not exists managed_by_panel boolean not null default false;
update public.site_ad_slots s set managed_by_panel = true where exists (select 1 from public.site_ad_media m where m.slot_id=s.id);

create or replace function public.mark_site_ad_slot_managed() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.site_ad_slots set managed_by_panel = true where id = new.slot_id;
  return new;
end; $$;

drop trigger if exists trg_site_ad_slot_managed on public.site_ad_media;
create trigger trg_site_ad_slot_managed after insert on public.site_ad_media for each row execute function public.mark_site_ad_slot_managed();

create or replace view public.public_site_ad_slots with (security_invoker = true) as
select s.slot_number, s.active, s.rotation_interval_ms, s.transition_effect, s.fit_mode,
exists (select 1 from public.site_ad_media m where m.slot_id = s.id) as has_media,
s.managed_by_panel
from public.site_ad_slots s order by s.slot_number;

grant select on public.public_site_ad_slots to anon, authenticated;

-- (4) 20261014124907 — ajuste final de segurança da view (security_invoker = false).
alter view public.public_site_ad_slots set (security_invoker = false);
comment on view public.public_site_ad_slots is 'Somente configuracoes publicas das seis posicoes; a view nao expoe IDs internos ou dados de clientes.';
