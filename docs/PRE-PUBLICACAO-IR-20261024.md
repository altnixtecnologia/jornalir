# PRÉ-PUBLICAÇÃO — Jornal IR (24/10/2026)

**Estado: auditoria de release em andamento. NÃO AUTORIZA DEPLOY.**  
**Fonte de verdade:** PR #15 (`feature/homologacao-integrada-ir-20261023`), roteiros de módulos, issues #18.
**Escopo para a primeira publicação:** portal, sistema editorial e administrativo/financeiro homologado. **NFS-e somente DEPOIS da publicação.** Integração com **Altnix Informativo somente em um lote futuro**, sem tocar seu código, banco, players, equipamentos, playlists ou mídias agora.

## A. Evidência já confirmada

- `apps/site/vercel.json` e `apps/sistema/vercel.json` têm `git.deploymentEnabled: false`. Isso **não substitui** conferência do painel da Vercel nos projetos `jornalir` e `jornalir-sistema`.
- PR #15 é **draft** e tem como base `feature/abrangencias-geo-notificacoes-20261021`, NÃO `main`.
- Comparação GitHub em 24/10: PR #15 está **446 commits à frente** dessa base, com cerca de **243 arquivos alterados**. Frente à `main`, a branch está **1465 commits à frente e 1 atrás** (linhagens divergentes); o commit singular de `main` adiciona o guia de integração bilateral desatualizado, que já foi explicitamente marcado superado na PR de trabalho. Comparação de GitHub pode limitar inventário de arquivos em retornos grandes — **não usar contagem isolada como plano de merge**.
- Os workflows rodam build TypeScript do site e sistema, RLS financeiro e reconstrução de migrations em Supabase efêmero. **CI verde não prova** migração do banco real, login, envio de e-mails, Pix, Web Push, R2 ou comportamento visual.
- Consulta somente de leitura à **Vercel** confirma os projetos `jornalir` (domínios incluindo `jornalir.vercel.app`) e `jornalir-sistema` (incluindo `controle.altnix.com.br`). Último deploy retornado para o site tinha status `CANCELED`, e para o painel `READY`, ambos sem indicação de alvo Production nessa consulta. **Isso NÃO prova que os domínios de produção estejam atualizados nem que o Git Auto Deploy esteja desligado**; essas informações seguem pendentes de conferência.
- **Correção concreta de release:** `package-lock.json` não continha `@capacitor/app@7.1.0` declarado por `apps/mobile/package.json`. Entry do pacote e SHA-512 oficial foram adicionados. O workflow `Validate project` agora exige **`npm ci --no-audit --no-fund` sem fallback**; a etapa de instalação já foi verificada com sucesso após a correção. A rehearsal de Supabase usa CLI **2.120.0 pinada**, pois `latest` falhou por limite de requisições ao GitHub em uma rodada (não foi falha da migration). **Atenção:** `supabase db lint --local ... || true` ainda não certifica lint sem avisos; manter essa inspeção como tarefa antes do GO.
- No release em preparo, `NFSE_AVAILABLE_IN_THIS_RELEASE=false`: oculta os menus NFS-e e bloqueia rotas administrativas, autorização de Server Actions e ações fiscais excepcionais (certificado/consulta). Não destruir a implementação; reabilitar **só depois do go-live**, com aval e homologação fiscal.
- `ALTNIX_CLIENT_EXPORT_RELEASED=false` mantém a API de consulta externa fechada, independentemente de flags e segredo. Nenhuma integração remota ou comando de mídia faz parte desta publicação.
- Patrocinadores do portal: **100% bônus gratuito, inserção/remoção manual**, sem cliente obrigatório, faturamento, contratos ou suspensão automática.

## B. Gates que impedem publicar (ainda não realizados)

