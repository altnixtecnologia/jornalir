-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato e depende de
-- public.payment_charges (só existe a partir de
-- 20261027100100_payment_charges.sql, 14 dias depois). Alteração real
-- para fresh install em 20261027100130_payment_charge_public_token.sql
-- (nova, depois de payment_charges existir). Idempotente.
do $$
begin
  if to_regclass('public.payment_charges') is not null then
    alter table public.payment_charges
      add column if not exists public_token uuid not null default gen_random_uuid();

    create unique index if not exists payment_charges_public_token_unique
      on public.payment_charges (public_token);

    comment on column public.payment_charges.public_token is
      'Token público aleatório usado apenas para abrir a página de pagamento do cliente. Não substitui id interno nem provider_charge_id.';
  end if;
end $$;
