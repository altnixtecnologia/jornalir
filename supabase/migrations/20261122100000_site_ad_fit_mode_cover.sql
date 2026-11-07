-- Patrocinadores do site: formato individual por imagem com 3 opções
-- (decisão do usuário 07/11/2026):
--   stretch = Esticar (padrão)  · ocupa 100% do quadro, pode deformar;
--   contain = Encaixar          · imagem inteira, pode sobrar borda;
--   cover   = Preencher (novo)  · 100% do quadro sem deformar, pode cortar.
--
-- Incremental: NÃO altera migrations já aplicadas
-- (20261014015734, 20261029100210, 20261029101300).
--
-- Padrão efetivo: o banco guardava 'contain' nas 6 posições (e null nas
-- imagens), mas o site sempre exibiu ESTICADO porque uma regra global de
-- CSS (.ad-slot-img { object-fit: fill }) ignorava o valor. Como o site
-- passa a respeitar o formato de cada imagem, o padrão das posições vira
-- 'stretch' para preservar exatamente o que o leitor já vê. Nenhuma linha
-- de site_ad_media é alterada (fit_mode null continua herdando da posição);
-- nenhuma imagem, arquivo ou view é modificado — a view
-- public_site_ad_media já resolve coalesce(m.fit_mode, s.fit_mode).

alter table public.site_ad_slots
  drop constraint if exists site_ad_slots_fit_mode_check,
  add constraint site_ad_slots_fit_mode_check
    check (fit_mode in ('stretch', 'contain', 'cover'));

alter table public.site_ad_media
  drop constraint if exists site_ad_media_fit_mode_check,
  add constraint site_ad_media_fit_mode_check
    check (fit_mode is null or fit_mode in ('stretch', 'contain', 'cover'));

alter table public.site_ad_slots
  alter column fit_mode set default 'stretch';

update public.site_ad_slots
set fit_mode = 'stretch'
where fit_mode = 'contain';

comment on column public.site_ad_slots.fit_mode is
  'Formato padrão das imagens desta posição sem formato próprio: stretch (Esticar, padrão), contain (Encaixar) ou cover (Preencher).';
comment on column public.site_ad_media.fit_mode is
  'Formato individual desta imagem: stretch (Esticar), contain (Encaixar) ou cover (Preencher); null usa o padrão da posição (site_ad_slots.fit_mode).';
