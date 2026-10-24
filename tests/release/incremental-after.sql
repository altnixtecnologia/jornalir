-- Somente no Supabase Docker efêmero do CI, DEPOIS das 43 migrations.
DO $$
DECLARE v_id uuid := '77777777-7777-4777-8777-777777777777';
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 195
 THEN RAISE EXCEPTION 'Upgrade local não registrou as 195 migrations'; END IF;

 -- Não apagar/desativar contas legadas existentes durante a atualização.
 IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN auth.users u ON u.id=p.id
  WHERE p.id=v_id AND p.role='operator' AND p.active
   AND u.email_confirmed_at IS NULL
 ) THEN RAISE EXCEPTION 'Upgrade alterou ou perdeu a conta legada'; END IF;

 IF NOT EXISTS(SELECT 1 FROM public.staff_memberships WHERE profile_id=v_id)
 THEN RAISE EXCEPTION 'Upgrade não preservou o colaborador convidado'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
 IF public.is_active_staff() OR public.is_active_admin_or_owner()
 THEN RAISE EXCEPTION 'Usuário não confirmado obteve acesso após upgrade'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);

 -- Signatários e contas novas devem nascer INATIVOS.
 INSERT INTO auth.users (
   id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data
 ) VALUES (
   '88888888-8888-4888-8888-888888888888',
   '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','release-new@example.invalid',
   null,'{"name":"Signatário Externo Teste","account_purpose":"contract_signer"}'::jsonb
 );
 IF EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id='88888888-8888-4888-8888-888888888888'
     AND active=true
 ) THEN RAISE EXCEPTION 'Conta externa criada ativa durante o upgrade'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.staff_memberships
   WHERE profile_id='88888888-8888-4888-8888-888888888888'
 ) THEN RAISE EXCEPTION 'Signatário externo ganhou membership do painel'; END IF;
END $$;
SELECT 'PASSOU: 43 migrations incrementais; contas legadas preservadas; novos usuários inativos' AS resultado;