| Frente | Conferência obrigatória | Status |
|---|---|---|
| Controle de branches | Revisar ancestry/base/main, confrontar diferenças com o VS Code/Claude/Codex, definir **branch de release própria** e revisar diff final antes de qualquer merge | **PENDENTE** — main divergente |
| Migrações | Comparar `supabase_migrations.schema_migrations` do projeto remoto com inventário da branch; verificar ordem, idempotência, dependências e impacto em RLS antes de aplicar; fazer backup e ensaio de rollback | **PENDENTE**, sem acesso ou alteração remota autorizados |
| Auth / usuários | SMTP e autenticação de domínio, convites/recovery reais em caixa de teste, nome de usuário e permissão de owner/admin/operador, signatário externo sem acesso ao painel | **PENDENTE** |
| Editorial / Portal | Criar rascunho, imagem/capa estrela, recorte desktop, publicação/agendamento, portal/SEO/compartilhamento, abertura suave, mobile e cache | **PENDENTE** de QA visual autenticado |
| Jornal Online | Testar PUT de PDF/capa no **R2** homologado, SHA/duplicidade, importação em rascunhos, leitor desktop e Android, zoom, HTTP Range/CORS, acervo legado | **PENDENTE** |
| Aniversariantes | Layout aprovado, DD/MM com ano opcional, instituições, `Novo +`, hover do X, não duplicar, atualização sem F5, relatório semanal | **PENDENTE** |
| Agenda / Pauta | Reunião/convidados/aceite/recusa por perfil, lembrete e opt-in do Web Push em aparelho de laboratório, Telegram de grupo em homologação | **PENDENTE** |
| Patrocinadores e Assine | Seis posições, ordem/rotação, ativa/inativa manual, telas PC/mobile, ativação Assine/Anuncie separada de patrocinadores | **PENDENTE** |
| Financeiro | Asaas **Sandbox**: emissão Pix, baixa via webhook autenticado, idempotência, cancelamento/estorno, valor parcial, crédito, permissões detalhadas de operador e WhatsApp aprovado com número de teste; nenhum Pix real | **PENDENTE** |
| Contratos comerciais | Revisão jurídica do texto, PDF original/aditivo, evidências, e-mail/OTP, assinaturas múltiplas em homologação e recuperação após falha | **PENDENTE** |
| NFS-e | **Fora da primeira publicação**. Confirmar módulo oculto, rota e ações bloqueadas; não configurar certificado/serviço fiscal real | **TRAVA DE CÓDIGO** — exigir CI |
| Altnix Informativo | **Fora da primeira publicação**. API local de exportação bloqueada e repositório Altnix intocado; não ativar ou migrar nenhuma integração | **TRAVA DE CÓDIGO** — exigir CI |
| Infra / domínio | Confirmar Vercel Git Deploy desligado no **dashboard de ambos os projetos**; verificar env scopes Preview vs Production, URLs, Supabase Pro, R2 e limites de upload; revisar segredo Asaas LIVE indevidamente associado a Preview | **PENDENTE** |
| Publicação e reversão | Plano de backup com restore ensaiado, release SHA, ordem de migrações e deploys, smoke HTTP, checklist GO/NO-GO, responsáveis e reversão; autorização específica do proprietário | **PENDENTE** |

**Não trocar PENDENTE por CONCLUÍDO apenas porque passou unit test.** Nenhuma credencial, valor de segredo ou dado pessoal deve aparecer nos documentos, logs de CI ou comentários de PR.

## C. Sequência segura do release — somente mediante aprovação específica

1. Congelar mudanças na PR #15, capturar SHA final e abrir revisão de código; **não fazer merge direto dessa PR em `main`**. Auditar base/ancestry e reconciliar divergências documentais sem apagar histórico.
2. Comparar a cópia VS Code com os remotos atuais **somente quando Codex/Claude precisarem atuar**, respeitando a regra do proprietário; nunca `git reset --hard`, force-push ou deploy automático para sincronizar.
3. Revisar migrations contra o remoto **por leitura**; elaborar plano de atualização de banco e backups, em projeto de homologação descartável primeiro. Não rodar `db push` no ambiente real sem aval.
4. Validar Vercel Settings → Git dos dois projetos, scope de variáveis e URLs (especialmente produção/Preview), e desabilitar saídas reais para e-mail, WhatsApp, Pix, notificação, fiscal e Altnix durante testes.
5. Executar testes de cada frente com usuários/perfis de laboratório, guardar evidências (sem informações sensíveis) e obter aprovação de UX/jurídico.
6. Criar commit/tag release identificável e plano de rollback do site, sistema e migrações. Alterações SQL irreversíveis exigem backup e plano de restauração.
7. **Somente após GO explícito:** aplicar migrations autorizadas na sequência ensaiada, publicar site e sistema na ordem aprovada, executar smoke test autenticado e acompanhar logs; reversão pronta se algum gate falhar.
8. Após o portal e sistema estabilizarem: abrir uma **etapa separada de NFS-e** para desenvolvimento/homologação fiscal. Integração completa com Altnix somente depois de toda estrutura de cobranças e mídia ter sido aprovada, por um único lote coordenado.

## C.1 — Auditoria conectada do ambiente real (leitura, 24/10/2026)

