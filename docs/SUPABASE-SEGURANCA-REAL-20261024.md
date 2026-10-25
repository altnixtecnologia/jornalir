# Avisos de segurança do Supabase real — auditoria de leitura 24/10/2026

**Escopo:** `site-system-ir`, análise read-only via Security Advisors. **Não aplicar grants/revokes/triggers/migrations no banco real sem revisão.** Estas observações refletem o banco **atual**, não a branch futura com 43 migrations inéditas ainda pendentes.

## Resumo oficial

| Categoria | Severidade consultada | Quantidade | Referência Supabase |
|---|---|---:|---|
| `rls_enabled_no_policy` | INFO | 20 | [Documentação](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) |
| `security_definer_view` | ERROR | 8 | [Documentação](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) |
| `function_search_path_mutable` | WARN | 16 | [Documentação](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) |
| `anon_security_definer_function_executable` | WARN | 41 | [Documentação](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) |
| `authenticated_security_definer_function_executable` | WARN | 51 | [Documentação](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |
| `auth_leaked_password_protection` | WARN | 1 | [Documentação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |

**Importante:** alertas não provam exploração ou vazamento. Alguns avisos classificam funções intencionalmente públicas e views projetadas para leitura pública. Ainda assim, a exposição precisa ser justificada e testada ANTES de liberar o novo código.

## Oito views `SECURITY DEFINER` — aviso ERROR

- `public.public_site_ad_slots`
- `public.public_localities`
- `public.public_articles`
- `public.public_article_media`
- `public.public_editorial_sections`
- `public.public_article_placements`
- `public.public_site_ad_media`
- `public.public_site_ad_settings`

**Risco:** views executam sob privilégios do criador em vez de RLS do leitor. As views `public_articles`, `public_article_media`, `public_site_ad_media` etc. compõem a vitrine pública intencional. No Git a view `public_site_ad_slots` foi inclusive ajustada historicamente para `security_invoker=false`. **NÃO mudar em massa para `security_invoker=true`**: isso poderia quebrar o portal se as tabelas base não tiverem RLS/GRANT de leitura pública equivalentes.

**Conferência adicional de RLS/grants no banco REAL (somente leitura):** as oito views listadas têm `SELECT` para `anon`. Todas usam comportamento `SECURITY DEFINER` por padrão, exceto `public_site_ad_slots` que explicita `security_invoker=false`. As nove tabelas de origem inspecionadas (`articles`, `article_media`, `article_placements`, `editorial_sections`, `localities`, `media_assets`, `site_ad_media`, `site_ad_slots`, `site_ad_settings`) têm RLS ligado e **nenhuma policy explícita para `anon`**. Isso sustenta a necessidade da camada pública filtrada, mas exige revisão de seleção de colunas e filtros de cada view. Mudar a view para `security_invoker=true` sem políticas públicas equivalentes poderia resultar em portal sem matérias e patrocinadores; NÃO aplicar alteração automática.

**Plano de correção posterior, com ensaio:** para cada view, mapear as tabelas base, política `SELECT anon`/authenticated, colunas visíveis, filtros de publicado/ativo, dados privados e `security_invoker`; adicionar testes anônimos para vazamento de rascunho, cliente e financeiro; só aplicar alteração de view/RLS quando testes de portal e admin garantirem o mesmo contrato público.

## Funções privilegiadas

O Advisor identificou **41** entradas de funções `SECURITY DEFINER` executáveis por `anon` e outra categoria de **51** para usuários autenticados. A lista `anon` sinalizada é:

- `convert_import_candidate_to_draft`
- `create_pdf_import_batch`
- `handle_new_auth_user`
- `is_active_admin`
- `is_active_admin_or_owner`
- `is_active_owner`
- `is_active_staff`
- `legacy_import_article`
- `merge_import_candidates`
- `publish_due_scheduled_articles`
- `reserve_next_dps_number`
- `save_client`
- `search_public_articles`
- `set_article_actor`
- `set_billing_provider_settings_actor`
- `set_birthday_entry_actor`
- `set_client_actor`
- `set_commercial_product_actor`
- `set_commercial_proposal_actor`
- `set_commercial_sale_actor`
- `set_institutional_contract_actor`
- `set_media_asset_actor`
- `set_nfse_certificate_actor`
- `set_nfse_draft_actor`
- `set_nfse_issued_note_actor`
- `set_nfse_issuer_config_actor`
- `set_nfse_service_profile_actor`
- `set_nfse_transmission_attempt_actor`
- `set_payment_charge_actor`
- `set_receivable_actor`
- `set_receivable_adjustment_actor`
- `set_receivable_receipt_actor`
- `set_site_ad_media_actor`
- `set_site_offer_settings_actor`
- `set_subscription_actor`
- `split_import_candidate`
- `submit_site_interest_request`
- `submit_site_interest_request_v2`
- `submit_site_interest_request_v3`
- `submit_site_interest_request_v4`
- `sync_site_offer_settings_to_commercial_products`

**Risco e triagem:** para cada função anotar tipo de uso (trigger interno, API pública deliberada, RPC administrativa), `SECURITY DEFINER/INVOKER`, `EXECUTE` efetivo para `anon/authenticated`, `search_path`, controle de `auth.uid()` e membership/role dentro do próprio SQL. Revogar `EXECUTE` somente nas funções realmente internas, com teste de dependências de triggers e servidor; funções de busca públicas, como `search_public_articles`, não devem ser bloqueadas sem substituto validado.

## Prioridade crítica confirmada: RPCs sensíveis ainda executáveis por `anon`

Em consulta read-only `has_function_privilege('anon', ... ,'EXECUTE')`, o projeto real retornou `true` para:
- `public.save_client(uuid,jsonb,text[])` (RPC de criação/edição de clientes);
- `public.legacy_import_article(jsonb,jsonb)` (importação de matéria legada);
- `public.publish_due_scheduled_articles()` (publicação de agendadas).

**Inspeção do SQL remoto:** as duas primeiras são `SECURITY DEFINER` e a autorização escrita no corpo verifica `is_active_staff()` **somente no ramo `auth.role()='authenticated'`**, portanto chamadas `anon` não entram nessa condição. A terceira é `SECURITY DEFINER` sem tal guarda. **Isso é uma falha real de autorização/exposição da RPC**, ainda que o resultado efetivo de cada possível chamada não tenha sido testado para evitar escrita/alteração de dados. Não executar PoC no projeto real.

**Correções JÁ EXISTENTES na PR #15 e ainda não aplicadas ao remoto:**
- `20261104101000_save_client_action_guard.sql`: refaz autorização e `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT` só para staff autenticado/service_role;
- `20261105100000_editorial_privileged_rpc_guards.sql`: aplica guarda de importação, revoga `anon` da importação legada e restringe `publish_due_scheduled_articles` somente ao service_role;
- `tests/security/full-schema-rls-postflight.sql` contém assertivas explícitas de que `anon` **não possui EXECUTE** nesses três pontos; tais testes **PASSAM em banco efêmero com todas as migrations da PR**, mas o remoto atual ainda não está nessa condição.

**PRIORIDADE PARA RESPONSÁVEL:** avaliar **correção emergencial segregada**, com backup, revisão de dependências, janela e autorização específica, sem aguardar necessariamente todas as 43 migrations da publicação. Não replicar a migração integral desordenadamente em produção e não editar o ledger para falsear estado. Como mitigação, o plano pode isolar apenas os `REVOKE`/guardas que não quebram clientes legítimos, mas isso precisa de revisão e teste em clone **antes de qualquer DDL remoto**.

## Política Auth

O Advisor sinalizou **proteção contra senhas vazadas desabilitada**. Verificar no painel do Supabase Auth a disponibilidade e ativação apropriada, sem alterar configurações da conta por este registro: [guia de senha comprometida](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Gate de publicação

1. Reavaliar Advisors após **ensaio de migrations no sandbox com estado equivalente ao remoto**, não só `supabase db reset` de banco vazio. Comparar contagens e impactos.
2. Auditoria dos oito views e das RPCs privilegiadas com papéis `anon`, staff autorizado e usuário externo sem staff, mantendo contratos públicos do portal.
3. Comprovar que RLS/grants finais preservam dados privados, sem expor clientes, contatos internos, assinaturas, títulos e senhas.
4. Documentar resolução/risco aceito pelo responsável técnico, com evidência de QA e plano de rollback. **Não considerar o status de CI verde como autorização para publicar.**
5. NFS-e permanece para depois da publicação; Altnix Informativo fica completamente desligado nesta etapa.

**Referências:** `docs/RELEASE-MIGRATIONS-REMOTE-20261024.md`, `docs/PRE-PUBLICACAO-IR-20261024.md`, PR #15. 
