-- Módulo 10: somente clientes explicitamente liberados pelo Jornal IR
-- podem ser consultados pelo Altnix Informativo. Sem envio automático,
-- alteração de mídia, financeiro, playlists, dispositivos ou cadastros antigos.
create table public.client_digital_export_permissions (
  client_id uuid primary key references public.clients(id) on delete restrict,
  enabled boolean not null default false,
  enabled_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.client_digital_export_permissions enable row level security;
revoke all on public.client_digital_export_permissions from public, anon, authenticated;
grant select on public.client_digital_export_permissions to authenticated;

create policy client_digital_exports_admin_read
  on public.client_digital_export_permissions for select to authenticated
  using (public.is_active_admin_or_owner());

-- Apenas admin/owner confirmado altera a lista aprovada. A identidade
-- de quem autorizou é obtida da sessão e não de argumentos do browser.
create function public.set_client_digital_export_permission(p_client_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.is_active_admin_or_owner() then
    raise exception 'Sem permissão para liberar cliente digital.' using errcode='42501';
  end if;
  if p_client_id is null or p_enabled is null then
    raise exception 'Parâmetros inválidos.' using errcode='22023';
  end if;
  select c.status into v_status from public.clients c where c.id=p_client_id for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode='22023';
  end if;
  if p_enabled and v_status <> 'active' then
    raise exception 'Ative o cadastro antes de liberar integração.' using errcode='22023';
  end if;
  insert into public.client_digital_export_permissions (client_id,enabled,enabled_by,updated_at)
    values (p_client_id,p_enabled,auth.uid(),now())
  on conflict (client_id) do update set
    enabled=excluded.enabled, enabled_by=excluded.enabled_by,
    updated_at=excluded.updated_at;
  return true;
end;
$$;
revoke all on function public.set_client_digital_export_permission(uuid,boolean) from public,anon;
grant execute on function public.set_client_digital_export_permission(uuid,boolean) to authenticated;

comment on table public.client_digital_export_permissions is
  'Autorização explícita de compartilhar somente dados cadastrais comuns com o Altnix Informativo; não implica anúncio, venda, cobrança ou licença.';
