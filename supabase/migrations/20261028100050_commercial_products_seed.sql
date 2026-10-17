-- Seed de public.commercial_products — EXTRAÍDO de DOIS arquivos em
-- 17/10/2026 (preparação de publicação), conteúdo idêntico, só a posição
-- mudou: o seed precisa rodar DEPOIS que commercial_products existe
-- (20261028100000_comercial_publicidade.sql).
--   1) 20261012195906_site_interest_requests.sql (16 dias antes da tabela
--      existir) — bloco "Jornal impresso"/"Painéis LED" combinado.
--   2) 20261012223715_assine_requests_and_billing_provider.sql (mesmo
--      problema) — bloco "Painel LED" individual por cidade, logo abaixo.
-- Um fresh install (`supabase start` do zero) falhava com "relation
-- public.commercial_products does not exist" nos dois pontos. Mesmo
-- princípio de idempotência dos blocos originais (`where not exists`) —
-- nunca duplica produtos se já existirem (inclusive no banco remoto, onde
-- esses produtos já foram inseridos há tempos por uma ordem de aplicação
-- real diferente da ordem de nome de arquivo atual).
insert into public.commercial_products (name, channel, description, suggested_price)
select 'Jornal impresso — Cartão de visita', 'newspaper',
       'Publicidade colorida em formato cartão de visita. Medida/posição final sujeita à avaliação do setor comercial.', 130.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Jornal impresso — Cartão de visita'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Jornal impresso — Padrão', 'newspaper',
       'Publicidade colorida em formato padrão. Medida/posição final sujeita à avaliação do setor comercial.', 180.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Jornal impresso — Padrão'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Jornal impresso — 1/4 de página', 'newspaper',
       'Publicidade colorida em 1/4 de página. Posição final sujeita à avaliação do setor comercial.', 350.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Jornal impresso — 1/4 de página'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Jornal impresso — Meia página', 'newspaper',
       'Publicidade colorida em meia página. Posição final sujeita à avaliação do setor comercial.', 700.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Jornal impresso — Meia página'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Jornal impresso — Página inteira', 'newspaper',
       'Publicidade colorida em página inteira. Posição final sujeita à avaliação do setor comercial.', 1200.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Jornal impresso — Página inteira'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Painéis LED — São João do Sul + Praia Grande + Passo de Torres', 'led_panel',
       'Divulgação nos 3 painéis de LED 1x2 m. Período, frequência e disponibilidade sujeitos à avaliação do setor comercial.', 800.00
where not exists (select 1 from public.commercial_products where lower(name) = lower('Painéis LED — São João do Sul + Praia Grande + Passo de Torres'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Painel LED 1x2 m — São João do Sul', 'led_panel',
       'Divulgação no painel 1x2 m de São João do Sul. Período, frequência e disponibilidade sujeitos à avaliação comercial.', 0
where not exists (select 1 from public.commercial_products where lower(name)=lower('Painel LED 1x2 m — São João do Sul'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Painel LED 1x2 m — Praia Grande', 'led_panel',
       'Divulgação no painel 1x2 m de Praia Grande/SC. Período, frequência e disponibilidade sujeitos à avaliação comercial.', 0
where not exists (select 1 from public.commercial_products where lower(name)=lower('Painel LED 1x2 m — Praia Grande'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Painel LED 1x2 m — Passo de Torres', 'led_panel',
       'Divulgação no painel 1x2 m de Passo de Torres/SC. Período, frequência e disponibilidade sujeitos à avaliação comercial.', 0
where not exists (select 1 from public.commercial_products where lower(name)=lower('Painel LED 1x2 m — Passo de Torres'));

insert into public.commercial_products (name, channel, description, suggested_price)
select 'Painel LED 4x2 m — Entrada de São João do Sul', 'led_panel',
       'Divulgação no painel grande 4x2 m na entrada de São João do Sul. Período, frequência e disponibilidade sujeitos à avaliação comercial.', 0
where not exists (select 1 from public.commercial_products where lower(name)=lower('Painel LED 4x2 m — Entrada de São João do Sul'));
