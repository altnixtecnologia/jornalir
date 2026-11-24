-- Botão Limpar no portal: ocultação por token de dispositivo, nunca exclui eventos do jornal.
-- Usa o mesmo management_hash de site_notification_reads, sem cadastro paralelo.
begin;
alter table public.site_notification_reads
  add column if not exists dismissed_at timestamptz;
comment on column public.site_notification_reads.dismissed_at is
  'Ocultado apenas neste dispositivo (management_hash). Eventos gerais continuam intactos.';
commit;
