-- Link público individual da cobrança Pix.
-- O token é aleatório e independente do id interno/provider_charge_id.
-- Usado pela página pública de pagamento para exibir QR + Copia e Cola
-- sem abrir dados administrativos ou exigir login no painel.

alter table public.payment_charges
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists payment_charges_public_token_unique
  on public.payment_charges (public_token);

comment on column public.payment_charges.public_token is
  'Token público aleatório usado apenas para abrir a página de pagamento do cliente. Não substitui id interno nem provider_charge_id.';