- **Supabase `site-system-ir`:** 152 versões de migrations registradas, 195 arquivos `.sql` na PR, 149 versões coincidentes. Das 46 versões locais sem carimbo idêntico, **3 correspondem a SQL exatamente igual no remoto sob timestamp diferente**; restam **43 arquivos de conteúdo novo** ainda não instalados. **Não aplicar `db push`**: conciliar aliases, sequência, impacto, plano de restauração e aprovação antes. Inventário completo em `docs/RELEASE-MIGRATIONS-REMOTE-20261024.md`.
- **BLOQUEIO PRIORITÁRIO DE SEGURANÇA (novo, comprovado):** `anon` pode invocar `save_client(uuid,jsonb,text[])`, `legacy_import_article(jsonb,jsonb)` e `publish_due_scheduled_articles()` no banco real. Duas verificações de staff remoto dependem de `auth.role()='authenticated'` e não verificam anônimos. A PR já tem `REVOKE`/guardas corretos em `20261104101000_save_client_action_guard.sql`, `20261105100000_editorial_privileged_rpc_guards.sql` e testes em `full-schema-rls-postflight.sql`, **mas essas migrations ainda NÃO foram aplicadas**. Priorizar análise de hotfix segregado e aprovado, sem provar escrita em produção ou alterar DB sem autorização. Detalhes em `docs/SUPABASE-SEGURANCA-REAL-20261024.md`.
- **Supabase Security Advisors, estado remoto atual:** 8 views `SECURITY DEFINER` com alerta ERROR; 41 funções privilegiadas disponíveis a `anon` e 51 a `authenticated` (algumas intencionalmente públicas), 16 funções com search_path mutável, 20 tabelas com RLS sem policy e proteção de senha vazada desativada. Há necessidade de revisão **sem alteração cega que quebre o portal**. Metadados e documentação de correção em `docs/SUPABASE-SEGURANCA-REAL-20261024.md`.
- **Vercel `jornalir-sistema`:** `ASAAS_API_KEY_PRODUCTION` está atribuída também ao escopo **Preview**, apesar de existir guarda de código. **NO-GO** até que um administrador retire a variável desse escopo com autorização, preserve somente a atribuição de Production e valide sandbox isolado. Nenhum segredo foi lido.
- **Vercel `jornalir`:** R2 listado só para Preview; confirmar dependência do portal em Production antes de copiar/criar envs. Auto-deploy Git não foi confirmado pelas consultas; exigir inspeção no dashboard.
- **Ferramenta de liberação sem credenciais:** `scripts/release/migration-preflight.mjs --remote /caminho/historico.json`. Aceita somente metadados `version/name`, não executa SQL nem se conecta ao banco, sinaliza drift com código 2. Testes puros `scripts/release/migration-preflight.test.mjs` no CI. O relatório do script não substitui revisão manual nem backup.


## C.2 — Mitigações emergenciais APLICADAS no ambiente real

Após autorização específica do proprietário, foram **corrigidos** os dois principais vetores imediatos encontrados no banco:
1. **Nove RPCs privilegiadas** deixaram de ser executáveis por `anon`; entre elas `save_client`, `legacy_import_article`, PDF/importação, `publish_due_scheduled_articles` e `reserve_next_dps_number`. As ACLs reais foram conferidas novamente, preservando trabalho autenticado/service_role. Supabase Advisors: 41 → 32 alertas anônimos (restam trigger helpers e formulários deliberadamente públicos, ainda sob revisão).
2. **Novos Auth users agora nascem `operator,active=false`**, por substituição segura de `handle_new_auth_user` com o corpo já versionado na migration futura. Perfis existentes preservados.
3. **Credencial Asaas LIVE no Preview** foi neutralizada substituindo APENAS o valor da variável Preview-only por marcador inválido; registro Production intacto. **Chave antiga deve ser rotacionada no Asaas**: Preview deploys antigos não são automaticamente invalidados pela edição.

O registro detalhado das mudanças **de fato realizadas no remoto**, as provas pós-aplicação, impactos, limitações e roteiro de continuidade estão em `docs/HOTFIX-SEGURANCA-REAL-20261024.md`. Nenhuma dessas ações aplica automaticamente as 43 migrations de release, liberta NFS-e, autoriza Altnix ou substitui testes reais de login. **GO continua bloqueado** até fechar os outros requisitos.

## D. GO/NO-GO e notas de continuidade

- **NO-GO** enquanto houver falha de CI no SHA final, divergência de branches não conciliada, migrations não conferidas, autorização real faltando ou teste operacional crítico pendente.
- **NO-GO** para NFS-e ou Altnix nesta primeira versão independentemente do sucesso do CI.
- Os testes de release `apps/sistema/test/prepublication-release-gates.test.ts` garantem travas de código e verificam que menus/rotas/Server Actions fiscais são bloqueados. Isso não substitui checagem dos envs reais ou das funções PostgreSQL existentes.
- **Anotações para quem continuar:** a branch experimental `feature/jornalir-clientes-integrados-20261024` no repositório Altnix não deve ser utilizada/mesclada/publicada. A `main` Altnix não foi alterada. A issue #18 descreve requisitos futuros, não uma autorização.
