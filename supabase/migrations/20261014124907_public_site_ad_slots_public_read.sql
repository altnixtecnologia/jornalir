alter view public.public_site_ad_slots set (security_invoker = false);
comment on view public.public_site_ad_slots is 'Somente configuracoes publicas das seis posicoes; a view nao expoe IDs internos ou dados de clientes.';
