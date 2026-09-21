-- Fase 17 — fundação real do banco JornalIR (IR Core / site-system-ir).
-- Extensões e funções auxiliares reaproveitadas pelas migrations seguintes.

create extension if not exists pgcrypto with schema public;

-- Mantém updated_at sempre correto sem depender de cada UPDATE lembrar de setá-lo.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: atualiza updated_at automaticamente em qualquer tabela que a aplique.';
