-- Fechamento Portal/Leitor (2026-11-10).
-- Apenas a RPC v4 do formulário Assine pode receber solicitações públicas:
-- v4 valida site_offer_settings.assine_enabled antes de inserir.
-- Versões antigas v1/v2/v3 não tinham essa trava. Bloqueá-las impede
-- continuar criando solicitações por chamadas diretas quando Assine está OFF.
-- Nenhum dado é alterado e não há cobranças/envios.
DO $portal_rpc_lockdown$
DECLARE f record;
BEGIN
 FOR f IN
   SELECT p.oid::regprocedure AS signature
   FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       'submit_site_interest_request',
       'submit_site_interest_request_v2',
       'submit_site_interest_request_v3'
     )
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
 END LOOP;
END;
$portal_rpc_lockdown$;
