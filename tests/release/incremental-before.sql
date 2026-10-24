-- Somente no Supabase Docker efêmero do CI, ANTES das 43 migrations.
-- Reproduz uma conta antiga de colaborador ainda sem e-mail confirmado.
DO $$
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 152
 THEN RAISE EXCEPTION 'Baseline local deveria conter 152 migrations'; END IF;

 INSERT INTO auth.users(id,instance_id,aud,role,email,invited_at,email_confirmed_at,raw_user_meta_data)
 VALUES (
 '77777777-7777-4777-8777-777777777777',
 '00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','release-legacy@example.invalid',
 now(),null,'{"name":"Colaborador Legado Teste"}'::jsonb
 );

 IF NOT EXISTS(
  SELECT 1 FROM public.profiles
  WHERE id='77777777-7777-4777-8777-777777777777'
    AND role='operator' AND active=true
 ) THEN RAISE EXCEPTION 'Conta legada não foi ativada no baseline anterior'; END IF;
END $$;
