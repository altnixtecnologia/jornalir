# HOTFIX DE SEGURANÇA — APLICADO NO AMBIENTE REAL DO JORNAL IR
**Data:** 24/10/2026 — autorização explícita do proprietário: "reveja o que for preciso e precisar ser alterado para termos real segurança, faça".  
**Projeto Supabase:** `site-system-ir` (NÃO `altnix-informativo`).  
**Vercel:** projeto `jornalir-sistema`.  
**Escopo:** apenas privilégio de RPC, padrão de segurança na criação de conta e neutralização de variável de Preview. **Sem deploy, merge, alteração de mídias, pagamentos, NFS-e ou Altnix Informativo.**

## 1. Supabase — nove RPCs internas bloqueadas para anônimos (APLICADO)

No banco real, executado em **uma transação**, `REVOKE EXECUTE FROM PUBLIC, anon` para as seguintes assinaturas:

| Assinatura | Acesso depois do hotfix |
|---|---|
| `public.save_client(uuid,jsonb,text[])` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.legacy_import_article(jsonb,jsonb)` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.convert_import_candidate_to_draft(uuid,text,text,text,uuid,uuid,integer,jsonb)` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.create_pdf_import_batch(uuid,text,text,integer,integer[],jsonb,jsonb)` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.merge_import_candidates(uuid,uuid[],text,uuid[])` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.split_import_candidate(uuid,text,text,text)` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.reserve_next_dps_number(uuid,text,text)` | `anon=false`; `authenticated=true`; `service_role=true` |
| `public.publish_due_scheduled_articles()` | `anon=false`; `authenticated=false`; `service_role=true` |
| `public.sync_site_offer_settings_to_commercial_products()` | `anon=false`; `authenticated=false`; `service_role=true` |

**Validado novamente em consulta independente após a transação:** as nove RPCs negam `EXECUTE` a `anon`; as sete RPCs de funcionário preservam o acesso da role autenticada e as duas rotinas internas preservam apenas a execução de serviço. A pesquisa pública `search_public_articles(...)` e o formulário público `submit_site_interest_request_v4(...)` continuam acessíveis ao público.

**Supabase Security Advisors:** função `SECURITY DEFINER` exposta a `anon` caiu de **41 para 32** (verificação após hotfix). Não interpretar 32 alertas como 32 falhas comprovadas: 23 são funções `RETURNS trigger`, 4 são predicados de identidade, e 5 são APIs públicas (pesquisa de matérias + quatro versões de formulário de interesse). Auditoria de abuso, política de aplicação e rate limiting dos formulários ainda é necessária.

**Importante sobre registro:** este foi um **hotfix ACL transacional no banco real**, sem executar `supabase db push`, sem aplicar qualquer das 43 migrations pendentes e **sem adicionar/alterar entradas na tabela `supabase_migrations.schema_migrations`**. As ACLs finais estão reproduzidas e reforçadas nas migrations futuras existentes no Git: `20261104101000_save_client_action_guard.sql` e `20261105100000_editorial_privileged_rpc_guards.sql`. O teste `tests/security/full-schema-rls-postflight.sql` agora verifica todas as nove RPCs para impedir regressões. **Quando aplicar as migrations completas futuramente, conferir que as ACLs permaneçam fechadas**, nunca tratar este hotfix como prova de migração executada.

## 2. Supabase Auth — novas contas INATIVAS por padrão (APLICADO)

Conferência do banco ANTES do hotfix: `public.handle_new_auth_user()` criava automaticamente novos perfis `operator, active=true` para qualquer `auth.users` com `account_purpose` diferente de `contract_signer`. O valor vem de metadado editável pelo usuário, então a regra era insegura caso o signup público estivesse acessível.

Foi aplicada **exatamente a função** da migration futura `supabase/migrations/20261115100000_auth_invitation_default_inactive.sql`, sem registrar essa migration como aplicada: qualquer conta criada via Auth passa a ter perfil `operator, active=false`, independentemente dos metadados de signup. Nome passa por validação/sanitização. O `search_path` da função está fixado em vazio.

**Verificação de leitura após a aplicação:** `pg_get_functiondef` mostra `'operator',false` e `SET search_path TO ''`. Contagem agregada de perfis não mudou: 1 owner ativo e 2 operadores já ativos/convidados ainda sem confirmação do e-mail (não foram alterados). **Não foi executado signup real** para não criar contas de teste no ambiente de produção.

**Impacto esperado de segurança:** novos convites de staff exigem **ativação administrativa explícita**; o painel deve continuar tratando o fluxo de convite/aceite como pendente. Não reativar signup automaticamente apenas para tornar o login mais simples. Na futura implantação da migration `20261119100000_staff_membership_authorization.sql`, será exigida membership e confirmação de e-mail também para contas antigas — **ainda não aplicada ao remoto**.

