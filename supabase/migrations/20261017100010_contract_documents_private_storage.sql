-- RENOMEADA em 17/10/2026 (de 20261016233000 para 20261017100010, preparação
-- de publicação): nunca havia sido aplicada a nenhum banco real sob o nome
-- antigo; a SQL em si é idempotente (upsert do bucket + drop-if-exists nas
-- policies) e por isso não corre risco mesmo já tendo sido aplicada sob
-- outro identificador histórico. Reposicionada para depois de
-- 20261017100000_financeiro_contas_a_receber.sql por consistência com as
-- demais migrations de assinatura de contrato, que dependem de
-- contract_documents (criada nesse arquivo).
--
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
drop policy if exists contract_docs_storage_select_finance_staff on storage.objects;
create policy contract_docs_storage_select_finance_staff
  on storage.objects for select to authenticated
  using (bucket_id = 'contract-documents' and public.staff_can_see_module('financeiro'));

drop policy if exists contract_docs_storage_insert_finance_staff on storage.objects;
create policy contract_docs_storage_insert_finance_staff
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contract-documents'
    and (storage.foldername(name))[1] = 'contracts'
    and public.staff_can_see_module('financeiro')
  );
