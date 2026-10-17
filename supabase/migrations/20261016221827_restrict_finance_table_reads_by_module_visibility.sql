-- Impede que operadores sem acesso ao modulo Financeiro leiam as tabelas
-- diretamente via API Supabase, inclusive atraves de views security_invoker.
-- Policies preexistentes (is_active_staff) continuam como filtro adicional.
-- Operadores com modulo habilitado e administradores/proprietario seguem visiveis.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'receivables', 'receivable_receipts', 'receivable_adjustments',
    'payment_charges', 'client_credits', 'institutional_contracts',
    'contract_documents', 'contract_amendments', 'contract_commitment_orders'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
          AND policyname = 'finance_read_requires_module'
      )
    THEN
      EXECUTE format(
        'CREATE POLICY finance_read_requires_module ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.staff_can_see_module(''financeiro''))',
        v_table
      );
    END IF;
  END LOOP;
END $$;;