## 3. Vercel — chave Asaas LIVE removida do uso em Preview (APLICADO)

O registro de `ASAAS_API_KEY_PRODUCTION` era separado entre `production` e `preview`. Foi modificada SOMENTE a **variável Preview** (registro `nviNgATE2hx7MjaS`), mantendo o target Preview, mas substituindo seu valor por um marcador **inutilizável**: `DISABLED_IN_PREVIEW_USE_SANDBOX_ONLY`. O registro Production (`lojJpLjvJ1vUU0nz`) foi **preservado, sem ler valor ou modificar data**. O conector confirmou a edição e a revisão de metadados confirmou que o registro de Production segue separado.

**Não houve redeploy.** Builds Preview **anteriores** ainda podem conter seu ambiente antigo até que sejam substituídos/invalidados. O marcador inerte não garante remoção retrospectiva do segredo antigo desses builds, e o mero fato de a chave ter sido disponibilizada em Preview justifica **rotacionar a chave real no provedor Asaas** em etapa autorizada, verificar possíveis requisições indevidas e atualizar SOMENTE o valor do registro Production. Essa rotação **não foi feita aqui** por não haver integração autorizada com a conta Asaas. Não colocar credenciais em documentação nem em mensagens.

## 3.1 Vercel Preview — isolamento do Supabase e controle de acesso (APLICADO)

Auditoria de metadados e leitura comparativa das URLs (sem expor as chaves) confirmou que **o projeto `jornalir-sistema` em Preview apontava à mesma URL Supabase de Production**. Isso permitiria a qualquer código de Preview, se obtivesse credenciais, operar contra o banco verdadeiro.

**Correção aplicada exclusivamente nas variáveis Preview do sistema:**

- `SUPABASE_SERVICE_ROLE_KEY`: registro Preview `TWGzeglCzDIfC8re`, trocado por placeholder inutilizável;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: registro Preview `TD45gaGYtusXs5vk`, trocado por placeholder inutilizável;
- `NEXT_PUBLIC_SUPABASE_URL`: registro Preview `Z7g42JGXyItWM9dU`, apontado a `https://supabase-preview-disabled.invalid`.

**Verificação:** a URL de Preview é diferente da URL Production e corresponde ao destino `.invalid`; os três registros separados de Production (`LwVYorbHFW5FpqvC`, `fubKHef2IgxJMduK`, `0vDzkrEy5KeLTnSd`) preservaram seus identificadores e timestamps originais. Nenhum valor de `service_role` foi exibido ou publicado.

**Resultado intencional:** novos Previews do sistema não conseguem acessar o banco real. Para que Preview volte a funcionar, configurar **projeto Supabase sandbox separado**, com credenciais próprias e políticas testadas. Nunca devolver o banco Production ao escopo Preview.

**Defesa no código da PR #15:** `apps/sistema/src/lib/release/previewIsolationPolicy.ts` implementa gate `canUseSupabaseAdminCredentials`. `apps/sistema/src/lib/supabase/admin.ts` agora nega `hasServiceRoleKey()` e `createSupabaseAdminClient()` sempre que `VERCEL_ENV` é diferente de `production` (dev local continua controlado separadamente). Teste automatizado foi acrescentado em `apps/sistema/test/prepublication-release-gates.test.ts` para impedir regressão. **Código ainda em PR draft, não publicado:** a garantia imediata para Preview vem da neutralização das variáveis de ambiente.

**Deployments antigos:** Vercel listou várias execuções anteriores `READY`, inclusive Preview. O conector não dispõe de cancelamento para deployments já `READY` (cancelamento só interrompe builds em andamento). Foi ativada **Vercel Authentication `ssoProtection: { enabled:true, deploymentType:'preview' }`** nos dois projetos, `jornalir` e `jornalir-sistema`, e o estado foi confirmado por nova leitura. **Production não foi colocado sob autenticação extra.** A Vercel Authentication limita os Previews a membros da equipe, inclusive links anteriores, mas não garante revogação de qualquer credencial que tenha sido copiada anteriormente. Revisar rotação das chaves com processo de contingência.

**Nota:** o histórico de migrations do Supabase continuou em **152 versões** após os hotfixes, confirmando que nenhuma migration remota foi registrada/aplicada por engano.

## 4. O que NÃO foi alterado

- Sem emissão de cobranças, mudança de valores, envio WhatsApp/e-mail, criação de usuários reais de teste ou edição de cadastros.
- Nenhuma linha de dados operacionais foi atualizada/deletada no Supabase. O esquema de negócios, views públicas e RLS existente não foi migrado.
- Não houve backup/restore de dados, nem ensaio de deploy em produção; as alterações foram **ACL transacional e substituição idempotente de função de gatilho**, com verificação imediata. Reversão de privilégios exige plano técnico próprio — **nunca reabrir `EXECUTE` anônimo como rollback automático**.
- Não alterar `main`, não publicar PR #15, não executar qualquer comando no repositório ou banco do Altnix Informativo.
- NFS-e fica para depois de publicar o sistema.

