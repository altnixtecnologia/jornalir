-- Expande "forma de liquidação" (payment_method) de receivable_receipts —
-- Fase "Formas de liquidação / Pix / envio ao cliente". Incremental sobre
-- 20261026100000_subscription_assinante_role.sql. NÃO aplicada ainda.
--
-- NÃO renomeia nem recria a tabela (20261017100000_financeiro_contas_a_receber.sql
-- continua intocada) — só substitui o check constraint inline (sem nome
-- próprio, então o Postgres gerou o nome padrão
-- `receivable_receipts_payment_method_check`) por um check NOMEADO com o
-- conjunto de valores ampliado.
--
-- Conjunto novo (oferecido pra NOVOS lançamentos): cash, pix, bank_transfer,
-- check (já existiam) + credit_card, debit_card (substituem o genérico
-- "card" — a UI agora precisa diferenciar crédito/débito) + boleto, trade
-- (permuta), bailment (comodato) + other. "pix"/"boleto" ficam em
-- português por serem nomes próprios de instrumentos brasileiros (mesmo
-- critério já usado pra "pix" desde a migration original) — os demais
-- seguem valores normalizados em inglês, mesmo padrão do resto do projeto.
--
-- "trade"/"bailment" são liquidações NÃO monetárias (permuta/comodato) —
-- reduzem o saldo do título exatamente como qualquer outro receipt
-- (nenhuma tabela/coluna nova necessária: o modelo de múltiplos
-- recebimentos parciais já existente em receivable_receipts já suporta
-- isto, só precisava do valor no enum). A aplicação exibe isso
-- explicitamente no histórico (label "Permuta"/"Comodato"), nunca como
-- "pagamento" genérico.
--
-- LEGADO 'card': o Supabase remoto está 402 — NÃO SABEMOS se existem
-- receipts históricos reais com payment_method='card'. Por isso 'card'
-- CONTINUA aceito pelo check (nunca convertido automaticamente pra
-- credit_card/debit_card — não há como saber qual dos dois era o
-- pagamento original sem auditar caso a caso). A aplicação NÃO oferece
-- 'card' em formulários de nova baixa (ver PAYMENT_METHODS vs
-- ALL_PAYMENT_METHODS em @ir/types) — só exibe registros antigos como
-- "Cartão (legado)" e continua permitindo filtrar relatórios por esse
-- valor. Plano para quando o Supabase voltar: 1) contar quantos receipts
-- usam 'card'; 2) corrigir individualmente pra credit_card/debit_card
-- quando for possível determinar qual foi; 3) só depois considerar
-- remover 'card' do check numa migration futura.
alter table public.receivable_receipts
  drop constraint receivable_receipts_payment_method_check;

alter table public.receivable_receipts
  add constraint receivable_receipts_payment_method_values
    check (payment_method in (
      'cash', 'pix', 'bank_transfer', 'check',
      'credit_card', 'debit_card', 'boleto', 'trade', 'bailment',
      'other',
      'card' -- legado — ver nota acima; não oferecido em novos lançamentos
    ));

comment on column public.receivable_receipts.payment_method is
  'Forma de liquidação (rótulo da UI) — nem toda liquidação é dinheiro entrando: trade (permuta) e bailment (comodato) reduzem o saldo do título como qualquer recebimento, mas são liquidações não monetárias e aparecem identificadas como tal no histórico. "card" é um valor LEGADO (genérico, pré-crédito/débito separado) mantido só por compatibilidade com registros históricos eventualmente existentes no remoto — nunca oferecido em novos lançamentos; auditar e migrar individualmente para credit_card/debit_card quando o Supabase remoto voltar.';
