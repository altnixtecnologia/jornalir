-- Contratos: documentos privados, sem URL publica no R2.
-- O contrato segue sendo o unico cadastro mestre: o Storage guarda apenas bytes.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('contract-documents','contract-documents',false,10485760,array['application/pdf'])
on conflict (id) do update set
  public=false,
  file_size_limit=10485760,
  allowed_mime_types=array['application/pdf'];

-- Authenticated staff com modulo financeiro habilitado.
-- Sem policy de UPDATE nem DELETE: os arquivos sao imutaveis (evidencia).
create policy contract_docs_storage_select_finance_staff
  on storage.objects for select to authenticated
  using (bucket_id = 'contract-documents' and public.staff_can_see_module('financeiro'));

create policy contract_docs_storage_insert_finance_staff
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contract-documents'
    and (storage.foldername(name))[1] = 'contracts'
    and public.staff_can_see_module('financeiro')
  );
