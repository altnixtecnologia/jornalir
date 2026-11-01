-- Reforço de RLS — permissões granulares em site_interest_requests
-- (Bloco 1, 31/10/2026). NÃO aplicada ainda (preparada localmente).
--
-- ACHADO: a policy de UPDATE criada em 20261012195906_site_interest_requests.sql
-- exigia só `is_active_staff()` — QUALQUER funcionário ativo (inclusive
-- operador sem a permissão específica) podia marcar uma solicitação como
-- "convertida", ou alterar qualquer outro campo (converted_client_id,
-- converted_proposal_id etc.) chamando a API REST do Supabase direto,
-- contornando totalmente a checagem granular feita nas Server Actions
-- (`checkModuleAction`, ver actions.ts do módulo de solicitações). Esta
-- migration fecha essa brecha no próprio banco (defesa em profundidade,
-- mesmo princípio já usado em enforce_assine_admin_update) — sem mudar a
-- regra de negócio em si, só garantindo que ela vale também para quem
-- chamar a API diretamente, não só pela tela.
--
-- A policy agora exige UMA das duas permissões granulares já usadas pela
-- aplicação para este fluxo: "publicidade.solicitacoes_gerenciar" (atender/
-- revisar/converter publicidade e pacotes mistos) OU "assinaturas.
-- assinaturas_criar" (conversão em assinatura). Owner/admin continuam
-- liberados por staff_can_module_action (que já retorna true pra eles
-- incondicionalmente) — nenhuma regressão de acesso administrativo.
drop policy if exists site_interest_requests_update_staff on public.site_interest_requests;

create policy site_interest_requests_update_staff
  on public.site_interest_requests for update
  to authenticated
  using (
    public.staff_can_module_action('publicidade', 'solicitacoes_gerenciar')
    or public.staff_can_module_action('assinaturas', 'assinaturas_criar')
  )
  with check (
    public.staff_can_module_action('publicidade', 'solicitacoes_gerenciar')
    or public.staff_can_module_action('assinaturas', 'assinaturas_criar')
  );

comment on policy site_interest_requests_update_staff on public.site_interest_requests is
  'Exige a permissão granular específica (publicidade.solicitacoes_gerenciar ou assinaturas.assinaturas_criar), não só "é staff ativo" — fecha o contorno via API REST direta que existia desde a criação da tabela. Owner/admin continuam liberados (staff_can_module_action retorna true pra eles sempre).';
