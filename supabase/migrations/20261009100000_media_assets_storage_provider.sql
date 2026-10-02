-- Migração de mídia para Cloudflare R2 (piloto aprovado, 30/30 arquivos,
-- SHA-256 idêntico, URLs públicas R2 validadas). Menor campo necessário
-- para identificar o provider físico de cada mídia — `storage_path`
-- continua sendo o object key nos dois providers, `public_url` continua
-- sendo o campo que a aplicação lê (nunca monta a URL manualmente).
alter table public.media_assets
  add column storage_provider text not null default 'supabase'
  check (storage_provider in ('supabase', 'r2'));

comment on column public.media_assets.storage_provider is
  'Onde o arquivo físico realmente está hoje: supabase (Storage nativo) ou r2 (Cloudflare R2, migração pós-Fase 49). storage_path é o mesmo object key nos dois; só public_url muda de domínio quando storage_provider=r2.';