## 5. Riscos e próximas ações de segurança, em ordem

1. **Alta prioridade:** revisão de registro/login/convite real e autorização granular, principalmente usuários anteriores à nova regra. Completar a migration de membership após ensaio controlado, com conferência de e-mails, sem bloquear proprietário.
2. **Alta prioridade:** rodar auditoria do restante das funções `SECURITY DEFINER` autenticadas e das permissões de operadores — é diferente de liberar anon. Não reduzir avisos a zero às cegas, pois triggers, funções de RLS e formulários públicos têm uso legítimo.
3. **Alta prioridade:** rotacionar `ASAAS_API_KEY_PRODUCTION` no Asaas; auditar acessos; revisar credenciais de Preview antigas, limites de build e isolamento de Sandbox.
4. **Antes do release:** conciliar 43 migrations novas e 3 versões de SQL idêntico com timestamp diferente; plano de backup/restauração, ensaio em sandbox representativo e GO específico.
5. **Antes do release:** revisar oito views públicas `SECURITY DEFINER` com testes de não vazamento. Não trocar para `security_invoker=true` sem RLS/grants públicos equivalentes: pode deixar portal vazio.
6. Habilitar/verificar proteção contra senhas vazadas em Supabase Auth pelo painel autorizado e validar restrições de signup; esta integração não possui ferramenta de alteração Auth Config no momento.

**Fontes de continuidade:** PR #15; `docs/PRE-PUBLICACAO-IR-20261024.md`; `docs/RELEASE-MIGRATIONS-REMOTE-20261024.md`; `docs/SUPABASE-SEGURANCA-REAL-20261024.md`.

## 6. Pré-homologação: isolamento adicional de segredos em Preview (24/10/2026)

Após autorização para preparar o sistema para homologação, foram aplicados ajustes adicionais **exclusivamente em variáveis de ambiente e proteção dos Previews**:

- **`jornalir` Preview (portal):** `NEXT_PUBLIC_SUPABASE_URL` passou a `https://supabase-preview-disabled.invalid` e a chave publicável do Preview foi neutralizada. O site ainda não possui banco de homologação; Production não foi modificada.
- **`jornalir` Preview:** as cinco variáveis `R2_*` tiveram valores inutilizáveis para impedir acesso ao acervo por builds novos.
- **`jornalir-sistema` Preview:** as cinco `R2_*` e `WHATSAPP_TOKEN` foram neutralizadas. Banco Preview e chave Asaas LIVE já haviam sido neutralizados no hotfix anterior.
- **`jornalir-sistema`:** os registros antes compartilhados entre Preview/Production `ASAAS_WEBHOOK_TOKEN`, `NFSE_CERTIFICATE_MASTER_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `ASAAS_ENV` e `WHATSAPP_PHONE_NUMBER_ID` foram restringidos ao alvo **Production**, preservando valores existentes (não foram descriptografados/alterados). Novos Previews precisam configurar valores exclusivamente sandbox. Isso **não** rotaciona chaves antigas já entregues a builds anteriores.
- `ssoProtection` Preview permanece ligada para ambos os projetos, sem interferir no domínio Production.
- **Não houve deploy** das branches e nenhum dado do Supabase, R2, mídia, cobrança ou Altnix foi modificado nessas correções Vercel.

**Observação de CI e próximo estágio:** a base de código ganhou gate `isIsolatedHomologation` que só habilita `service_role` em Preview com `IR_HOMOLOGATION_ENABLED=true`, `IR_HOMOLOGATION_SUPABASE_REF` diferente de `iqnzrpdccecgalqboeyf` e URL exata daquele sandbox. Webhook de Asaas em Preview exige adicionalmente `ASAAS_ENV=sandbox`. O gate é NEGATIVO por padrão. A configuração detalhada e a matriz de testes estão em `docs/HOMOLOGACAO-IR-AMBIENTE-E-ROTEIRO-20261024.md`.

**Custo de recurso Supabase isolado:** tentativa de criar branch de desenvolvimento retornou necessidade de `confirm_cost_id`; valor informado pela plataforma foi US$0,01344/h. **Nenhum branch/novo projeto foi criado** — aguarda autorização de custo do usuário. Sem sandbox aprovado, não ativar Preview de homologação nem usá-lo em testes reais.

**Observação de schema:** o lint PL/pgSQL da branch detectou sombra da variável de loop `v_ord` em `record_manual_composition_payment`. Foi removida somente a declaração redundante, preservando os dois loops; o CI agora executa `supabase db lint --local --schema public` sem `|| true`, falhando se surgirem novos erros.
