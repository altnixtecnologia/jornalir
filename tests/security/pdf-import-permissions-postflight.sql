-- Roda somente em Supabase descartável. Não deixa usuários/lotes reais.
begin;
do $setup$
declare u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 ed uuid; number integer:=1900000000+floor(random()*100000000)::int;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'pdf-import-admin-'||u::text||'@example.invalid',now(),'{"name":"Import QA"}'::jsonb);
 update public.profiles set role='admin',active=true where id=u;
 insert into public.staff_memberships(profile_id) values(u);
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'pdf-import-outsider-'||outsider::text||'@example.invalid',now(),'{"name":"Import Outsider"}'::jsonb);
 insert into public.newspaper_editions(edition_number,publication_date,title)
 values(number,current_date,'Edição de homologação descartável') returning id into ed;
 perform set_config('qa.pdf.actor',u::text,true);
 perform set_config('qa.pdf.outsider',outsider::text,true);
 perform set_config('qa.pdf.edition',ed::text,true);
end;
$setup$;

set local role authenticated;
do $test$
declare
 edition uuid:=current_setting('qa.pdf.edition')::uuid;
 sha text:=repeat('a',64);
 candidates jsonb:='[{"page_number":1,"suggested_title":"Texto teste","suggested_body":"Conteúdo de homologação"}]';
 first_rows jsonb; force_rows jsonb; n int; denied boolean;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.pdf.actor'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);

 -- A assinatura antiga continua válida para integrações existentes.
 select public.create_pdf_import_batch(edition,'edicao-teste.pdf',sha,1,'{}'::integer[],
   '[]'::jsonb,candidates) into first_rows;
 if jsonb_array_length(first_rows)<>1 then
   raise exception 'Importação inicial não persistiu candidato.';
 end if;
 -- Retry do mesmo SHA-256 não gera outro lote/candidatos.
 denied:=false;
 begin
   perform public.create_pdf_import_batch(edition,'edicao-teste.pdf',sha,1,'{}'::integer[],
     '[]'::jsonb,candidates);
 exception when unique_violation then denied:=true;
 end;
 if not denied then raise exception 'PDF duplicado foi novamente importado sem confirmação.'; end if;
 select count(*) into n from public.pdf_import_batches
  where newspaper_edition_id=edition and file_hash=sha;
 if n<>1 then raise exception 'Batch duplicado sem confirmação.'; end if;
 -- Reprocessar de forma explícita tem de continuar funcionando.
 select public.create_pdf_import_batch(edition,'edicao-teste.pdf',sha,1,'{}'::integer[],
   '[]'::jsonb,candidates,true) into force_rows;
 if jsonb_array_length(force_rows)<>1 then raise exception 'Reprocessamento explícito falhou.'; end if;
 select count(*) into n from public.pdf_import_batches
  where newspaper_edition_id=edition and file_hash=sha;
 if n<>2 then raise exception 'Reprocessamento explícito não abriu lote separado.'; end if;

 -- Não integrante do staff não escreve por RPC SECURITY DEFINER.
 perform set_config('request.jwt.claim.sub',current_setting('qa.pdf.outsider'),true);
 denied:=false;
 begin
   perform public.create_pdf_import_batch(edition,'invasao.pdf',repeat('b',64),1,
      '{}'::integer[],'[]'::jsonb,candidates,true);
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Acesso sem permissão criou lote por RPC.'; end if;

 denied:=false;
 begin
   perform public.convert_import_candidate_to_draft(gen_random_uuid(),'Titulo',
     null,'corpo',null,null,1,'[]'::jsonb);
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Sem permissão conseguiu chamar conversão SECURITY DEFINER.'; end if;
end;
$test$;
reset role;
rollback;
select 'PASSOU: editor autorizado, PDF duplicado bloqueado, reprocessamento explícito e perfil negado' as resultado;
