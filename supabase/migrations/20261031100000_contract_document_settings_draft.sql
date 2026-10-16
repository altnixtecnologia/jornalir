-- Estrutura prevista para a configuração dos modelos do Jornal IR.
-- Revisão jurídica separada do texto: esta tabela guarda apenas minutas.
CREATE TABLE IF NOT EXISTS public.contract_document_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name text NOT NULL DEFAULT '',
  trade_name text NOT NULL DEFAULT 'Informativo Regional',
  cnpj text NOT NULL DEFAULT '',
  representative text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT 'Rua Joaquim Pereira Maciel, 256, Centro, São João do Sul/SC',
  phone text NOT NULL DEFAULT '(48) 98829-7503',
  email text NOT NULL DEFAULT 'contato@informativoregional.net',
  annual_text text NOT NULL DEFAULT '',
  print_text text NOT NULL DEFAULT '',
  led_text text NOT NULL DEFAULT '',
  mixed_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.contract_document_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_document_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.contract_document_settings TO authenticated;
DROP POLICY IF EXISTS "contracts_settings_staff_read" ON public.contract_document_settings;
CREATE POLICY "contracts_settings_staff_read" ON public.contract_document_settings FOR SELECT
  TO authenticated USING (public.is_active_staff());
DROP POLICY IF EXISTS "contracts_settings_admin_insert" ON public.contract_document_settings;
CREATE POLICY "contracts_settings_admin_insert" ON public.contract_document_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_active_admin_or_owner());
DROP POLICY IF EXISTS "contracts_settings_admin_update" ON public.contract_document_settings;
CREATE POLICY "contracts_settings_admin_update" ON public.contract_document_settings FOR UPDATE
  TO authenticated USING (public.is_active_admin_or_owner())
  WITH CHECK (public.is_active_admin_or_owner());
