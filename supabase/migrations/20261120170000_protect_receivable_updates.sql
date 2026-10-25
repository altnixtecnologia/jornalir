-- Títulos: impedir PATCH direto de status/valor por PostgREST.
-- Somente Server Actions com checkFinanceAction persistem mudanças por
-- service_role; RPCs de crédito/recebimentos fazem UPDATE pelo owner.
drop policy if exists receivables_update_staff on public.receivables;
revoke update on public.receivables from public,anon,authenticated;
grant update on public.receivables to service_role;

-- Ao criar um título via API autenticada, o status inicial é SEMPRE open.
-- Nenhum operador consegue declarar uma dívida paga sem receipt/ajuste.
create function public.guard_receivable_insert_status()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if current_user='authenticated' and new.status is distinct from 'open' then
   raise exception 'Título deve iniciar em aberto; pagamento exige confirmação financeira.' using errcode='42501';
 end if;
 return new;
end;
$fn$;
create trigger guard_receivable_insert_status
 before insert on public.receivables
 for each row execute function public.guard_receivable_insert_status();

-- A proteção de histórico vale até contra uma Server Action equivocada:
-- depois de recebimento/abatimento, origem e valor nunca são reescritos.
create function public.guard_receivable_economic_update()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if (new.original_amount is distinct from old.original_amount
    or new.client_id is distinct from old.client_id
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.subscription_id is distinct from old.subscription_id
    or new.contract_id is distinct from old.contract_id
    or new.commercial_sale_id is distinct from old.commercial_sale_id
    or new.installment_number is distinct from old.installment_number
    or new.issue_date is distinct from old.issue_date
    or new.competency_date is distinct from old.competency_date)
    and (exists(select 1 from public.receivable_receipts r
                where r.receivable_id=old.id)
         or exists(select 1 from public.receivable_adjustments a
                   where a.receivable_id=old.id)) then
   raise exception 'Título com histórico financeiro não permite alterar valor ou origem.' using errcode='22023';
 end if;
 if new.status='cancelled' and old.status is distinct from 'cancelled' then
   if exists(select 1 from public.receivable_receipts r
              where r.receivable_id=old.id and r.reversed_at is null)
      or exists(select 1 from public.receivable_adjustments a
                where a.receivable_id=old.id and a.reversed_at is null)
      or exists(select 1 from public.payment_charges p
                where p.receivable_id=old.id and p.status='pending') then
     raise exception 'Recebimento, abatimento ou Pix pendente exige conciliação antes do cancelamento.' using errcode='22023';
   end if;
 end if;
 return new;
end;
$fn$;
create trigger guard_receivable_economic_update
 before update on public.receivables
 for each row execute function public.guard_receivable_economic_update();

comment on table public.receivables is
 'Título com valor/status auditados. UPDATE exclusivo de RPCs/Server Actions autorizadas via service_role; INSERT por funcionário com titulos_criar somente com status open. Histórico financeiro segue em receivable_receipts e receivable_adjustments.';
