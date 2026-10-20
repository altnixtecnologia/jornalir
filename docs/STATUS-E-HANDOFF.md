# Jornal IR — Status atual e passagem de contexto (HANDOFF)

> **Registro em 17/10/2026, a partir dos relatórios fornecidos pelo usuário do Claude Code local.** Não representa verificação independente dos arquivos locais por ChatGPT. Atualizar após cada lote; nunca tratar este snapshot como estado definitivo.

## Onde desenvolver

- Repositório `altnixtecnologia/jornalir`, monorepo (`apps/site`, `apps/sistema`, `packages`, `supabase`).
- Pasta **oficial**: `C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\Site-sistema`.
- Branch local oficial: `consolidacao-local-20261016`.
- Último HEAD **confirmado em 17/10/2026 (verificação direta, não só relato)**: ver lote "Preparação do banco" abaixo para o HEAD exato.
- Sequência completa de commits locais confirmados: `ba3955f` (cliente/contratos) → `f8a3783` (certificado NFS-e) → `36e3276` (parametrização municipal) → `1c32734` (404/loading público) → `c4c02d5` (lote 2) → `61c944d` (lote 3) → `31798c8` (instalação da memória permanente de governança) → `7ee1ee2` (vercel.json) → `d89f6ed` (método ~3 tópicos + confirmação Vercel) → `71448d1` (Aniversariantes/Usuários-Menus/Publicidade, auditoria) → `d7781f0` (correção doc) → `3301471` (fix ordem de migrations) → `734fecf` (Publicidade per-imagem) → `4ebd0d8` (Aniversariantes: fundação/foto/edição manual) → `a8e95b8` (docs) → `00051fd` (fix fresh-install) → `8d1253a` (docs) → ver lote abaixo para os commits de reconciliação.
- **Sincronização com GitHub:** `a8e95b8` e anteriores já estão em `origin/consolidacao-local-20261016` (push confirmado em 17/10/2026). Os commits posteriores (`00051fd`, `8d1253a` e os do lote de reconciliação abaixo) **ainda não foram enviados** — nenhum novo push foi autorizado nesta sessão.
- Pastas preservadas **somente referência**: `Site-sistema-ANTIGO-BACKUP`, `Site-sistema-painel`, `jornalir-consolidacao-local`.
- Remoto no GitHub **não tem** os commits locais listados acima (confirmado, não presumido). Não usar `git pull` ou checkout remoto sem inspecionar diferenças.

## Sincronização com GitHub e configuração Vercel (17/10/2026)

- **Push ainda NÃO realizado** — aguardando confirmação de segurança contra deploy automático (ver abaixo) e autorização explícita do usuário.
- `vercel project inspect` confirmou os Root Directory reais: `jornalir` → `apps/site`; `jornalir-sistema` → `apps/sistema`. Os arquivos `apps/site/vercel.json` e `apps/sistema/vercel.json` (commit `7ee1ee2`, `git.deploymentEnabled: false`) estão no lugar certo para serem lidos por cada projeto.
- `vercel ls`/`vercel inspect` nos dois projetos confirmaram **churn real de deploys** nas últimas 17-22h (múltiplos Preview + Production, vários `Canceled`) — os deploys `target: production` recentes vieram de branches `release/*` (ex.: `release/aniversariantes-production-20261016`, `release/finance-permissions-guards-20261015`), nunca de `consolidacao-local-20261016`. Isso confirma o problema de cota já relatado e sugere (mas não garante com 100% de certeza) que um push de `consolidacao-local-20261016` dispararia só Preview, não produção.
- **Não há comando de CLI da Vercel para ler/alterar o toggle "deploy automático" do dashboard** (`vercel project inspect`/`update` não expõem isso) — só o arquivo `vercel.json` pode ser preparado via código; o toggle do dashboard (Settings → Git de cada projeto) só pode ser confirmado/alterado manualmente pelo usuário.
- **Pendência exata antes do push:** confirmar manualmente no dashboard de `jornalir` e `jornalir-sistema` que o deploy automático via Git está desligado (ou aceitar o risco residual documentado pela própria Vercel sobre o comportamento do commit que introduz `deploymentEnabled:false` pela primeira vez).

## O que Claude relatou ter feito — verificar antes de afirmar conclusão

| Lote | Reportado | Evidência relatada / ressalva |
|---|---|---|
| Consolidação local | Projeto Git independente no nome original, backup e worktrees recuperados | SHA `ba3955f` inicialmente; `origin` GitHub verificado; folders preservadas |
| Item 5 lote 1 | Auditoria assinador, PDFs e link de contratos na página cliente | Commit `ba3955f`; teste smoke PDF, typecheck/build |
| Recuperação 3.1 | A1: service_role server-only, fingerprint SHA-256, validação de chave/cert, mTLS | Commit `f8a3783`, builds e testes locais; sem teste certificado real |
| Recuperação 3.2 | Parametrização municipal ADN em Produção Restrita; UI diagnósticos | Commit `36e3276`, 122 testes reportados; consultas reais não testadas |
| Recuperação 3.3 | Páginas 404 e loading públicos | Commit `1c32734`, 122 testes e HTTP local reportados; ressalva 200 em streaming |
| Item 5 lote 2 | Multi-signatário cadeia PDF, reenvio rastreado, consulta DPS/NFS-e offline, mutex DPS, preparo cancelamento | Commit `c4c02d5`, 137 testes reportados; migrations locais não aplicadas, fluxos fiscais reais bloqueados |
| **Item 5 lote 3** | **Reportado concluído localmente:** cadastro/versionamento/duplicação de modelos, variáveis do cadastro único, PDF privado paginado e integração ao assinador | Commit `61c944d`; 147 testes relatados (95+23+29), typecheck/build e smoke PDFs. **Sem teste E2E Supabase e sem aplicação da migration do lote 3.** |
| Memória de governança | `CLAUDE.md`/`AGENTS.md`/`ACORDOS-E-FONTE-DA-VERDADE.md`/`STATUS-E-HANDOFF.md`/auditoria instalados; conflito Drive×R2 anotado em `POST_MIGRATION_PENDING.md` sem apagar o histórico | Commit `31798c8`; só documentação, nenhum código alterado |
| Auditoria de sincronização | Preparados `apps/site/vercel.json` e `apps/sistema/vercel.json` (`deploymentEnabled:false`); `vercel fetch` confirmou 6 commits à frente, fast-forward limpo | Commit `7ee1ee2`; nenhum push/deploy executado |
| Método definitivo + confirmação Vercel | Lotes de ~3 tópicos registrado em `CLAUDE.md`/`AGENTS.md`/`ACORDOS-E-FONTE-DA-VERDADE.md`; `vercel project inspect` confirmou Root Directory de cada projeto; push ainda não feito por falta de confirmação do toggle de auto-deploy no dashboard | Ver seção "Sincronização com GitHub e configuração Vercel" acima |

## Migrations locais dos lotes 2 e 3 — PENDENTES no relatório

- `20261029100600_contract_multi_signer.sql`
- `20261029100700_contract_signature_resend_link.sql`
- `20261029100800_nfse_transmission_concurrency_guard.sql`
- `20261029100900_nfse_cancellation_preparation.sql`
- `20261029101000_contract_templates.sql`

Não aplicar sem inventário de migrations, ordem, compatibilidade com remoto e autorização explícita. Não testar com dados reais sem aprovação.

## Próximas prioridades após lote 3

1. Auditar a implementação do lote 3 (templates de contrato) **contra os critérios funcionais do usuário**; testar criação, edição, prévia, versão imutável e integração com cliente e assinador em ambiente adequado.
2. Homologar o item 5 por etapas, quando houver autorizações: migrations de banco, assinatura E2E, configuração email/WhatsApp, fiscal A1/ADN/SEFIN e eventos; não inferir sucesso de mocks.
3. Revisar módulos aprovados visualmente (Aniversariantes, menus, cliente, publicidade, site); registrar bugs e evitar refazer UX aprovada.
4. Por último, decidir como consolidar as duas linhagens divergentes de permissões financeiras: `release/consolidacao-permissoes-20261016-lote1` e `release/finance-permissions-guards-20261015`.
5. Confirmar manualmente no dashboard Vercel (`jornalir`, `jornalir-sistema`) que o deploy automático via Git está desligado; só então fazer `git push` de `consolidacao-local-20261016` (fast-forward simples, sem force/rebase) e confirmar na aba Deployments que nada disparou. Publicação manual continua precisando de autorização específica adicional.

## Auditoria de requisitos recuperados

- Consultar `docs/AUDITORIA-GERAL-REQUISITOS-E-PENDENCIAS-2026-10-17.md` antes de qualquer novo lote. O arquivo reúne decisões aprovadas nas conversas, conflitos de documentação e itens que exigem validação visual ou E2E.
- **Atenção:** o documento antigo `docs/POST_MIGRATION_PENDING.md` ainda orienta Drive para novos PDFs; a decisão posterior de 12/10, em `docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md`, usa **Cloudflare R2**. Não voltar ao Drive inadvertidamente.
- Aniversariantes/layout aprovado, menus `Novo +`, permissões por operação, Agenda/Pauta/Telegram, 6 slots de publicidade, financeiro/atrasos e cadastro mestre Jornal IR→Altnix exigem checagem funcional específica.

## Regras do próximo operador/assistente

- Consultar `docs/ACORDOS-E-FONTE-DA-VERDADE.md` antes de qualquer modificação.
- Confirmar Git, arquivos, branch e estado real; nenhum relatório de assistente substitui testes.
- Pedir decisão sobre alterações visíveis de UX aprovada; propor melhorias arquiteturais explicitando trade-offs.
- Atualizar este handoff no final de cada lote com SHA, arquivos, teste/observação, pendências e decisões aprovadas.
- Não executar push, deploy, env changes, migrations remotas, coberturas/PIX/NFS-e ou mensagens reais sem autorização específica.

## Template mínimo de atualização após cada lote

```
Data:
Branch/HEAD:
Objetivo autorizado:
FEITO (com arquivos e evidência):
VALIDADO LOCALMENTE (testes e UX):
VALIDADO EM SERVIÇO REAL (somente se autorizado):
NÃO VALIDADO / FALTA:
Migrations pendentes:
Decisões novas APROVADAS pelo usuário:
Riscos de regressão:
Próximo lote:
```

## Lote — Aniversariantes, Usuários/Menus, Publicidade (17/10/2026)

```
Data: 17/10/2026
Branch/HEAD: consolidacao-local-20261016 / 71448d1
Objetivo autorizado: conferir e recuperar layout/comportamentos aprovados em 3 tópicos
  (Aniversariantes, Usuários e Menus, Publicidade), corrigindo o que estiver incompleto.

FEITO (com arquivos e evidência):
- Auditoria de código real (3 agentes paralelos, só leitura) comparando cada módulo
  linha a linha com ACORDOS-E-FONTE-DA-VERDADE.md e a auditoria geral, ANTES de
  qualquer edição — nenhuma reimplementação do que já estava correto.
- Aniversariantes: corrigidos comentários desatualizados e falsos em
  packages/core/src/aniversariantes/birthday-repository.ts e
  apps/sistema/src/providers/supabase/birthdayRepository.supabase.ts (afirmavam
  que a tela era "100% em memória" — já persiste direto via actions.ts). Sem
  mudança de comportamento, só corrige um risco real de regressão futura.
- Publicidade: rótulo "Tempo por imagem" corrigido para "Tempo de rotação desta
  posição" + texto explicativo (SiteAdSlotsPanel.tsx) — o campo sempre controlou
  a posição inteira, nunca uma imagem individual; o rótulo antigo induzia a erro.
- Publicidade: CommercialSaleDetail.tsx ganhou um link para
  /sistema/configuracoes/patrocinadores quando a venda é channel="website",
  mitigando (sem migration) a falta de rastreabilidade venda→banner real.
- Usuários/Menus: nenhuma alteração de código — tudo já conferia com as decisões
  aprovadas (ver VALIDADO LOCALMENTE).

VALIDADO LOCALMENTE (testes e UX):
- Usuários/Menus: U01/U03/U04 conferem 100% com o código (menu só módulos, sem
  "Novo +" duplicado, bloqueio de módulo desativado também por URL direta via
  middleware+RPC, mobile fecha ao clicar fora, signatário OTP nunca fica staff
  ativo, nenhuma mistura das duas branches de permissões não mescladas).
- Aniversariantes: A01/A02/A04 conferem 100% com o código (árvore/agrupamento,
  filtros, Novo+, X hover/mobile, sem F5).
- Publicidade: P01 confere 100%. P02/P04 tinham gaps reais, parcialmente
  mitigados sem migration (ver FEITO); granularidade por imagem individual e
  vínculo estrutural venda→banner continuam pendentes.
- typecheck (@ir/sistema), build (@ir/sistema), suíte completa do monorepo:
  147 testes (95+23+29), 0 falhas. Sem sessão autenticada disponível nesta
  sessão — telas não conferidas visualmente logadas (mesma limitação já
  registrada em sessões anteriores do AI_HANDOFF).

VALIDADO EM SERVIÇO REAL (somente se autorizado): nenhum (não autorizado nesta etapa).

NÃO VALIDADO / FALTA:
- Conferência visual autenticada (desktop/mobile) dos três módulos.
- Aniversariantes: dado de fundação de instituição (A01) — ausente, exige migration.
- Publicidade: duração/efeito/ajuste por imagem individual e FK venda→banner —
  exigem migration (não tocada neste lote).
- U02: permissões granulares do Financeiro continuam um switch único — já
  deliberadamente adiado (U03), não é uma pendência nova deste lote.

Migrations pendentes: nenhuma tocada/criada/reordenada. Lista completa de
  pendentes continua a mesma (ver seção acima) + achado NOVO (não corrigido):
  as migrations de site_ad_slots/commercial_proposals têm ORDEM DE ARQUIVO
  incompatível com suas dependências reais (ALTER antes do CREATE pela data
  do nome) — precisam ser renomeadas/reordenadas num lote dedicado a migrations,
  antes de qualquer aplicação futura. Nenhuma delas foi aplicada a banco real.

Decisões novas APROVADAS pelo usuário: nenhuma — dois conflitos documentais
  foram REGISTRADOS, não resolvidos (ver AUDITORIA-GERAL, seção 5, itens 9 e 10):
  (a) Aniversariantes — "destaque com foto"/"edição manual" aprovados nos
  acordos vs. migration que declara essas funcionalidades removidas por
  "decisão final do módulo"; (b) achado da ordem de migrations acima.

Riscos de regressão: nenhum identificado nas mudanças feitas (só correção de
  comentário/rótulo/link, sem alteração de schema/comportamento/permissão).

Próximo lote: aguardando autorização do usuário.
```

## Lote — Preparação do banco para publicação (17/10/2026, commit 00051fd)

```
Objetivo: validar TODAS as migrations locais contra o histórico real do
Supabase remoto (leitura apenas) e testar a sequência completa num banco
local descartável antes de qualquer aplicação remota.

ACHADO CRÍTICO: o histórico remoto (supabase_migrations.schema_migrations)
não corresponde aos nomes de arquivo locais atuais — várias migrations
foram renomeadas/editadas no passado sem `migration repair`. O banco
remoto em si está consistente (confirmado via `supabase db dump --schema
public`); o problema só afeta um FRESH INSTALL (banco novo do zero), que
falhava em 9 pontos por dependência fora de ordem. Corrigido via extração/
reposicionamento de SQL idempotente + rename de arquivos nunca aplicados
sob o nome atual (6 migrations de assinatura de contrato) — detalhes no
commit 00051fd. Também corrigido: major_version do config.toml (15 -> 17,
remoto real é Postgres 17) e uma lacuna real (staff_can_see_module/
staff_module_visibility existiam no remoto sem NENHUMA migration local
correspondente — reconstruída fielmente a partir do dump).

Testado: `supabase start` do zero (Docker local, projeto isolado) aplicou
as 126 migrations sem erro; dados fictícios confirmaram constraints/FKs/
view com COALESCE/RPCs. Suite completa (101+23+29) continua passando.

Nenhuma migration foi aplicada ao Supabase remoto; nenhum dado real foi
alterado; nenhum push/deploy realizado. Ver relatório completo entregue
ao usuário nesta sessão para a lista exata das 23 migrations pendentes e
os comandos de aplicação controlada propostos (ainda não autorizados).
```

## Lote — Reconciliação do histórico de migrations (17/10/2026)

```
Objetivo: reconciliar os números 23/126/120 e confirmar via supabase
migration list + db push --dry-run (sem aplicar nada) a lista exata do
que seria realmente executado.

RECONCILIAÇÃO DOS NÚMEROS:
- 126 = total de arquivos .sql em supabase/migrations/ (ls | wc -l).
- 120 = total de versões distintas registradas como aplicadas no
  schema_migrations remoto (102 com nome local correspondente + 18
  "órfãs" — versão aplicada sob um nome que não existe mais localmente,
  por renomeações antigas nunca reconciliadas com `migration repair`).
- 102 (local=remote) + 24 (só local, sem contrapartida remota) = 126.
- Dos 24 "só local": 8 são mudança genuinamente nova (nunca executada,
  nem sob outro nome) e 16 são conteúdo que JÁ existe no remoto sob um
  nome diferente (idêntico ou reconstruído fielmente a partir do schema
  real) — destes 16, 15 são no-op seguro se reaplicados (idempotentes) e
  1 (site_ad_media_client_fk) adiciona uma FK que de fato ainda não
  existe no remoto. O relatório anterior desta sessão citou "23" por
  engano (contagem inconsistente) — 24 é o número correto.

CORREÇÃO REAL REALIZADA: 20261014000000_site_ad_slots.sql tinha 3 CREATE
TABLE + 7 CREATE POLICY + 3 CREATE TRIGGER + 2 CREATE VIEW + 2 INSERT sem
nenhuma guarda de idempotência — o conteúdo já existe no remoto sob o
nome antigo (20261029100200), então um push real falharia com "relation/
policy/trigger already exists". Adicionado IF NOT EXISTS/DROP...IF
EXISTS/CREATE OR REPLACE/ON CONFLICT em tudo, sem mudar estrutura nem
comportamento. Re-testado: fresh install do zero (Docker local) continua
aplicando as 126 migrations sem erro; suíte completa (101+23+29) continua
passando.

IMPEDIMENTO CONFIRMADO: `supabase db push --dry-run` (mesmo --dry-run,
mesmo --include-all) se recusa a rodar enquanto existirem as 18 versões
"órfãs" no histórico remoto — o próprio CLI exige `supabase migration
repair --status reverted <18 versões>` antes de simular qualquer push.
Como `migration repair` foi explicitamente proibido nesta sessão, o
dry-run não pôde ser executado de fato; a lista abaixo foi derivada de
`supabase migration list` (leitura confirmada) e das correções acima.

LISTA EXATA que db push tentaria marcar como aplicada (24, numa aplicação
futura após repair): as 8 novas de fato (20261029100600 a 20261029101300)
+ as 16 que já existem no remoto sob outro nome (20261014000000,
20261014110050, 20261014214500, 20261017100010/020/030/040/050/060,
20261027100120/150/160/450, 20261028100050, 20261029100050/100060).

Testes: typecheck/build não afetados (só SQL). Suíte completa 153/153.

Nenhum db push real, nenhum migration repair, nenhuma alteração no
Supabase remoto, nenhum push no GitHub, nenhum deploy.
```

## Lote — APLICAÇÃO REAL autorizada das migrations no Supabase (17/10/2026, 3ª rodada)

```
AUTORIZADO EXPRESSAMENTE pelo usuário: backup, verificação e aplicação
real das 19 migrations pendentes contra o projeto remoto iqnzrpdccecgalqboeyf.

BACKUP (antes de qualquer alteração): estrutura + dados de public e de
auth/storage (dump explícito dos dois, já que o padrão do CLI os exclui),
roles e histórico de migrations — tudo em
`C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\backups-supabase\
site-system-ir\2026-10-17\` (fora do Git), com checksums SHA-256 e README
documentando cobertura exata. PITR está DESABILITADO neste projeto
(confirmado via `supabase backups list`) — só backups diários da
plataforma (último antes de hoje: 17/10 07:10 UTC). Arquivos físicos do
Storage (bytes dos uploads) NÃO estão cobertos por nenhum dump de banco —
limitação real, documentada, não resolvida nesta sessão. Teste de
restauração feito com sucesso em ambiente isolado (Docker local).

VERIFICAÇÃO PRÉ-APLICAÇÃO: reconfirmado `supabase migration list` e
`db push --dry-run --include-all` — mesmas 19 migrations do lote
anterior. Auditoria extra pedida pelo usuário ("as 11 de reconciliação
são seguras sobre o estado REAL, não só fresh install?") encontrou e
corrigiu 1 risco real: `site_ad_slots_dependent_setup.sql` tinha um
UPDATE incondicional que reverteria customização por posição feita
depois via painel — removido antes de aplicar.

APLICAÇÃO REAL — 2 falhas reais encontradas e corrigidas em sequência
(parei, avaliei o estado efetivamente aplicado via `migration list`,
nunca reexecutei às cegas, nunca usei migration repair/db reset):
  1. `contract_signature_family.sql`: "constraint already exists" — a
     execução histórica real (fora de ordem de nome de arquivo) já tinha
     criado a estrutura final completa; corrigido para só garantir o
     estado final (CREATE TABLE IF NOT EXISTS com as constraints já na
     definição, função direto na v2, nunca recriando a v1 removida).
  2. `site_ad_slots_dependent_setup.sql`: "cannot drop columns from
     view" — mesmo padrão; corrigido removendo a recriação da view
     intermediária de 6 colunas, indo direto à versão final de 7.
  Cada falha causou ROLLBACK AUTOMÁTICO completo e confirmado (nenhum
  efeito parcial) antes da correção e nova tentativa.

RESULTADO FINAL: as 19 migrations aplicadas com sucesso. `supabase
migration list` confirma 139 locais = 139 remotas, 0 divergência.
`db push --dry-run` confirma "Remote database is up to date."

VALIDAÇÃO PÓS-APLICAÇÃO (leitura apenas, sem NFS-e/cobrança/mensagem
real): dump de estrutura pós-push comparado ao pré-push — +3 tabelas
(contract_signature_requests, nfse_cancellation_requests,
contract_templates/versions), +2 policies, +5 funções, ZERO remoções.
Dump de dados pós-push comparado linha-a-linha (contagem por tabela) ao
pré-push — CONTAGEM IDÊNTICA em toda tabela com dados (23.440 artigos,
44.791 mídias, 4 clientes, etc.) — zero perda, zero alteração indevida.
Funções sensíveis (staff_can_see_module, is_active_staff,
confirm_payment_charge, finalize_contract_signature) confirmadas
presentes. Estruturas novas confirmadas: clients.founding_date,
birthday_entries.photo_media_asset_id,
birthday_edition_messages.manually_edited/message_override,
site_ad_media.rotation_interval_ms/transition_effect/fit_mode,
contract_signature_requests, nfse_cancellation_requests,
claim_draft_transmission/release_draft_transmission.

Nenhum push no GitHub, nenhum deploy na Vercel, nenhuma NFS-e/cobrança/
mensagem real emitida. Commits locais: ver sequência de commits deste
lote (fixes de idempotência aplicados DURANTE a operação, antes de cada
nova tentativa).
```

## Lote — Reconciliação definitiva do histórico de migrations (17/10/2026, 2ª rodada)

```
Objetivo: resolver definitivamente o bloqueio de db push sem migration
repair, sem push real e sem arquivos vazios artificiais — usando
`supabase migration fetch` (leitura do histórico remoto, escreve só
localmente) para recuperar o conteúdo REAL das 18 versões "órfãs", em vez
de reconstruir por tentativa/erro como no lote anterior.

DESCOBERTA: 12 das 18 órfãs tinham arquivo correspondente no histórico Git
local (nunca deletado, só "esquecido" por renomeações antigas). As outras
6 (toda a família de assinatura de contrato: storage, convites, finalize,
PDF assinado, status de notificação, trigger de signatário) não existiam
em NENHUM commit deste repositório — `supabase migration fetch` recuperou
o conteúdo exato de todas as 18 diretamente do histórico armazenado no
próprio Supabase (leitura, nunca escreve no remoto).

RECONCILIAÇÃO: as 15 migrations duplicadas criadas no lote anterior
(reconstruções/relocations aproximadas) foram DESCARTADAS em favor do
conteúdo real restaurado sob os nomes verdadeiros. Confirmado também que
a FK site_ad_media.client_id→clients JÁ EXISTE no remoto (dump re-
verificado) — a migration nova que eu tinha criado para "completá-la" no
lote anterior era baseada numa leitura equivocada e foi removida.

PADRÃO FINAL (sem arquivos vazios, sem migration repair): cada uma das 11
migrations já aplicadas cujo timestamp real é anterior à sua dependência
ganhou uma GUARDA (`to_regclass`/`to_regprocedure` + bloco condicional —
nunca um arquivo vazio, sempre o SQL original completo, só protegido) que
a torna um no-op seguro em fresh install quando a dependência ainda não
existe; o SQL real roda numa migration NOVA, posicionada corretamente
depois da dependência. As 11 novas: clients_asaas_customer_id,
clients_asaas_customer_environment, contract_signature_family (consolida
4), payment_charges_provider_asaas, payment_charge_public_token,
restrict_payment_confirmation_rpc_to_service_role,
client_credits_with_balance_pix_origin, commercial_products_seed (x2
fontes), site_interest_conversion_links, site_interest_attendance_
backfill, site_ad_slots_dependent_setup (consolida 4).

VALIDADO:
- Fresh install do zero (Docker local descartável, Postgres 17): as 139
  migrations aplicam em sequência, sem erro, do início ao fim.
- Dados fictícios: 10 produtos em commercial_products (seed completo,
  sem duplicar), staff_module_visibility/finance_actions existem,
  finalize_contract_signature existe só na versão v2 (9 parâmetros — v1
  foi substituída exatamente como historicamente aconteceu), FK
  site_ad_media_client_id_fkey existe.
- Suíte completa: 153/153 testes.
- `supabase db push --project-ref iqnzrpdccecgalqboeyf --dry-run
  --include-all` (SEM aplicar nada): retornou EXATAMENTE as 19 migrations
  que realmente precisam rodar — as 11 de reconciliação + as 8
  genuinamente novas (contract_multi_signer, contract_signature_resend_
  link, nfse_transmission_concurrency_guard, nfse_cancellation_
  preparation, contract_templates, clients_founding_date, birthday_photo_
  and_manual_message, site_ad_media_per_image_settings) — ZERO tentativa
  de reaplicar as 16 que já existem no remoto.

Nenhum migration repair, nenhum db push real, nenhuma alteração no
Supabase remoto (fetch e dry-run são leitura/simulação), nenhum push no
GitHub, nenhum deploy.
```

## Lote — Implementação efetiva: Aniversariantes, Publicidade, Migrations (17/10/2026)

```
Data: 17/10/2026
Branch/HEAD: consolidacao-local-20261016 / 4ebd0d8
Objetivo autorizado: o usuário corrigiu explicitamente que o lote anterior (71448d1,
  acima) era só uma auditoria — pediu execução EFETIVA dos 3 tópicos pendentes:
  1) Aniversariantes: destaque com foto, edição manual de mensagens, data de fundação
     para instituições, preservando o layout aprovado; 2) Publicidade: configurações
     individuais por imagem (duração, proporção, efeito, ordem) com persistência e
     transições reais; 3) Migrations: corrigir dependências fora de ordem e preparar
     as migrations necessárias, sem alterar migrations já aplicadas nem tocar o banco
     remoto. Commits locais apenas — sem push/deploy/alteração no Supabase remoto.

FEITO (com arquivos e evidência):
- Migrations (commit 3301471): renomeadas via `git mv` (histórico preservado,
  conteúdo idêntico + comentário explicando a troca) — site_ad_slots/site_ad_media
  (CREATE TABLE) de 20261029100200 para 20261014000000_site_ad_slots.sql (antes dos
  5 arquivos 20261014*/20261015* que fazem ALTER nessas tabelas); site_interest_
  conversion_links.sql de 20261013043920 para 20261029100050 e site_interest_
  attendance_and_route.sql de 20261014020555 para 20261029100060 (ambas depois de
  20261029100000_commercial_proposals.sql, que criam a tabela que referenciam).
  Nenhuma das três havia sido aplicada a banco real.
- Publicidade (commit 734fecf): nova migration 20261029101300_site_ad_media_per_
  image_settings.sql adiciona rotation_interval_ms/transition_effect/fit_mode
  NULLABLE em site_ad_media (null = usa o valor da posição); public_site_ad_media
  resolve o fallback via COALESCE na própria view. packages/types + packages/core
  (SiteAdMediaChanges aceita null explícito para "voltar ao padrão da posição";
  SiteAdSlotService valida os 3 campos quando informados). siteAdRepository.
  supabase.ts lê/grava as 3 colunas. SiteAdSlotsPanel.tsx ganha um bloco
  "Configuração própria desta imagem" por miniatura (checkbox + segundos + efeito +
  formato). No site público: adSlots.ts/AdSlotUnit.tsx passam a ler duração/efeito/
  formato de CADA imagem (current.rotateMs/transitionEffect/fitMode), agendando a
  próxima troca com setTimeout dinâmico por imagem em vez de um setInterval fixo
  por posição — transição real por imagem, não só armazenada. Corrigido também um
  bug pré-existente em siteAdsService.ts que ignorava o valor por-linha da view e
  sempre usava o da primeira mídia do slot. "Ordem" (sort_order) já era por imagem,
  confirmado sem necessidade de mudança.
- Aniversariantes (commit 4ebd0d8):
  - Data de fundação: nova migration 20261029101100_clients_founding_date.sql
    (founding_date em clients, só kind=company, constraint
    clients_founding_date_only_company, nunca confundida com birth_date; save_client
    redefinida para escrever a coluna nova). Editável na aba Identificação do
    Cadastro PJ (ClientForm.tsx) e exibida/gerenciada em Aniversariantes como
    BirthdayGroup.foundingEntry — conceito SEPARADO de principal, que continua
    exclusivo de pessoa física ("PJ nunca tem titular aniversariante" preservado).
    setBirthdayPublication/prepareBirthdayEditionMessage (source "cliente")
    generalizados via resolveMasterAnniversary() para resolver nascimento (PF) OU
    fundação (PJ) pelo mesmo fluxo de vínculo editorial.
  - Foto de destaque: nova migration 20261029101200_birthday_photo_and_manual_
    message.sql adiciona photo_media_asset_id em birthday_entries (reaproveita
    media_assets/R2, nenhum storage novo). Novas actions setBirthdayEntryPhoto/
    removeBirthdayEntryPhoto; EntryRow (BirthdaysList.tsx) ganha upload/remoção de
    foto, funcionando para qualquer origem (cadastro/familiar/manual) sem nunca
    alterar o cadastro mestre.
  - Edição manual de mensagem: mesma migration adiciona message_override/
    manually_edited em birthday_edition_messages. Nova action
    saveManualBirthdayMessage (exige mensagem automática já preparada na edição
    atual antes de permitir edição manual — nunca cria uma mensagem do nada).
    "Trocar mensagem" (gerador automático) sempre limpa manually_edited/
    message_override — as duas operações nunca se combinam na mesma linha.
    EntryRow ganha textarea de edição manual + badge "(editada manualmente)".

VALIDADO LOCALMENTE (testes e UX):
- typecheck limpo em @ir/types, @ir/core (via npm test), @ir/sistema e @ir/site
  após cada etapa (Publicidade primeiro, depois Aniversariantes) — nenhum erro
  restante nos dois apps.
- build de produção OK em @ir/sistema e @ir/site (next build completo, sem erros).
- Suíte completa do monorepo: 153 testes (@ir/core 101 incl. 6 novos de
  site-ad-media-overrides.test.ts + @ir/pdf-extraction 23 + @ir/types 29), 0
  falhas. Novo teste cobre validação de overrides por imagem (duração 2-120s,
  efeito/formato válidos, null explícito aceito, undefined nunca dispara erro).
- Sem sessão autenticada disponível nesta sessão — telas não conferidas
  visualmente logadas (mesma limitação já registrada em lotes anteriores).

VALIDADO EM SERVIÇO REAL (somente se autorizado): nenhum — nenhuma migration foi
  aplicada a banco real, nenhum push/deploy realizado, conforme instrução explícita.

NÃO VALIDADO / FALTA:
- Conferência visual autenticada (desktop/mobile) dos três módulos com os novos
  controles (foto, edição manual, configuração por imagem, campo de fundação).
- Efeito de transição por imagem continua limitado às mesmas 6 opções já
  liberadas por posição (SiteAdSlotTransitionEffect) — ampliar para as 10 opções
  completas do enum (SiteAdTransitionEffect) não foi pedido e não foi feito.
- FK estrutural venda→banner (P04) continua pendente — fora do escopo deste lote.
- As 3 novas migrations (clients_founding_date, birthday_photo_and_manual_message,
  site_ad_media_per_image_settings) estão preparadas e commitadas, mas NÃO
  aplicadas a nenhum banco — aplicar exige autorização explícita futura.

Migrations pendentes: as 3 novas deste lote (ver acima) seguem a mesma regra de
  trabalho das demais pendentes do projeto — nunca aplicadas sem autorização
  explícita e sem acesso ao Supabase remoto nesta sessão.

Decisões novas APROVADAS pelo usuário: reversão explícita da "decisão final do
  módulo" que havia removido destaque com foto e edição manual de mensagem em
  Aniversariantes (contradição A03 registrada no lote anterior, agora resolvida a
  favor de implementar as duas funcionalidades); autorização para tocar as
  migrations pendentes (instrução anterior "não mexa nas migrations pendentes"
  foi explicitamente substituída por esta).

Riscos de regressão: baixo — mudanças são aditivas (colunas nullable, novas
  actions, novos props de UI com defaults que preservam o comportamento anterior
  quando não configurados). Ponto de atenção: AdSlotUnit.tsx mudou de um
  setInterval fixo por posição para setTimeout recursivo por imagem — comportamento
  equivalente quando nenhuma imagem tem override individual (usa sempre o valor da
  posição), mas vale conferir visualmente a rotação de um slot com várias imagens
  após o próximo deploy de preview.

Próximo lote: aguardando autorização do usuário.
```

## Lote — Sincronização GitHub e publicação manual Vercel (17/10/2026)

Autorização explícita do responsável: "JORNAL IR — SINCRONIZAÇÃO E PUBLICAÇÃO FINAL
  CONTROLADA" (push no GitHub + publicação manual na Vercel de `jornalir` e
  `jornalir-sistema`). Pré-requisito (lote anterior) já cumprido: 19 migrations
  aplicadas de fato no Supabase remoto, com backup completo e validação pós-aplicação
  (ver lote "APLICAÇÃO REAL autorizada" acima).

### 1. Preservação da versão em produção (antes de publicar)

- Site: deployment anterior `dpl_6rd8TtmXKDYgLv6ZtgWFNx3ensLk` (criado 15/10/2026
  18:44, URL `jornalir-9m5wscc5b-...vercel.app`), correspondente ao commit `44346e0`
  informado pelo usuário — confirmado via `vercel inspect` no alias
  `jornalir.vercel.app` (não presumido pela listagem `vercel ls --prod`) e via
  `git merge-base --is-ancestor 44346e0 HEAD` (ancestral confirmado).
- Sistema: deployment anterior `dpl_9gYFJCHY5ZPzoLAoHmx1CxnmQseR` (criado 16/10/2026
  20:03, URL `jornalir-sistema-btyttuacs-...vercel.app`), correspondente ao commit
  `64c288a` — mesma verificação (`vercel inspect` no alias `controle.altnix.com.br` +
  `merge-base --is-ancestor`).
- Conferência objetiva das áreas protegidas (homepage/header/notícias/editorias,
  Jornal Online, Assine/Anuncie, Publicidade/posições/rotação, Aniversariantes,
  Financeiro/PIX/cobranças/recibos, Usuários/permissões/menus, Agenda/notificações,
  Contratos/assinatura eletrônica) entre os commits de referência e o HEAD atual:
  só diffs aditivos (migrations, novas colunas/props/actions, novos componentes) —
  nenhuma remoção ou alteração de comportamento visual/funcional já aprovado
  encontrada. Nenhuma auditoria geral nova foi refeita.

### 2. Testes antes de publicar

- 153/153 testes automatizados passando, typecheck limpo, build de `apps/site` e de
  `apps/sistema` concluídos com sucesso.
- Comparação visual real (não só HTTP 200/build): screenshots via Playwright
  (instalado temporariamente, desinstalado ao final) em desktop e mobile da
  homepage do site local (build) vs. então-produção ao vivo — equivalência visual
  pixel a pixel confirmada; checagem pontual adicional em Jornal Online e Assine.
  Nenhuma modificação de layout foi feita nesta etapa.

### 3. Sincronização GitHub

- Push único e normal da branch `consolidacao-local-20261016` (sem force, sem
  merge em main). Commit publicado e confirmado por `git fetch` +
  `git rev-parse`: `354e7837f54921d7227897a6acef543dfb145e8f`. Nenhum deploy Preview
  automático disparado (guardas em `apps/site/vercel.json`/`apps/sistema/vercel.json`
  confirmadas intactas).
- Bloqueio de autenticação do GitHub (falta do scope `workflow`, por causa de um
  commit anterior `61c944d` que tocou `.github/workflows/validate-system.yml`)
  resolvido com `gh auth refresh -h github.com -s workflow`, autorizado
  explicitamente pelo usuário via fluxo de device code.
- **Pendência de git, transparente**: depois desse único push autorizado, foi feito
  mais um commit local (`20d515d`, "chore: amplia exclusao de arquivos .env no
  gitignore" — o `vercel link` adicionou automaticamente uma linha `.env*` ao
  `.gitignore`). Esse commit **não foi enviado** ao GitHub nesta sessão (a
  autorização era para "um único push normal"); o branch local está `ahead 1` de
  `origin/consolidacao-local-20261016`. Fica para o próximo push autorizado.

### 4. Publicação manual Vercel

- Ordem seguida: `jornalir-sistema` primeiro, depois `jornalir`. Deploy manual via
  `vercel deploy --prod --yes` a partir da raiz do monorepo (necessário para que o
  "Root Directory" de cada projeto seja resolvido corretamente — deploy de dentro de
  `apps/sistema`/`apps/site` falha com "Root Directory ... does not exist").
  Nenhum Preview criado, nenhum domínio alterado, um único deploy de produção por
  projeto.
- **jornalir-sistema**: novo deployment `dpl_8y9izdXcXm5tTf98Ni7b4cuMMQjx`, URL
  `jornalir-sistema-lycdvcs4t-...vercel.app`, alias de produção
  `controle.altnix.com.br`. Build e logs verificados sem erro.
- **jornalir**: novo deployment `dpl_7KQH8kBA8MpW5XnHFQCJe4tghmk2`, URL
  `jornalir-l9hjns9fv-...vercel.app`, alias de produção `jornalir.vercel.app`.
  Build e logs verificados sem erro.
- Nenhuma migration foi executada nesta etapa (as 19 já estavam aplicadas no lote
  anterior).

### 5. Conferência pós-publicação (parcial — ver limitações abaixo)

- Sistema: `/login` → HTTP 200; `/sistema` → HTTP 307 (confirma proteção de rota).
  Screenshot da tela de login confirma renderização/branding corretos.
- Site: `/`, `/jornal-online`, `/assine`, `/noticias` → HTTP 200. Screenshots
  desktop/mobile da homepage pós-deploy equivalentes à comparação pré-deploy.
- **Limitação explícita, não maquiada**: não há sessão autenticada disponível nesta
  sessão. Por isso NÃO foi possível exercer funcionalmente (além do nível
  HTTP/redirect) as áreas protegidas do sistema — menus/permissões, Aniversariantes,
  Clientes, Publicidade (painel), Contratos/modelos, Financeiro, Agenda,
  Notificações. O mesmo vale para navegação completa/banners em rotação e ausência
  de erros de console no portal público além dos pontos já verificados por
  screenshot. **Não afirmamos teste de ponta a ponta** — isso depende de teste
  autenticado pelo responsável.
- Nenhuma operação financeira/fiscal real (NFS-e, cobrança, WhatsApp/e-mail) foi
  executada ou simulada.

### 6. Resultado

- Nenhuma regressão encontrada nas verificações possíveis sem sessão autenticada.
- Nenhum rollback necessário.
- Pendência aberta: teste funcional autenticado das áreas protegidas do sistema, a
  cargo do responsável.

Próximo lote: aguardando autorização do usuário. Nenhum novo módulo foi iniciado
  nesta etapa, conforme instruído.

## Lote — Aniversariantes: calendário semanal + personalização editorial de clientes (17/10/2026)

Commit local: `418f77c`. Layout aprovado preservado; nenhum outro módulo alterado.

- **Calendário semanal**: causa raiz confirmada — o seletor genérico `button { height:
  36px }` em `globals.css` comprimia `.aniv-week-cta` e `.aniv-day-cell`. Corrigido com
  `height: auto` + `min-height` específico para os dois componentes (52px/64px), sem
  tocar a regra genérica nem outros botões. Lógica de "quinta→quarta" (`getNewspaperWeekRange`/
  `listNewspaperWeekDays`) já estava correta — não precisou de correção, só a CSS.
  "Semana do jornal" passou a ser o filtro inicial (`period` default alterado de `"all"`
  para `"newspaper"` em `BirthdaysList.tsx`).
- **Personalização editorial para clientes**: novo botão "Personalizar perfil e
  mensagem" ao lado de "Editar nascimento/fundação no cadastro", com formulário
  compacto (cargo/instituição/como é conhecido/informações para a mensagem). Nova
  Server Action `savePersonalizedBirthdayProfile` (idempotente, nunca duplica o
  vínculo) grava só esses campos em `birthday_entries`, sem tocar `clients` nem
  nome/nascimento/fundação — `saveEditorialBirthday` continua bloqueando qualquer
  edição de registro vinculado a cliente, por isso o novo botão usa um caminho
  próprio (`savePersonalizedProfile` no componente).
  - **Falha real corrigida**: `prepareBirthdayEditionMessage` (origem "cliente") nunca
    lia `profession`/`organization`/`known_as`/`message_context` do registro editorial
    já vinculado — ficavam sempre vazios na geração automática da mensagem, mesmo
    quando a pessoa tinha fundação/instituição/apelido/contexto preenchidos via
    `makeGroups` (que já os carregava para exibição, mas não para a geração). Corrigido
    para carregar os mesmos campos antes de gerar o texto. Mensagens já preparadas ou
    editadas manualmente continuam preservadas (comportamento `old && !regenerate`
    inalterado).
  - Cadastros extraordinários (familiares/manuais) e o formulário completo de edição
    (nome/nascimento/cidade) continuam funcionando exatamente como antes.
- Testes: typecheck limpo (`npm run typecheck --workspace @ir/sistema`), 101/101
  testes de `packages/core` (não afetado, baseline confirmada), build de
  `apps/sistema` concluído com sucesso. Nenhum teste automatizado dedicado cobre
  `BirthdaysList.tsx`/`messageGenerator.ts` (não há script de teste em `apps/sistema`);
  verificação funcional desta tela depende de sessão autenticada, não disponível nesta
  sessão.

Limitações reais: não foi possível verificar visualmente a correção do calendário
  nem testar a persistência real do formulário de personalização em navegador (sem
  sessão autenticada no ambiente local) — a correção foi verificada por leitura de
  código/CSS e pelos tipos (`tsc`), não por teste funcional em tela.

Próximo lote: aguardando autorização do usuário.

## Lote — Homenagens individuais, relatório padrão do jornal e vinculação cliente↔aniversariante (17/10/2026)

Layout aprovado preservado; nenhum outro módulo alterado. Nenhuma migration aplicada
  no Supabase remoto, nenhum push/deploy.

### 1. Homenagens individuais (modal)

- Novo botão "Homenagem" em cada aniversariante, abre um `<dialog>` compacto com:
  **Outra sugestão** (reaproveita `prepareBirthdayEditionMessage`/regenerate), **Editar
  texto** (reaproveita `saveManualBirthdayMessage`), **Criar com IA** (nova),
  **Ver modelos** (nova), **Copiar mensagem** (existente). O bloco inline anterior
  (Trocar mensagem/Editar manualmente/Copiar) foi mantido como estava — o modal é
  aditivo, não substitui nada já aprovado.
- **"Ver modelos"**: biblioteca com os 44 modelos originais de `messageGenerator.ts`
  (agora expostos via `listTemplateSummaries()`/`renderTemplateByKey()`, agrupados por
  família com rótulos amigáveis em `FAMILY_LABELS`) + modelos adicionais do
  administrador. Nova tabela `birthday_message_templates` (migration
  `20261018030124_birthday_message_templates.sql`, local, não aplicada) — RLS: leitura
  por qualquer staff ativo, escrita (criar/editar) só admin/owner
  (`is_active_admin_or_owner()`), mesma convenção do projeto. **Decisão de escopo**: os
  44 modelos originais permanecem hardcoded e NUNCA editáveis (preserva o
  comportamento/testes existentes); "gerenciar modelos" cria/edita só os adicionais.
- **"Criar com IA"**: novo módulo `aiMessageProvider.ts`, chamado só a partir de uma
  Server Action (`generateBirthdayMessageWithAI`) — a pedido explícito do operador
  para UMA pessoa, nunca em lote. Provedor configurável via `BIRTHDAY_AI_PROVIDER`
  (`openai`|`anthropic`) + `BIRTHDAY_AI_API_KEY` (+ `BIRTHDAY_AI_MODEL` opcional) — a
  chave nunca é exposta ao navegador. **Sem chave configurada nesta sessão** (nenhuma
  variável foi definida) — a UI informa a limitação ("depende de configuração") e as
  demais opções do modal continuam 100% funcionais; não testado contra uma API real.
- Regras verificadas por leitura de código + script de verificação ad hoc
  (`tsx`, rodado e descartado): os 44 modelos originais continuam disponíveis; duas
  pessoas na mesma edição recebem mensagens distintas; "Outra sugestão"/"Ver
  modelos"/"Criar com IA" para uma pessoa nunca tocam a linha de outra (cada
  operação faz `upsert` só na própria `birthday_entry_id`); edição manual
  (`manually_edited`) nunca é sobrescrita automaticamente.

### 2. Relatório semanal — padrão do jornal

- Reescrito para o formato exato aprovado: três colunas DATA | NOME | CIDADE (uma
  linha por pessoa, sem título obrigatório, sem separador por dia), ordem cronológica
  e, dentro da data, alfabética. Semana editorial quinta→quarta preservada
  (`newspaperRange`). Nunca inclui a mensagem de homenagem. Continua respeitando só
  "ativo" + "autorizado a publicar" (`publishInPrint`), sem exigir mensagem
  preparada — nenhuma mudança nessa regra.
- Novo botão "Copiar relação (tabulada)" — copia `DATA\tNOME\tCIDADE` por linha via
  clipboard, para colar direto na diagramação. "Gerar relatório" (impressão) mantido.

### 3. Vinculação entre aniversariantes e clientes

- Nova tela de busca na aba "Família e aniversários" do cadastro de cliente (PF, modo
  edição): botão "Buscar aniversariantes existentes" chama a nova action
  `findBirthdayCandidates` — compara dia/mês de nascimento (sempre exato) + nome
  normalizado/tolerante a erro (reaproveita `fuzzyMatches`/`normalizeForSearch` de
  `lib/fuzzySearch.ts`, já usado na busca da tela de Aniversariantes), cidade só como
  reforço de ordenação (nunca filtro obrigatório — muitos registros não têm ano de
  nascimento). **Nunca vincula automaticamente** — só lista candidatos para
  confirmação manual ("Vincular a este cadastro").
- Nova action `linkBirthdayEntryToClient`: ao confirmar, cria a linha "cadastro"
  definitiva (mesmo padrão `id = source_client_id = group_client_id = client.id` usado
  em todo o módulo), copiando profissão/instituição/apelido/contexto/notas/foto do
  registro antigo; migra o histórico de `birthday_edition_messages` para a nova linha
  (`UPDATE birthday_entry_id`, nunca perde mensagens já preparadas/editadas); só então
  marca o registro antigo como `active=false` (soft delete — **nunca** `DELETE`
  físico, nunca sobrescreve). Qualquer falha no meio do caminho deixa o registro
  antigo intacto e informa para revisão manual, em vez de arriscar perda de dados.
- Cliente sem correspondência encontrada: nenhuma mudança necessária — a arquitetura
  já expõe automaticamente qualquer cliente PF com nascimento em Aniversariantes
  (`makeGroups`/`prepareBirthdayEditionMessage`), sem entrada manual duplicada; só
  confirmado que esse comportamento já existia e permanece.
- **Limitação real**: a importação em lote da lista externa (ainda não recebida) não
  foi implementada nesta etapa, por pedido explícito do usuário ("decidiremos juntos
  o formato"). A busca/vinculação é só a preparação individual, cliente por cliente.
  Modo "criar cliente" mostra um aviso ("disponível após salvar") em vez de buscar
  candidatos — vincular exige um `clientId` real.

### 4. Testes e verificação

- Typecheck limpo (`npm run typecheck --workspace @ir/sistema`), build de
  `apps/sistema` concluído com sucesso, 101/101 testes de `packages/core`
  (não afetado, baseline confirmada).
- Script de verificação ad hoc do `messageGenerator.ts` (via `tsx`, criado e apagado
  nesta sessão — `apps/sistema` não tem script de teste configurado): confirma as 44
  mensagens originais, mensagens distintas para duas pessoas, "trocar mensagem" sem
  repetir o próprio texto anterior, substituição de placeholders de modelo
  customizado, e elegibilidade de modelo específico.
- **Não testado** (sem sessão autenticada nem Supabase local nesta sessão): persistência
  real em banco das novas actions (`pickBirthdayMessageTemplate`,
  `generateBirthdayMessageWithAI`, `savePersonalizedBirthdayProfile`,
  `findBirthdayCandidates`, `linkBirthdayEntryToClient`, CRUD de
  `birthday_message_templates`), geração real por IA (sem chave configurada), e o
  fluxo completo de vinculação ponta a ponta em tela. Essas verificações dependem de
  teste autenticado pelo responsável.

Próximo lote: aguardando autorização do usuário.

## Handoff complementar — Assistente IR, 18/10/2026

O usuário confirmou que o Codex sincronizou a branch oficial `consolidacao-local-20261016` até `a3d506ad6053a4cc54fb3f0ac5b26250591435d5`, com um único push fast-forward e sem deploy. Essa confirmação substitui os snapshots antigos deste arquivo que ainda falam em commits não enviados.

O ChatGPT abriu `feature/assistente-ir-base-20261018` a partir desse SHA e implementou uma PRIMEIRA ETAPA apenas em branch isolada: configuração do provedor OpenAI/Claude, cofre criptografado, modos por módulo, interruptor geral server-side, página de proprietário, estrutura de solicitações de aprovação ainda SEM executor e integração do gerador individual de homenagens com a nova configuração. A migration `20261018030210_ai_assistant_base.sql` NÃO foi aplicada. Ainda não há chaves, jobs autônomos, aprovações executáveis ou testes autenticados/build dessa branch. A integração com Vercel/produção não foi feita.

**Registro de cada commit e roteiro de sincronização:** `docs/REGISTRO-DE-ENTREGAS.md`. Não repetir todo o trabalho nem integrar parcialmente. Primeiro verificar `git status -sb`, `git fetch origin` e os dois históricos; se fast-forward seguro, incorporar todos os commits na pasta oficial e então rodar typecheck/build/testes. Nunca alterar backups/branches antigas nem aplicar migrations sem autorização.

## Assistente IR — lote 2 GitHub (18/10/2026)

- Feito em branch separada: teste MANUAL das chaves OpenAI/Claude via endpoint de listagem de modelos; resumo sob demanda e somente leitura (Financeiro/solicitacoes Site/Agenda), sujeito ao interruptor geral e aos controles por modulo, sem chamadas de IA.
- Foi adicionada protecao para nao tratar dados de demonstracao como dados reais.
- Nenhuma automacao, aprovacao executavel, dado pessoal em prompt, alteracao financeira ou notificacao automatica implantada.
- Nenhuma migration remota, deploy ou sincronizacao do VS Code efetuada.
- Necessita integrar HEAD completo da feature quando Claude/Codex retornar, compilar, testar RLS e exercitar com login real.
- **Commits individuais e pendencias:** `docs/REGISTRO-DE-ENTREGAS.md` (sempre consultar a versao MAIS NOVA pelo HEAD remoto).


## Publicação de produção autorizada — 18/10/2026 (Assistente IR / Aniversariantes)

- **PRODUÇÃO REAL:** `controle.altnix.com.br` aponta para Vercel `dpl_4eLiZNh8J5JRdrBz3xjxRewbTi2c` (READY), código SHA `948060c18c47158cb4e8f8f8acf2c201ef876237`, origem `feature/assistente-ir-base-20261018`. Build Next/TypeScript terminou com sucesso. Site público não foi republicado.
- **SUPABASE REAL:** 2 migrations aplicadas e verificadas — `20261018030124_birthday_message_templates.sql` e `20261018030210_ai_assistant_base.sql` (versões conforme lista real do Supabase; arquivos SQL renomeados na branch feature no commit `20295a0` sem mudar seu conteúdo).
- **VERCEL SECRETS:** `AI_CONFIG_ENCRYPTION_KEY` configurada pelo proprietário como Sensitive em Production, presença verificada; valor não acessado. Chaves OpenAI/Anthropic serão cadastradas pelo proprietário no painel, NÃO recebidas no chat. Assistente IR desativado por padrão.
- **PENDENTE TESTAR:** autenticação e fluxos reais Aniversariantes, modelos editoriais e IA; permissões de owner, escrita de segredos cifrados e troca de provedores, resumo operacional, integrações. Nenhum teste E2E autenticado ainda. Nenhuma automação autônoma implantada.
- **OPERACIONAL:** não atualizar o VS Code até o próximo uso de Claude ou Codex. Consultar `docs/REGISTRO-DE-ENTREGAS.md` (contém todos os commits e ID de deploy). Novo trabalho em feature não altera versão já publicada sem outro deploy autorizado.

## 18/10/2026 — CONTINUIDADE IA: conversa, módulos e propostas (ainda sem deploy)

- Branch: `feature/assistente-ir-base-20261018` (somente GitHub; VS Code e `consolidacao-local-20261016` intocados).
- Produção Vercel continua em `948060c`, anterior às melhorias do menu/chaves/modelos/switch e à conversa IA.
- Implementado desde essa publicação: menu Assistente IR owner desktop/mobile, lista de modelos com catálogo API, cofre com diagnóstico visível, chave digitável, switch Liga/Desliga, nova conversa real `/sistema/assistente-ir` com OpenAI Responses / Anthropic Messages, síntese agregada de oito módulos permitidos com RLS, auditoria de tokens, central `/sistema/assistente-ir/propostas` para registrar/aprovar/recusar sugestões SEM executar operações.
- Camada de proteção: proprietário ativo e autenticação validada em Server Actions, global ON + módulo ON + cofre, limites de entrada e saída, timeout, nenhum dado individual enviado automaticamente, logs de auditoria sem texto pessoal, nenhum operador pode ler segredo.
- CI: workflow `validate-system.yml` temporariamente habilitado para a branch e removido posteriormente (`be803e5`, `fcee156`); primeiros builds passaram, conferir workflow mais recente `39129277867` antes de declarar a versão final validada.
- FALTAM: confirmação da troca/validade de `AI_CONFIG_ENCRYPTION_KEY` no runtime da Vercel (variável existe mas o código publicou mensagem de cofre indisponível), cadastro das chaves nas configurações, teste com APIs reais, testes owner/RLS com sessão, CI final e publicação com autorização. **Rotinas autônomas com agendamento e executores que alteram outros módulos ainda não foram implementados**. A aprovação de proposta é só revisão.
- Documentação com todos os commits, critérios de teste e sequência: `docs/REGISTRO-DE-ENTREGAS.md` (consultar HEAD vigente).

## 18/10/2026 — Diagnóstico confirmado da conexão GPT e navegação de Assistente IR

- Chave OpenAI armazenada no cofre. Logs de auditoria no Supabase confirmam dois testes de autenticação OpenAI com **HTTP 200** em 13:12:03Z e 13:12:22Z. Resultado não aparecia próximo ao botão, pois UI exibiu confirmação apenas no rodapé das configurações.
- Banco `ai_assistant_settings.enabled=false`: visual do botão "LIGADO" era apenas estado local pendente; salvar todas as configurações no final da página para persistir, inclusive modo por módulo.
- Corrigido na branch `feature/assistente-ir-base-20261018`: `df1b1e8` feedback de salvar/testar junto ao botão e aviso de alterações não salvas; `5bebcf8`, `79039ef`, `30d9d62` subgrupo visual Assistente IR desktop/mobile, sem rebatizar personalidade.
- CI `https://github.com/altnixtecnologia/jornalir/actions/runs/39131103349`: SUCCESS (SHA `833fd83`). Gatilho CI temporário removido em `f22b621`.
- **Pendente:** a correção **não foi publicada**. Usuário decide nome público sugerido `Íris` e autoriza futuro deploy, após o qual validar feedback da UI, salvamento efetivo das configurações, geração de texto e limites. Nenhuma alteração no VS Code, banco ou segredo neste lote.

## 18/10/2026 — JoIR: controles compactos e identidade visual (sem deploy)

- O usuário pediu "Provedor | Modelo | Atualizar modelos" na mesma linha e sugeriu nome `JoIR` para o assistente que futuramente atenderá leitores.
- Código na branch `feature/assistente-ir-base-20261018`: `86ca1c3` ajusta o layout flexível e responsivo; `a5c9da4` a `ba6debb` alteram somente o nome apresentado para `JoIR` nas telas privadas, menu/subgrupo e instrução de identidade das respostas (rotas e APIs preservadas).
- Preview de leitor/site público não foi desenvolvido; só futuramente poderá acessar material público, nunca dados privados do administrador.
- Workflow `39131917195` em avaliação; acionamento temporário `9baff8c` revertido em `93ece9d`; conferir conclusão.
- Produção: `d92625f`; atualizações deste lote e feedback dos botões NÃO publicadas. Após CI, obter autorização para único deploy, homologar o visual/feedback da API e o salvamento geral (nenhuma chave precisa ser cadastrada de novo).

## 18/10/2026 — JoIR — cartões de chaves OpenAI e Claude (aguardando deploy)

- Nova solicitação: status lado a lado e destacado: OpenAI / GPT e Anthropic / Claude, indicando cadastrada/não cadastrada e provedor efetivamente salvo em uso. Pode salvar ambas as chaves no cofre; a JoIR usa apenas uma API de cada vez, conforme configuração global salva. Não há escolha por módulo nem execução paralela.
- UI ajustada em `apps/sistema/src/features/configuracoes/AiAssistantSettingsPanel.tsx` commit `d7390f2`, cartões responsivos lado a lado no desktop e um abaixo do outro no celular, sem revelar segredos.
- CI em `https://github.com/altnixtecnologia/jornalir/actions/runs/39132372563` aguardando confirmação; CI habilitado temporariamente em `6498f1d2` e restaurado em `052610bd`.
- Produção não alterada (`d92625f`). Mudanças de JoIR, layout compacto do provedor, feedback de conexão e cartões de status aguardam publicação agrupada quando autorizada.

## JoIR publicado 18/10/2026 — pós-deploy e próximos testes

- Última produção `controle.altnix.com.br`: commit `ad8724048bddcabfb38211fe7bd60d956d2d1b7c`, deploy Vercel `dpl_A5sniiEiPKuRscHj18yVL6zBdgAq` **READY**, domínio/alias verificado sem erro, projeto `jornalir-sistema`.
- Branch fonte: `feature/assistente-ir-base-20261018`. Em comparação com produção anterior `d92625f`, todos os 29 commits adicionais de JoIR em 12 arquivos foram publicados; nenhuma migration necessária. CI automatizado SUCCESS `39132372563`.
- Funcionalidades JoIR incluídas: menus agrupados, nome, layout compacto Provedor | Modelo | Atualizar, cartões OpenAI/Claude e escolha de provedor único, mensagens de confirmação de chaves/conexão, switch com aviso de alteração não persistida, conversa com IA, auditoria de tokens, central de propostas sem execução de tarefas.
- Consultas banco após publicação: só há credencial OpenAI; Anthropic não cadastrada. Configuração global `enabled=false`, modelo `gpt-4o-mini`, TODOS os módulos `off`. OpenAI teve autenticação API HTTP 200 anteriormente; geração de texto REAL ainda não validada.
- Próximo passo é **homologação com login owner**, NÃO refazer código: entrar em `https://controle.altnix.com.br/sistema/configuracoes/assistente-ir`; opcionalmente registrar chave Claude e testar; ligar JoIR, habilitar módulo em Assistido e clicar salvar no fim da página; abrir `/sistema/assistente-ir`, perguntar, conferir tokens e erro; revisar central de propostas; testar a visualização em desktop/mobile. Sem atualização adicional na Vercel até apontar falha concreta.
- Restrições: IA ainda não roda tarefas agendadas/autônomas ou executa mutações sensíveis; chatbot para leitores do portal não foi implementado. Site público, Supabase, segredos, branch oficial VS Code intocados no deploy.

## 18/10/2026 — Próximo passo HTTP 400 JoIR: persistir OpenAI ativo

- Problema de confusão entre provedor escolhido na UI e provedor SALVO: screenshot mostra `OpenAI / GPT` selecionado, mas cartão `Claude em uso pela JoIR`; banco confirma `enabled=true, provider=anthropic, model=claude-haiku-4-5`, apenas `agenda` e `site` assistidos. Ambos segredos já salvos.
- Nova chave OpenAI salvada 14:02:53Z, autenticação do catálogo testada HTTP 200 14:02:58Z. Conversa HTTP 400 vista antes, potencialmente da Anthropic; não repetir armazenamento de segredos e não atribuir origem incorreta.
- Próximo teste sem código/deploy: selecionar OpenAI e gpt-4o-mini, clicar SALVAR CONFIGURAÇÕES no fim, recarregar, confirmar cartão OpenAI em uso, testar prompt curto. Se erro persistir, diagnosticar HTTP da geração pelo provedor realmente salvo, sem expor API keys.

## 18/10/2026 — JoIR HTTP 400 Anthropic: contexto salvo e diagnóstico seguro pendentes de publicação

- Banco confirmado: JoIR ligada, `provider=anthropic`, `model=claude-haiku-4-5`, módulos site e agenda Assistido; o HTTP 400 exibido era da Anthropic e não do GPT. Identificador de modelo é válido pela documentação da Claude API; causa exata não identificada. 400 pode indicar corpo inválido ou limite de gastos.
- Branch `feature/assistente-ir-base-20261018` corrigiu: `9a94390` geração agora retorna diagnóstico seguro por tipo de erro sem expor resposta integral; `e0e1d61` + `2749c8d` exibem provedor/modelo salvos antes de o usuário enviar mensagem. CI `39135212430` pendente de resultado, gatilho extra de CI já removido.
- Próximo passo: conferir final de CI, solicitar autorização de deploy, verificar visualmente faixa do provedor e testar uma única pergunta para obter classificação real do erro Anthropic; alternativamente verificar credits/spending limits em `https://platform.claude.com/settings/billing` sem mostrar detalhes de pagamento.
- Produção `ad87240` não foi atualizada neste lote; evitar alterações de keys, migrações e VS Code.

## CONTINUIDADE SITE PÚBLICO — 18/10/2026

- Usuário encerrou desenvolvimento ativo da JoIR por depender de créditos API pagos e **priorizou lançamento do site público**. Não apagar JoIR, segredos ou migrações; não contratar créditos ou novas integrações de IA.
- Site Vercel `jornalir` Production SHA `354e783`, domínio `jornalir.vercel.app`. Projeto separado `jornalir-sistema` em `controle.altnix.com.br`. Até antes deste lote não havia diferenças em `apps/site/` na branch mais recente em relação à versão publicada.
- Nova branch de trabalho `feature/site-lancamento-editorial-publicidade-20261018`, com base no HEAD da JoIR, preservando histórico sem modificar VS Code/main/branch oficial. Mudanças não publicadas: homepage e artigo mostram anúncios em tablets (CSS `xl:hidden`), links patrocinados rotulados, SEO dinâmica por artigo e metadataBase para futuro domínio final. Commits: `300fcee`, `a969768`, `e1ddf1a`, `672b02e`, `ff5f876`.
- Dados reais do Supabase (somente leitura): 23.365 artigos públicos; 8+3+7+4 destaques; patrocinadores: slots 1–2 geridos com 2 mídias cada, slots 3–6 ativos mas dependentes de fallback legado. Última publicação no view: 12/10/2026.
- CI iniciado no GitHub Actions run `39137183679`, aguardando conclusão no momento desta anotação; gatilho extra do CI restaurado no commit `beb4292`. Site PROD não atualizado, sem SQL, sem arquivos locais.
- Prioridades: homologar fluxo de matéria real (status, galeria, capa, editoria, datas, busca e share), seis patrocinadores em desktop/tablet/mobile e respectiva validade, mobile/desktop, jornal online PDFs, campanha comercial/Assine-Anuncie, performance e SEO/sitemap/robots, domínio final. NÃO lançar publicamente antes de QA, domínio e autorização expressa.
- Registros e próximos critérios completos: `docs/REGISTRO-DE-ENTREGAS.md` seção SITE PÚBLICO. Codex/Claude só sincronizam pasta VS Code quando retomados; integrar HEAD completo da branch específica do site com checagem de divergência, sem cherry-picks ou force push.

## APP / PUSH / IMPORTAÇÃO DO SITE OFICIAL — 18/10/2026

- Proprietário solicitou app do site com leitura das matérias do portal e duas categorias de notificações no celular (normais segundo o aparelho, URGENTES com som autoral parecido em comportamento com apps de varejo), mais importação das últimas notícias do site oficial antigo. **Deseja que a Claude realize o trabalho no VS Code, mas PRIMEIRO exige sincronização segura dos commits do GitHub com a pasta local**, sem perder dados ou alterar produção. Vai cadastrar 2 imagens por posição publicitária para teste.
- AUDITORIA: `apps/site` já é PWA com manifest, SW v2 e UI de consentimento Web Push; backend `apps/sistema` já tem `/api/public/push`, `/api/cron/push`, envio comum/urgente com VAPID, env de servidor existente, mas **não há inscrições públicas nem eventos em produção**, e `apps/sistema/vercel.json` não agenda cron. Som próprio não é confiável em PWA; recomendação futuro `apps/mobile` Capacitor + FCM/APNs com arquivo de toque autoral nativo, respeitando silêncio/foco. Não existe `apps/mobile` hoje, apenas plano.
- SITE LEGADO: `https://informativoregional.net` (CMS Suita Sistemas) lista matérias publicadas até 13/10/2026, enquanto visão do novo banco retornou 23.365 artigos públicos com `max(published_at)=12/10/2026`. Candidato a lacuna: matéria sobre incêndio em Santa Rosa do Sul de 13/10. Importar só itens novos após detecção de URL/fingerprint duplicado, revisão e RASCUNHO, sem autopublicar. Não assumir REST WP/RSS sem verificar.
- PREPARADO para Claude no GitHub: `docs/PLANO-APP-PUSH-E-SINCRONIZACAO-MATERIAS-20261018.md` commit `80627db`, com plano técnico e checklist, inclusive **Lote 0: somente sincronizar VS Code** de `origin/feature/site-lancamento-editorial-publicidade-20261018` após git status/ancestralidade, sem reset/stash/force/push/deploy nem novos códigos até conferir SHA. Depois importar últimas matérias em dry-run (Lote 1) e só implementar rascunhos se aprovado.
- Publicidade: slots 1 e 2 já possuem 2 imagens públicas cada; ao subir mais 2 não substitui automaticamente, total pode subir a 4. Slots 3–6 dependem fallback local antigo até serem geridos pelo painel. Conferir em desktop/tablet/mobile.
- Não há modificações de código executável neste lote de documentação e nenhuma aplicação/distribuição de app, deploy ou alteração de dados.

## CONFIRMAÇÃO APP/LEGADO/PATROCINADORES — 18/10/2026 14:57

- Usuário confirmou: no aplicativo, preferências de notificação `normal=true`, `urgent=true` por padrão na **interface**, com página de opções para desligar uma/ambas; sistema operacional ainda deve receber autorização explícita para envio. Dois canais de som — urgente exclusivo só no app nativo, não garantido em PWA.
- Verificação direta banco após upload: `public_site_ad_media` **2 imagens em cada posição de 1 a 6 (total 12)** e `public_site_ad_slots` seis posições `active=true, managed_by_panel=true, has_media=true`. Próxima tarefa apenas QA de anúncios, não recriar upload. Essa confirmação substitui o diagnóstico anterior de fallback legado para posições 3–6.
- Importar matérias só **incrementalmente**, da última efetivamente cadastrada no novo portal até a última atualmente disponível em `informativoregional.net`, comparar para não duplicar e reaproveitar métodos/scrips usados anteriormente; primeiro dry-run e aprovação, depois rascunhos/revisão. Não usar 13/10 como limite fixo e não começar sem sync do VS Code.
- Plano `docs/PLANO-APP-PUSH-E-SINCRONIZACAO-MATERIAS-20261018.md` atualizado no commit `17078df`. Usuário ainda NÃO mandou instrução anterior à Claude. **Pode enviar exatamente aquela mensagem de Lote 0 (sincronizar somente; aguardar relatório)**, que já aponta para o documento atualizado e branch correta. Preservar restrição sem reset/stash/push/deploy.

## EDITORIAS — correção de alinhamento e prompt da Claude reenviado

- Captura do usuário (18/10) demonstra divisórias fora de alinhamento no módulo Editorias. O bug foi localizado no componente: classe `materia-title` com `display:block` estava aplicada ao próprio `<td>`. Commit `190c42a` transfere classe para `<span>` interno do `td`, restaurando display table-cell. Commit `653112d` adiciona alinhamento vertical específico CSS `.editorias-table tbody td`.
- Workflows validados em `https://github.com/altnixtecnologia/jornalir/actions/runs/39138671694` (conferir resultado); gatilho temporário já restaurado. Sem deploy, banco ou VS Code alterados.
- Usuário NÃO havia enviado comando de sincronização à Claude. Foi reenviado integralmente nesta conversa, apontando para `feature/site-lancamento-editorial-publicidade-20261018` e docs. Etapa Claude 0: somente status/remote/fetch/ancestralidade/ff-only seguro, parar se divergências ou arquivos locais, relatório, aguardar autorização. **NÃO iniciar importação no mesmo comando**.
- Continuação após relatório Claude: inspecionar se toda branch chegou ao VS Code e só depois orientar Claude a reaproveitar rotina anterior de importação incremental do site oficial antigo, comparando notícias faltantes até última publicada. Patrocinadores já têm 2 imagens em cada slot (12 total).

## LOTE 1 — Dry-run do sync incremental do site legado (18/10/2026)

**Branch/HEAD após este lote:** `feature/site-lancamento-editorial-publicidade-20261018`, HEAD `980eca20e2c681f17f1246048b3547d6341b71f2` (fast-forward trazido no início deste lote; só 1 commit de documentação à frente do relatado anteriormente, `28fc8711`).

- **Reaproveitado o importador incremental existente**, exatamente como instruído — nenhuma rotina nova de coleta/dedup/classificação foi criada. Usados `scripts/legacy-audit/sync-recent.mjs` (preflight, sem `--commit`) e sua biblioteca (`lib/importer.mjs`, `lib/pipeline.mjs`, `lib/identity.mjs`, `lib/parse.mjs`, `lib/batches.mjs`, `lib/integrity.mjs`).
- Única mudança de código: 2 palavras-chave `export` adicionadas a `findCutoff`/`crawlCategoryRecent` em `sync-recent.mjs` (nenhuma mudança de comportamento) + guarda de entry-point (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`) para esse arquivo não re-executar seu próprio `main()` quando importado por outro script — sem a guarda, importar as duas funções disparava um preflight completo duplicado como efeito colateral (detectado nesta sessão; **ambas as execuções concordaram exatamente nos números**, então não houve risco de dado incorreto, só trabalho duplicado).
- Novo script **somente leitura** `scripts/legacy-audit/report-sync-recent.mjs` (mesmo padrão documentado em `lib/pipeline.mjs`: "scripts de relatório humano, report-*.mjs") — serializa por matéria o que o preflight original não grava em arquivo: título, data/hora original, editoria legada→destino, URL de origem, situação no banco novo, imagens e inconsistências. Gera `docs/LEGADO-DRY-RUN-sync-recent-20261018.md` (753 linhas) + JSON completo em `scripts/legacy-audit/output/` (gitignored).
- **`npm install` executado em `scripts/legacy-audit/`** (node_modules local estava ausente; dependências já declaradas em `package.json`/`package-lock.json` existentes, nenhuma adicionada).

### Resultado do dry-run (18/10/2026, ~15h UTC)

| Métrica | Valor |
|---|---|
| Última matéria já existente no banco (corte do sync) | "BALNEÁRIO ROSA DO MAR PROMOVE FESTA EM HOMENAGEM AO DIA DAS CRIANÇAS EM PASSO DE TORRES" — 11/10/2026 21:10:00Z |
| Período comparado no site legado | 11/10/2026 a 17/10/2026 (mais recente encontrado no instante da coleta) |
| Itens encontrados no legado (todas as editorias, antes de deduplicar) | 240 |
| Candidatas únicas no intervalo | 61 |
| **Já existem no banco novo** (só mídia a reconciliar, nunca recriadas) | **5** |
| **Novas elegíveis para importar** | **56** |
| Precisam de revisão manual | 0 |
| Em quarentena editorial | 0 |
| Rejeitadas (falha de busca) | 0 |
| Exceções de data | 0 |

Relatório completo (cronológico, por matéria): `docs/LEGADO-DRY-RUN-sync-recent-20261018.md`. Editorias cobertas: geral, esportes, política, saúde, sociais, agricultura, policia, colunistas (4 subcategorias) — `classificados` corretamente excluída (nunca importada automaticamente, mesma regra de sempre). Nenhum INSERT/UPDATE/DELETE no Supabase, nenhum upload/exclusão no R2, nenhuma publicação, nenhuma notificação, nenhum push, nenhum deploy.

### ACHADO CRÍTICO — `--commit` publica direto, NÃO cria rascunho (precisa decisão antes do Lote 2)

Verificado no código (não presumido): `scripts/legacy-audit/lib/importer.mjs` linha ~417 chama a RPC
`legacy_import_article` passando explicitamente `status: "published"`; a própria RPC
(`supabase/migrations/20261003100000_legacy_import_atomic_rpc.sql`, linha 41) usa
`coalesce(article->>'status', 'published')` — ou seja, mesmo sem esse campo o padrão
já seria "published". **Isso contradiz o texto do
`docs/PLANO-APP-PUSH-E-SINCRONIZACAO-MATERIAS-20261018.md`** ("gerar RASCUNHO no CMS
do novo portal... não publicar automaticamente") e a própria instrução desta tarefa
("sem... publicar automaticamente"). Rodar `sync-recent.mjs --commit` hoje publicaria
as 56 matérias **direto ao vivo no site público**, sem etapa de revisão.
Comparar com `supabase/migrations/20261012100000_pdf_import_atomicity_and_safety.sql`
(fluxo de importação de PDF do jornal impresso), cuja RPC hardcoda `status=draft`
propositalmente ("status/origin/... hardcoded (rascunho...)") — ou seja, existe
precedente no próprio projeto de um fluxo "importa como rascunho" que o importador
do site legado NÃO segue.
**Nenhuma mudança de código foi feita para corrigir isto** (fora do escopo desta
etapa, só dry-run/relatório) — decisão do usuário necessária antes do Lote 2: (a)
ajustar o importador para `status: "draft"` antes de qualquer `--commit`, ou (b)
confirmar que publicação direta é aceitável para este lote específico.

### Ponto de continuidade — NÃO PERDER

- **Próximo passo, só após autorização explícita do usuário E resolução do achado
  crítico acima:** rodar `sync-recent.mjs --commit` para importar as 56 matérias
  elegíveis (cria a matéria + reconcilia mídia das 5 já existentes) — ver
  `docs/PLANO-APP-PUSH-E-SINCRONIZACAO-MATERIAS-20261018.md`, Lote 2.
- O usuário pediu para **conferir os resultados primeiro** antes de qualquer
  importação real — aguardar revisão do relatório
  `docs/LEGADO-DRY-RUN-sync-recent-20261018.md` linha por linha (ou amostra) e a
  decisão sobre o achado crítico antes de autorizar `--commit`.
- Pendências dos lotes anteriores (Web Push/app nativo, QA de publicidade 6 posições, domínio final do site) permanecem em aberto, sem relação com este lote — ver seções "APP / PUSH / IMPORTAÇÃO" e "CONTINUIDADE SITE PÚBLICO" acima.

## LOTE 2 — Importador corrigido para RASCUNHO + testes (18/10/2026, sem --commit)

Decisão aprovada pelo usuário: todas as matérias novas do sync incremental entram
como `status="draft"`, nunca publicadas automaticamente. Resolve o achado crítico do
Lote 1. **Nenhuma importação real executada** — só preparação, testes locais e novo
dry-run, exatamente como autorizado.

### Arquivos modificados

- `scripts/legacy-audit/lib/importer.mjs`: `importCandidate` agora exige
  `opts.targetStatus` ("draft" ou "published") e `opts.callerLabel` — **rejeita
  imediatamente** (antes de qualquer leitura/escrita no Supabase) se o valor estiver
  ausente ou inválido (item 1 e item 5 da tarefa). `published_at` continua sendo a
  data ORIGINAL da matéria (nunca a da importação), agora preservada também quando
  `targetStatus="draft"` — é isso que permite ao item 2 funcionar (ver abaixo).
- `scripts/legacy-audit/sync-recent.mjs`: define `SYNC_RECENT_TARGET_STATUS = "draft"`
  como constante literal (nunca lida de CLI/env, para não poder ser trocada por
  parâmetro ausente/errado); passa a chamar `importCandidate` com esse valor. Novo
  flag `--reconcile-existing`: por padrão, as 5 matérias já existentes **não são
  tocadas** em `--commit` nenhum (item 4) — só entram se esse flag for passado
  explicitamente numa execução futura e autorizada separadamente. O modo preflight
  (sem `--commit`) agora também SIMULA item a item a criação (dry-run real via
  `importCandidate({dryRun:true,...})`), confirmando por execução — não só por
  leitura de código — que cada uma das 56 entraria como rascunho. Corrigido também um
  bug de efeito colateral (reexecução indevida de `main()` ao importar
  `findCutoff`/`crawlCategoryRecent` de outro script) com uma guarda de entry-point.
- `scripts/legacy-audit/migrate.mjs`: atualizado para passar
  `targetStatus: "published"` explicitamente (migração histórica — acervo que já
  esteve público por anos, decisão arquitetural preexistente e preservada, nunca
  rascunho) — sem isso, o novo guard em `importCandidate` bloquearia até o
  importador histórico.
- `packages/core/src/editorial/article-service.ts`: **item 2** —
  `ArticleService.publishNow()` agora preserva `publishedAt` já existente em vez de
  sempre sobrescrever com "agora". Antes desta correção, quando um editor aprovasse e
  clicasse "Publicar" num rascunho importado do legado, a data original seria
  perdida e substituída pela data do clique. Verificado que isso NÃO afeta nenhum
  fluxo existente: rascunho manual e importação de PDF nunca chegam com
  `publishedAt` pré-definido (confirmado lendo `ArticleService.saveDraft`/
  `importAsDraft` e a RPC de PDF, `pdf_import_atomicity_and_safety.sql`), então o
  comportamento de ambos continua idêntico (usa "agora" por não ter data prévia).
- Testes novos: `scripts/legacy-audit/lib/importer.test.mjs` (6 casos, `node --test`,
  script `npm test` adicionado a `scripts/legacy-audit/package.json`) e
  `packages/core/test/article-service-publish-date.test.ts` (2 casos, adicionado ao
  script `test` de `packages/core/package.json`).

### Resultados dos testes (rodados localmente, sem rede/Supabase/R2 reais nos testes)

- `scripts/legacy-audit`: **6/6** — cobre: `targetStatus` ausente/inválido rejeita
  antes de tocar o banco; dry-run nunca chama a RPC; `targetStatus="draft"` grava
  `status=draft` e preserva a data original em `published_at`
  (`article_external_sources.original_published_at` bate exatamente com
  `articles.published_at`); `targetStatus="published"` (uso exclusivo da migração
  histórica) continua funcionando; uma chamada mal configurada nunca chega a tocar
  uma matéria já existente.
- `packages/core`: **103/103** (101 da baseline + 2 novos) — `publishNow` usa "agora"
  quando não há data prévia (comportamento de sempre, sem mudança); `publishNow`
  preserva a data original quando ela já existe (caso novo, legado).
- `npm run typecheck` (site + sistema): limpo. `npm run build` (site + sistema):
  concluído com sucesso, sem erros.

### Novo dry-run (confirmação pedida pelo usuário)

Executado de novo contra o site legado real (sem `--commit`): mesmos números do Lote
1 (240 encontrados, 61 candidatas, 5 já existentes, 56 novas elegíveis, 0 revisão/
quarentena/rejeitadas — nenhuma mudança no acervo legado entre as duas execuções).
A nova simulação item a item imprimiu, para cada uma das 56, a linha
`[dry-run] criaria (status=draft) matéria "..."` — confirmação real de que TODAS
entrariam como rascunho, nenhuma publicada automaticamente. **Nada foi gravado**
(mesmo arquivo de preflight, `mode: "preflight"`, sem RPC/R2 chamados). As 5
matérias já existentes não foram processadas nesta simulação (só as novas elegíveis
passam por `importCandidate` no modo preflight) — permanecem **intactas**, sem
nenhuma leitura/escrita de mídia ou dado além da detecção de existência já feita no
Lote 1.

### Confirmações pedidas pelo usuário

1. ✅ Importador corrigido: `status: "draft"` explícito, sem depender do default da função SQL.
2. ✅ Data original preservada em `article_external_sources.original_published_at` E
   agora também corretamente mantida quando a matéria for aprovada/publicada depois
   (fix em `ArticleService.publishNow`).
3. ✅ Confirmado (leitura de código + teste): nenhum destaque (`article_placements`
   nunca recebe linha pelo importador), nenhuma notificação push
   (`notification_mode` nunca é setado pelo importador, fica no default `'none'`),
   nenhuma publicação automática (`status=draft`, invisível na view pública
   `public_articles`, que filtra `where status = 'published'`).
4. ✅ As 56 novas e as 5 existentes agora têm caminhos de código SEPARADOS; as 5
   existentes só seriam tocadas com `--reconcile-existing` explícito, não usado nesta
   sessão — permanecem intactas.
5. ✅ Proteção implementada e testada: `targetStatus` ausente/inválido interrompe a
   execução ANTES de qualquer chamada ao Supabase/RPC, em qualquer chamador.

### Migrações necessárias

**Nenhuma.** O schema já suporta `status='draft'` com `published_at` preenchido
(nenhuma CHECK constraint liga as duas colunas) e `origin='legacy_site'` já é um
valor aceito desde `20261001100000_legacy_migration_preparation.sql`. Toda a correção
foi só em código de aplicação (scripts + `packages/core`).

### Ponto de continuidade — NÃO PERDER

- Branch/HEAD após este lote: `feature/site-lancamento-editorial-publicidade-20261018`
  (commit local deste lote a seguir; ver `git log` para o SHA exato — nenhum push
  feito).
- **Próximo passo, só após nova autorização explícita:** rodar
  `node --env-file=.env.local scripts/legacy-audit/sync-recent.mjs --commit` para
  criar de verdade as 56 matérias como rascunho (as 5 existentes continuam de fora,
  a menos que `--reconcile-existing` seja explicitamente autorizado em separado).
  Depois, revisão editorial manual de cada rascunho antes de publicar individualmente
  (cada "Publicar" vai preservar a data original, graças ao fix desta etapa).
- Nenhuma matéria foi criada, nenhuma mídia enviada ao R2, nenhum push/deploy.

## LOTE 3 — IMPORTAÇÃO REAL executada (18/10/2026) — 56 matérias publicadas

**Decisão definitiva do proprietário** (reverteu a decisão temporária do Lote 2):
as matérias novas do sync incremental nascem `status=published` direto —
comportamento histórico das importações do site legado. Commit de código
`7b68bfd` (novo flag `--publish-recent`, explícito, nunca default implícito —
sem ele o script continua em `draft` mesmo com `--commit`). Preflight re-executado
contra o site real ANTES da importação: números idênticos aos dois dry-runs
anteriores (240 encontrados, 61 candidatas, 5 existentes, 56 novas elegíveis, 0
exceções/revisão/quarentena) — sem mudanças no acervo legado entre as execuções,
autorizado seguir para a importação real.

### Importação real executada

Comando: `node --env-file=.env.local scripts/legacy-audit/sync-recent.mjs --commit --publish-recent`
(sem `--reconcile-existing` — as 5 matérias já existentes propositalmente fora).

```json
{ "imported": 56, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 168, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 0 }
```

**0 falhas, 0 matérias puladas, 0 imagens com falha.** Relatório completo salvo em
`scripts/legacy-audit/output/sync-recent-2026-10-18T16-31-40-512Z.json` (fora do
repositório Git, pasta `output/` gitignored).

### Verificação final obrigatória (consulta direta ao Supabase, não presumida)

| # | Item | Resultado |
|---|---|---|
| 1 | Matérias criadas com `status=published` | **56 novas** (confirmado: `articles` com `status=published` subiu de 23.365 para 23.421 — delta exato +56; `article_external_sources` do provider subiu de 23.440 para 23.496 — delta exato +56, nenhuma duplicada) |
| 2 | Aparecem na visualização pública | **61/61** (as 56 novas + as 5 já existentes) presentes na view `public_articles` (que filtra `status=published`) |
| 3 | Datas originais preservadas | **0 divergências** — `articles.published_at` idêntico a `article_external_sources.original_published_at` em todas as 61 linhas da janela (11/10 a 17/10) |
| 4 | Referência à origem no site antigo | **61/61** com `origin=legacy_site` + linha em `article_external_sources` (URL, `external_id`, `original_published_at`) |
| 5 | Imagens importadas e vinculadas | **168 imagens enviadas ao R2 e vinculadas** às 56 novas matérias (0 falhas); todas as 61 matérias da janela têm pelo menos 1 imagem vinculada (193 vínculos totais na janela, incluindo os 25 já existentes das 5 antigas, nunca tocados nesta execução) |
| 6 | As 5 matérias existentes permaneceram intactas | **Confirmado** — `updated_at` de cada uma das 5 idêntico ao valor capturado ANTES da importação (snapshot comparado byte a byte); nenhuma delas foi processada nesta execução (log confirma: "5 matéria(s) já existente(s) NÃO serão tocadas") |
| 7 | Notificações/destaques | **0 notificações, 0 destaques** — todas as 61 com `notification_mode=none`; 0 linhas em `article_placements` para qualquer uma das 61 |

### Exemplos de URLs publicadas (amostra, não a lista completa)

- `/noticias/campanha-crianca-feliz-promoveu-tarde-de-brincadeiras-e-diversao-em-sao-joao-do--15486424` — nova
- Lista completa de títulos/URLs de origem das 56 já estava em
  `docs/LEGADO-DRY-RUN-sync-recent-20261018.md` (gerado no Lote 1) — os slugs reais
  no novo portal seguem o mesmo título, com sufixo do `external_id` do legado.

### O que NÃO foi feito (fora do escopo autorizado)

- Nenhum push no GitHub, nenhum deploy na Vercel.
- Nenhuma alteração em qualquer outra funcionalidade do site/sistema.
- Nenhuma notificação disparada (confirmado na verificação, item 7).
- As 5 matérias existentes não foram reconciliadas (mídia/vínculos) — ficou de fora
  de propósito (`--reconcile-existing` não usado); seguem exatamente como estavam.

### Ponto de continuidade

- Branch/HEAD: `feature/site-lancamento-editorial-publicidade-20261018`, commits
  locais `18c15c5` (Lote 1), `fcf71c1` (Lote 2), `7b68bfd` (Lote 3 código) — mais este
  commit de documentação. **Nenhum push realizado.**
- Lote 1/2/3 do plano de importação do site legado (`docs/PLANO-APP-PUSH-E-SINCRONIZACAO-MATERIAS-20261018.md`)
  concluído com sucesso: 56 matérias recentes do site antigo agora publicadas no novo
  portal, sem duplicação, sem perda de data, sem afetar as 5 já existentes.
- Pendente (não solicitado ainda): decidir se as 5 matérias existentes precisam de
  reconciliação de mídia (25 imagens já vinculadas anteriormente — não investigado
  se estão completas); Lote 3/4 do plano original (Web Push/app nativo, QA de
  publicidade 6 posições) continuam em aberto e sem relação com esta importação.
- Aguardando novas instruções do proprietário.

## CORREÇÃO VISUAL — tela de edição de matéria (18/10/2026)

Branch `feature/site-lancamento-editorial-publicidade-20261018`, sem push/deploy.
Único arquivo alterado: `apps/sistema/src/app/globals.css` (CSS puro, nenhuma
lógica/JSX tocada).

### Causa raiz real (confirmada renderizando a tela, não só lendo o código)

Montei um harness HTML isolado com o CSS real compilado (`npx tailwindcss`) e o
JSX exato dos 5 campos + linha de mídia, e screenshotei via Playwright
(instalado/desinstalado temporariamente) antes e depois — confirmação visual, não
suposição.

- **Causa #1 (a real, pelos 5 campos)**: `apps/sistema/src/app/globals.css` já
  tinha uma regra `.article-form input[type="text"], .article-form select, ...`
  com `padding: 11px 12px` e `font-size: 14px`, mas **nunca declarava a própria
  `height`** — por isso herdava `height: 36px` da linha de base genérica do
  arquivo. Conta: 36px − 2px de borda − 22px de padding = **12px de altura útil**
  para texto de 14px → corte vertical real, confirmado no screenshot (o texto
  aparecia como um traço/ponto irreconhecível). Isso explica exatamente os 5
  campos relatados (Assunto/editoria, Abrangência, Data e hora, Destaque,
  Notificação) — todos batem com o seletor dessa regra.
- **Causa #2 (agravante em `<select>`)**: nenhum `<select>` do sistema tinha
  `appearance: none` — o navegador/SO decide sozinho o padding/posicionamento
  interno do texto fechado do combobox nativo, o que piora o corte em alguns
  navegadores/SO de forma imprevisível pelo CSS.
- **Causa #3 (botão do olho)**: `.article-media-view` (34×34px) não tinha
  `display:flex;align-items:center;justify-content:center` — o emoji "👁" ficava
  posicionado pela métrica de linha default da fonte, não centralizado na caixa.
  `.compact-clear-button` (o "×" de limpar data) tinha `height: 38px`, 2px
  diferente do padrão de 36px — pequena mas real inconsistência de alinhamento.

### Correção aplicada

1. `.article-form input[type="text"|datetime-local]:not([type]), .article-form select`
   ganharam `height: 44px; line-height: 20px;` explícitos (44 − 2 borda − 22
   padding = 20px, igual ao `line-height` — centralização exata, sem depender de
   herança). `.article-form textarea` ficou de fora de propósito (sem uso real
   neste formulário hoje — o corpo é um editor próprio).
2. `.article-form select` (só dentro do formulário de matéria — **nunca** o
   `select` genérico nem `.form-field select`, usado em outras 52 telas) ganhou
   `appearance: none` + seta própria (SVG inline, mesmo tom de `--ink`),
   assumindo o controle total do visual em vez de depender do navegador/SO.
   Escopo deliberadamente estreito para não arriscar nenhuma das outras telas
   (`.materias-table select`, `.cadastros-pagesize select` etc. já têm seu
   próprio `padding` e ganhariam uma seta sobreposta ao texto se o reset fosse
   global).
3. `.article-media-view` (botão do olho) e `.compact-clear-button` (botão "×")
   ganharam `display:flex;align-items:center;justify-content:center` — centraliza
   o conteúdo (emoji/símbolo) dentro da própria caixa, independente da métrica da
   fonte. `.compact-clear-button` também passou a usar a mesma altura do input de
   data ao lado (44px, antes 38px — nem igual ao próprio input nem ao padrão do
   resto do sistema).
4. Também reforçada a linha de base GENÉRICA (`input`/`select` fora de
   `.article-form`, usada em todo o resto do sistema): `line-height: 34px` (igual
   ao content-box de `height: 36px`) — aditivo, nunca remove nada, melhora a
   centralização em qualquer tela que já usasse só a altura genérica, sem mudar
   padding/largura/cor de ninguém.

### Por que o `appearance:none` ficou escopado (não global)

Cheguei a testar um reset global de `select` primeiro; o harness mostrou que o
texto de TODOS os selects do sistema sumia (virava um traço ilegível) porque
várias telas mais antigas (`.materias-table select`, `.cadastros-pagesize select`
etc.) já têm seu próprio `padding`/`height` pensados para o visual nativo do
navegador — aplicar `appearance:none` ali sem ajustar cada uma quebraria essas 52
outras telas. Corrigido restringindo a `.article-form select` antes de prosseguir
— nenhuma outra tela foi tocada.

### Testes

- Harness visual (HTML + CSS real compilado + Playwright): confirmado "antes"
  (texto cortado/ilegível, exatamente como a captura do usuário) e "depois" (texto
  completo, centralizado, seta consistente, botão do olho perfeitamente
  centralizado e alinhado com "Remover") nos 5 campos + linha de mídia.
- `npm run typecheck --workspace @ir/sistema`: limpo.
- `npm run build --workspace @ir/sistema`: concluído com sucesso.
- Mudança é só CSS (nenhum `.tsx` alterado) — o mesmo `ArticleForm.tsx` é
  reaproveitado por matéria nova e por matéria importada do legado (mesmo
  componente, sem variação de layout por origem), então a correção vale para os
  dois casos automaticamente. Blocos "Publicação", "Assunto e localidade" e
  "Imagens da matéria" são exatamente os blocos corrigidos.
- **Não testado** (sem sessão autenticada nesta sessão): abrir a tela real
  logado no navegador para conferir pixel a pixel contra a captura original do
  usuário — a validação foi via harness isolado com o CSS/JSX reais, não a
  aplicação rodando. Recomendo conferência visual rápida pelo responsável antes
  de prosseguir para a próxima etapa de homologação.

### O que falta na homologação visual (próxima etapa, aguardando autorização)

- Páginas públicas das matérias importadas do legado (56 publicadas no lote
  anterior).
- Homepage/notícias do portal público.
- Patrocinadores (6 posições, 2 imagens cada).
- Comportamento responsivo desktop/tablet/mobile em todas as telas acima.
- Conferência da própria tela de matéria (este lote) com sessão autenticada real,
  em complemento ao harness isolado.

## HOMOLOGAÇÃO DO LANÇAMENTO — 5 itens (18/10/2026)

Branch `feature/site-lancamento-editorial-publicidade-20261018`, sem push/deploy.
Nenhuma matéria/patrocinador alterado no Supabase; nenhuma migration aplicada.

### Item 1 — Conferência da tela de matérias (correção `dca57d5`)

- **Não foi possível validar com sessão autenticada real** nesta sessão (sem
  login disponível) — exatamente a limitação já registrada no lote anterior.
  Reconferido o que dá para confirmar sem sessão: o CSS corrigido está presente e
  intacto em `apps/sistema/src/app/globals.css` (`.article-form input/select`
  com `height:44px`/`line-height:20px`; `.article-form select` com
  `appearance:none` e seta própria; `.article-media-view`/`.compact-clear-button`
  com `display:flex` centralizado); `typecheck`/`build` de `apps/sistema` limpos
  nesta sessão (ver abaixo). **Pendente**: abrir a tela real logado e comparar
  pixel a pixel, por decisão do responsável.

### Item 2 — Notícias no site público (verificação direta no Supabase, somente leitura)

- Amostra de 6 das 56 matérias importadas (as mais antigas da janela, 11–12/10):
  todas `status=published`, `published_at` íntegro (datas originais, sem
  divergência), **100% visíveis em `public_articles`** (view pública real),
  todas com capa (1 imagem) e galeria (0 a 19 imagens, variando por matéria
  real), slugs limpos, URLs em `/noticias/<slug>` bem formadas.
- Destaques/homepage (`article_placements`, não tocado pela importação):
  `mainCover=10`, `highlightStrip=4`, `latestNews=8`, `localSpotlight=5` — todos
  populados, nenhum zerado; confirma que a importação (que nunca grava em
  `article_placements`, ver Lote 3) não afetou os destaques existentes, como
  esperado pelas regras editoriais já em vigor.
- **Não testado** (sem navegador/sessão): renderização visual real da
  homepage/listagem de notícias, abertura de uma matéria importada na tela,
  responsivo. Recomendo conferência visual rápida pelo responsável antes do
  lançamento.

### Item 3 — Patrocinadores (verificação direta no Supabase, somente leitura)

- **6/6 posições ativas, 2 imagens cada** (`site_ad_media` com `active=true`),
  `managed_by_panel=true` em todas (nenhum fallback legado). Rotação/efeito
  configurados individualmente por posição (confirmado: `fade`, `fade`,
  `zoom-in`, `slide-left`, `crossfade`, `slide-up` — nunca o mesmo efeito
  repetido artificialmente, cada posição com o que foi configurado de fato),
  todas com `fit_mode=contain` (preserva proporção) e `rotation_interval_ms=10000`.
- **Não testado** (sem navegador): rotação individual rodando de verdade na
  tela, nem a confirmação visual de que a ordem esquerda/direita das 6 posições
  nunca troca em desktop/tablet/mobile — depende de sessão/navegador real.

### Item 4 — Controle de ativação do Assine (implementado, testado localmente)

**Decisão de reaproveitamento**: nova coluna `assine_enabled` em
`site_offer_settings` (registro único já existente, usado pelos preços da
página `/assine`) — nenhuma tabela nova, alteração mínima pedida pelo usuário.

**Arquivos modificados/criados:**
- `supabase/migrations/20261030100100_site_assine_visibility_toggle.sql` (NOVA,
  NÃO aplicada): coluna `assine_enabled boolean not null default false` +
  `create or replace function submit_site_interest_request_v4(...)` com a MESMA
  assinatura/corpo de sempre, só acrescentando um guard no início
  (`raise exception` se `assine_enabled` não for `true`) — única chamadora desta
  função no projeto é `AssineConfigurator.tsx` (confirmado por grep), então o
  bloqueio nunca afeta publicidade/patrocinadores/financeiro/NFS-e, que usam
  tabelas e funções totalmente separadas.
- `apps/site/src/lib/public/siteOfferSettingsService.ts`: nova
  `getSiteAssineEnabled()` — consulta enxuta (só a coluna, não a linha de
  preços inteira, já que isto é lido no cabeçalho de TODA página pública).
  **Falha-fechado de propósito**: qualquer erro, ausência de linha ou valor
  diferente de `true` retorna `false` — nunca liga sozinho.
- `apps/site/src/components/site/SiteHeader.tsx`: novo hook `useAssineEnabled()`
  (mesmo padrão do `useHeaderSections()` já existente, client-side, sem exigir
  mudança nas 20 páginas que renderizam `<SiteHeader>`); os 3 `<Link href="/assine">`
  (desktop, cabeçalho mobile, menu mobile) só renderizam quando `enabled=true`;
  estado inicial `false` (oculto) até a consulta responder.
- `apps/site/src/app/(public)/assine/page.tsx`: `notFound()` logo no início do
  componente quando `assineEnabled` é falso — acesso direto à URL vira 404 (usa
  a página `not-found.tsx` já existente no projeto), antes mesmo de carregar
  preços/configurador.
- `apps/sistema/src/app/sistema/configuracoes/valores-assine/actions.ts`: nova
  `setAssineEnabledAction` — checa `profiles.role` (só `owner`/`admin`; nunca
  `operator`) antes de gravar, grava `assine_enabled`, registra evento de
  auditoria (reaproveita `recordAuditEventSupabase`, mesmo padrão já usado
  pelos preços — "auditável" sem nenhuma infraestrutura nova).
- `apps/sistema/src/features/configuracoes/AssineVisibilityToggle.tsx` (NOVO):
  switch "Ativado/Desativado" com rótulo "Exibir Assine no site", mensagem de
  erro explícita se a gravação falhar (nunca finge sucesso).
- `apps/sistema/src/app/sistema/configuracoes/valores-assine/page.tsx`: passa a
  selecionar `assine_enabled` e monta o novo toggle acima do painel de preços
  existente (mesma tela, pedido de reaproveitar a configuração existente do
  site).

**Confirmações pedidas pelo usuário:**
1. ✅ Configuração clara "Exibir Assine no site" com ativar/desativar — feito.
2. ✅ Estado inicial desativado (`default false` na coluna nova) — feito.
3. ✅ Só administrador (owner/admin) pode alterar — checado na Server Action,
   `operator` recebe erro explícito.
4. ✅ Persistida no Supabase, auditável, sem exigir novo deploy a cada
   ativação/desativação — é uma leitura em tempo real (`force-dynamic` na
   página pública + fetch client-side no cabeçalho), nunca cacheada
   estaticamente.
5. ✅ Oculta nos 3 pontos pedidos (cabeçalho desktop, cabeçalho mobile, menu
   mobile) — nenhum outro link direto a `/assine` foi encontrado no site
   público (grep confirmado).
6. ✅ Acesso direto a `/assine` bloqueado (404) quando desativado.
7. ✅ `submit_site_interest_request_v4` recusa novas solicitações quando
   desativado, sem afetar nenhuma outra funcionalidade comercial (única
   chamadora confirmada).
8. ✅ Cadastro/exibição de patrocinadores nunca tocado por esta mudança
   (arquivos/tabelas totalmente distintos).
9. ✅ Falha-fechado: qualquer erro de leitura mantém Assine oculto, nunca ativa
   sozinho — implementado em 3 camadas (serviço público, página `/assine`,
   leitura administrativa).

**Limitação real, documentada sem maquiagem**: a RLS de `site_offer_settings`
continua com `UPDATE` amplo para qualquer staff ativo (política já existente,
usada pelos campos de preço) — a restrição "só admin" para a coluna
`assine_enabled` especificamente vive só na Server Action, não há uma policy de
banco separada por coluna. Mesmo princípio já usado para
`birthday_message_templates` nesta mesma sessão/projeto; uma policy por coluna
seria desproporcional para um único boolean numa tabela cujas outras ~20
colunas já são staff-editable de propósito. Quem tiver acesso direto ao banco
(fora da aplicação) não está sujeito a essa checagem — risco aceito, igual ao
resto do projeto.

### Item 5 — Testes e documentação

- `npm run typecheck` (site + sistema): limpo.
- `npm run build` (site + sistema): concluído com sucesso, sem erros.
- `npm run test --workspace @ir/core`: 103/103 (baseline, não afetado por este
  lote).
- Verificação read-only direta no Supabase para os itens 2/3/4 (ver acima) —
  nenhuma escrita de dados de matéria/patrocinador.
- Confirmado no banco real: a coluna `assine_enabled` **ainda não existe**
  (`column site_offer_settings.assine_enabled does not exist`) — migration
  genuinamente não aplicada, como instruído.
- Não há suíte de testes automatizados para `apps/site`/`apps/sistema` neste
  projeto (só `packages/core` e `scripts/legacy-audit` têm `npm test`) — mesma
  limitação já registrada nos lotes anteriores desta sessão.

**Sequência de implantação (quando autorizado):**
1. Aplicar `supabase/migrations/20261030100100_site_assine_visibility_toggle.sql`
   no Supabase remoto — **sem isso, a tela `/sistema/configuracoes/valores-assine`
   quebra** (a query já pede a coluna `assine_enabled`, que não existirá até a
   migration rodar). Migration é aditiva/idempotente (`add column if not exists`),
   segura para rodar a qualquer momento antes do deploy de código.
2. Só depois, deploy do código desta branch (site + sistema).
3. Conferir no painel que o toggle aparece como "Desativado" (estado inicial
   seguro) e que `/assine` responde 404 no site publicado.
4. Quando o responsável decidir lançar o Assine: ativar pelo painel (sem novo
   deploy) e confirmar no site que o botão aparece nos 3 pontos e a página
   carrega.

Aguardando revisão do responsável antes de qualquer push/deploy/aplicação de migration.

## COMERCIAL/ASSINATURAS — AVISOS SEPARADOS + APP PILOTO ANDROID (18/10/2026)

Branch `feature/site-lancamento-editorial-publicidade-20261018`, HEAD anterior
`2f91d6a` (confirmado = remoto `980eca2`, nada perdido). Sem push/deploy/migration
aplicada/mensagem real nesta etapa.

### Item 2 — Comercial → Avisos gerais (push), separado de notícias

- **Nova categoria de consentimento** `administrative_enabled` em
  `site_push_subscriptions` (migration nova, não aplicada) — independente de
  `ordinary_enabled`/`urgent_enabled`. Default `false`: exige opt-in explícito
  (checkbox desmarcado por padrão em `SitePushPreferences.tsx`, diferente de
  notícias normais/urgentes que já vêm marcadas).
- `kind='administrative'` em `notification_events` já existia no CHECK
  constraint desde a fundação do sistema (`20261015153801`), mas nunca tinha
  sido implementado ponta a ponta — reaproveitado em vez de inventar um novo
  valor. Trigger `queue_site_push_event()` e `claim_site_push_deliveries()`
  atualizados para incluir esse kind (migration nova); `processSiteDeliveries`
  do cron (`apps/sistema/src/app/api/cron/push/route.ts`) corrigido para
  checar a coluna de consentimento certa por kind (antes, qualquer kind
  diferente de "urgent" caía incorretamente em `ordinary_enabled`).
- **Nova tabela** `commercial_announcements` (rascunho/revisão/histórico) —
  sem ela, não dava para "salvar rascunho" sem já disparar a fila real
  (inserir em `notification_events` aciona o trigger na hora). Só ao
  "Confirmar envio" a aplicação insere em `notification_events` de verdade.
- **Tela nova** `/sistema/publicidade/avisos` (menu Comercial → "Avisos
  gerais"): compor (título/mensagem/link opcional) → salvar rascunho →
  revisar com **prévia de celular** → confirmar envio. Histórico com status
  rascunho/enviado. Acesso restrito a owner/admin (RLS própria + checagem na
  Server Action). Proteção contra envio duplicado: `send_request_id` único +
  `dedupe_key` em `notification_events` (mesmo padrão já usado por
  `EditorialPushSender.tsx`).
- **Envio real DESLIGADO de propósito**: `confirmAnnouncementSendAction`
  recusa com mensagem clara a menos que `COMMERCIAL_PUSH_SEND_ENABLED=true`
  esteja definida — não configurada em lugar nenhum ainda. Rascunho/revisão/
  prévia funcionam normalmente mesmo assim.
- Arquivos: `supabase/migrations/20261030100200_commercial_general_push_announcements.sql`;
  `apps/sistema/src/app/sistema/publicidade/avisos/{actions.ts,page.tsx}`;
  `apps/sistema/src/features/publicidade/AvisosGeraisPanel.tsx`;
  `apps/sistema/src/app/api/cron/push/route.ts`;
  `apps/sistema/src/app/api/public/push/route.ts`;
  `apps/site/src/components/site/public/SitePushPreferences.tsx`;
  `apps/sistema/src/lib/navigation.ts`.

### Item 3 — Assinaturas → Avisos de vencimento (WhatsApp), processo manual

- **Nova tela** `/sistema/assinaturas/avisos-vencimento` (menu Assinaturas):
  1) filtro flexível (mês atual/próximo/período personalizado) sobre
     `subscriptions.status='active'` + `next_due_date` real (nunca inventa
     data; `due_day` só usado para sinalizar divergência, nunca para calcular
     vencimento sozinho) → 2) "Selecionar todos" → 3) "Transferir
     selecionados" para uma **lista editável** → 4) busca para adicionar
     outros clientes, remover individualmente, telefone exibido com aviso de
     inválido/duplicado, **um destinatário por cliente** mesmo com várias
     assinaturas (nunca duplica aviso) → 5) modelo de mensagem editável com
     `{{cliente}}`/`{{assinatura}}`/`{{mes_ano}}` (nunca o dia, por pedido
     explícito) → 6) prévia personalizada + contagem final → 7) salvar
     rascunho / confirmar envio (manual, com confirmação) → histórico por
     lote, com resultado por destinatário.
- **Duas tabelas novas** (migration não aplicada):
  `subscription_due_reminder_batches` (lote) e
  `subscription_due_reminder_recipients` (um por cliente, `unique(batch_id,
  client_id)` no banco — proteção estrutural contra duplicar, não só na
  aplicação). RLS própria, admin/owner.
- **Integração WhatsApp/Meta verificada, não presumida**: código real já
  existe (`apps/sistema/src/lib/financeiro/whatsappCloudProvider.ts`, usado
  hoje para cobrança/confirmação de pagamento/convite de assinatura de
  contrato) — `isWhatsappCloudConfigured()` checa
  `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`. **Nenhuma dessas
  variáveis está definida em `.env.local` nesta sessão** (confirmado por
  grep) — não é possível afirmar se está operacional em produção/Vercel sem
  acesso a esse painel. Novo template **separado**,
  `isWhatsappDueReminderTemplateConfigured()` /
  `sendWhatsappDueReminderTemplate()`, lendo `WHATSAPP_DUE_REMINDER_TEMPLATE`
  — nunca reaproveita `pagamento_confirmado`/`confirmacao_pagamento_ir`, como
  exigido.
- **Envio real DESLIGADO em duas camadas**: exige
  `WHATSAPP_DUE_REMINDER_SEND_ENABLED=true` **e**
  `WHATSAPP_DUE_REMINDER_TEMPLATE` configurado — nenhum dos dois presente.
  Nenhuma mensagem real foi ou pode ser enviada nesta sessão.
- **Limitação real documentada**: não existe no cadastro de clientes um campo
  dedicado de "autorização de contato" (LGPD/opt-in) — a tela usa a
  presença de `whatsapp`/`phone_primary` como proxy ("sem telefone válido"),
  não um consentimento registrado à parte. Registrado aqui em vez de
  inventado um campo novo sem pedido explícito.
- Melhorias futuras registradas na própria tela (não implementadas, por
  pedido explícito): link individual de pagamento no WhatsApp, acesso por
  CPF com verificação segura de identidade, QR Code PIX/copia-e-cola via
  Asaas — nunca expor dado financeiro só com CPF.
- Arquivos: `supabase/migrations/20261030100300_subscription_due_reminders.sql`;
  `apps/sistema/src/app/sistema/assinaturas/avisos-vencimento/{actions.ts,page.tsx}`;
  `apps/sistema/src/features/assinaturas/DueReminderPanel.tsx`;
  `apps/sistema/src/lib/financeiro/whatsappCloudProvider.ts` (2 funções novas);
  `apps/sistema/src/lib/navigation.ts`.

### Item 4 — Aplicativo piloto Android

- **Ambiente verificado, não presumido**: Java 17 e 21 instalados; Android
  SDK completo encontrado em `%LOCALAPPDATA%\Android\Sdk` (platform-tools,
  build-tools 30–36, platforms 33–36) — `ANDROID_HOME` não estava
  definido no shell desta sessão, mas o SDK em si está presente e funcional
  (`adb version` respondeu). Gradle não instalado globalmente, mas o
  `gradlew` (wrapper) do próprio projeto resolve isso sozinho.
- **Scaffold real criado**: `apps/mobile/` (Capacitor + plataforma Android
  gerada via `npx cap add android`), `appId=br.com.jornalir.app`. `server.url`
  aponta para o portal **já publicado** (`https://jornalir.vercel.app`) — o
  app NUNCA duplica a base de matérias, sempre mostra o conteúdo real e atual
  do site (pedido explícito do usuário).
- **APK de debug gerado de verdade**: `./gradlew assembleDebug` concluído com
  sucesso (precisou `JAVA_HOME` apontando para o JDK 21 — o 17 falha com
  "invalid source release: 21"). Resultado:
  `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~4 MB,
  **local, não versionado** — `.gitignore` do próprio Capacitor já exclui
  `*.apk`/`build/`). Instalável por transferência direta do arquivo
  ("sem Play Store"), nunca testado em aparelho real nesta sessão (restrição
  explícita "não modificar aparelhos").
- **O que FALTA, sem inventar que está pronto**:
  1. **Push nativo (FCM)**: não wireado. Exige um projeto Firebase próprio
     (`google-services.json`) — é a criação de um **novo serviço/conta**,
     fora do que posso decidir sozinho ("não contratar serviços sem
     autorização"). Sem isso, o app funciona como WebView do site (inclusive
     recebendo Web Push via o Service Worker do PWA quando aberto), mas não
     tem canal nativo de notificação em segundo plano/fechado.
  2. **3 preferências independentes (normal/urgente/avisos gerais) no app
     nativo**: ainda não implementadas — dependem do FCM estar wireado
     primeiro (a UI web já existe em `SitePushPreferences.tsx`, reaproveitável
     depois).
  3. **Som exclusivo para urgentes**: depende de FCM + canais de notificação
     Android nativos (`NotificationChannel`), não implementado ainda.
  4. **Ícones/splash reais do Jornal IR**: o scaffold usa os assets padrão do
     Capacitor (não a marca real) — substituição é rápida, mas não feita
     nesta etapa (fora do pedido específico deste lote).
  5. **Assinatura de release/Play Store**: fora de escopo nesta fase
     ("sem Play Store").
  6. Não testado em nenhum aparelho real (nem emulador) — só a build
     (compilação) foi validada.
- Próximo passo recomendável, quando autorizado: (a) decidir sobre criar o
  projeto Firebase (serviço gratuito, mas uma conta/projeto novo mesmo
  assim); (b) ícone/nome definitivos; (c) instalar o APK debug gerado em um
  aparelho de teste real para validar abertura de notícia/navegação.

### Item 5 — Segurança, testes e entrega

- Autenticação/permissões: todas as 3 novas telas/ações exigem
  `owner`/`admin` (nunca `operator`) — checado tanto na Server Action quanto,
  para as 2 tabelas novas, na própria RLS (`is_active_admin_or_owner()`).
  `commercial_announcements`/`subscription_due_reminder_*` com RLS própria
  (diferente do `site_offer_settings`, onde a restrição fica só na
  aplicação por causa das ~20 colunas de preço já staff-editable).
- Idempotência: `dedupe_key`/`send_request_id` (avisos gerais),
  `unique(batch_id, client_id)` no banco (avisos de vencimento) — ambos
  impedem duplicar envio mesmo com duplo clique/nova tentativa.
- Isolamento de destinatários: avisos gerais (push, leitores anônimos do
  site/app) e avisos de vencimento (WhatsApp, assinantes identificados) usam
  tabelas, categorias de consentimento e canais totalmente separados, como
  exigido — nenhum dado de um módulo vaza para o outro.
- `npm run typecheck` (site + sistema): limpo. `npm run build` (site +
  sistema): concluído com sucesso (73 páginas em `apps/sistema`, 17 em
  `apps/site`). `npm run test --workspace @ir/core`: 103/103 (baseline, não
  afetado). `apps/mobile` não tem suíte de testes (projeto novo, só
  compilação Gradle validada).
- **Migrations preparadas, NÃO aplicadas**:
  `20261030100200_commercial_general_push_announcements.sql`,
  `20261030100300_subscription_due_reminders.sql`.
- Variáveis de ambiente novas que precisarão existir antes de qualquer envio
  real (nenhuma definida ainda): `COMMERCIAL_PUSH_SEND_ENABLED`,
  `WHATSAPP_DUE_REMINDER_TEMPLATE`, `WHATSAPP_DUE_REMINDER_SEND_ENABLED`.

### Ponto de continuidade

- Branch/HEAD: `feature/site-lancamento-editorial-publicidade-20261018` —
  commits locais a seguir (ver `git log`); nenhum push realizado.
- Pendências desta etapa: decidir Firebase para o app Android; aprovar
  template `WHATSAPP_DUE_REMINDER_TEMPLATE` na Meta; configurar
  `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` (confirmar se já
  existem em produção, não presumir); revisar/testar as duas telas novas com
  sessão autenticada real.
- Aguardando conferência do responsável antes de qualquer implantação.

## APK PILOTO JORNAL IR v.00.00 — compilado, assinado e publicado no R2 (18/10/2026)

Sincronizado primeiro (ff-only, `e1f4478`, 5 commits trazidos do ChatGPT: toggle
Assine reforçado no banco, RPC de avisos administrativos, página/migration de
versões do app, correção de MIME do APK). Detalhes completos em
`docs/APK-PILOTO-VERSOES-JORNAL-IR.md` (seção "Resultado da compilação/publicação").

**Resumo:** `apps/mobile/package.json` corrigido (dependências do Capacitor
agora declaradas); keystore de release real gerado e guardado fora do
repositório; `assembleRelease` compilado e **assinado de verdade**
(`apksigner verify` = Verifies: true); `com.jornalir` / `versionCode=1` /
`versionName=v.00.00` confirmados via `aapt`; 3.151.468 bytes, SHA-256
`bf223cd5df13125b1fda392916397c95b9d55eebc6e30ccf5e1ca412a6126529`; enviado ao
bucket R2 real (`jornalir-media`) sem sobrescrever nada; download íntegro
confirmado (hash do arquivo baixado = hash original).

**Link direto para instalação:**
`https://pub-3d61ff8f7b474fcdbaa936f006ba2bf4.r2.dev/aplicativos/android/jornal-ir-v.00.00.apk`

Commit local `269c0ea`. **Não aplicada** a migration de versões, **não**
registrado no painel `/sistema/configuracoes/aplicativo`, **não** liberado o
botão em `/aplicativo`, **nenhum** push/deploy — por instrução explícita,
aguardando autorização separada para essa próxima etapa.

## LOTE UX — Menu JoIR e refinamento do Jornal Online no app (18/10/2026, commit `3daa32b`)

A partir do estado local preservado (nenhum reset, nenhum commit perdido,
inclusive os commits do APK assinado/piloto). Branch
`feature/site-lancamento-editorial-publicidade-20261018`, sem push/deploy.

**1. Menu JoIR (sistema):** o bloco "JoIR — Assistente Virtual" em
Configurações deixou de ficar sempre expandido. Agora é um submenu
`<details>` fechado por padrão, tanto no dropdown de topo (desktop,
`AdminHeader.tsx`) quanto no menu mobile (`MobileNav.tsx`), com CSS novo em
`globals.css` (`.app-nav-subgroup` / `.mobile-nav-subgroup`) reaproveitando
o mesmo estilo de seta/hover já usado nos outros `<details>` do sistema. A
lógica é genérica por `link.group` — qualquer outro grupo futuro (não só o
JoIR) herda o mesmo comportamento recolhível automaticamente. Os 3 itens
(Conversar / Propostas e aprovações / Configurar assistente) continuam
intactos dentro do submenu. `npm run typecheck --workspace @ir/sistema`:
**passou limpo**.

**2. Jornal Online — cabeçalho (site/app):** removido o parágrafo
explicativo e o link "Ler última edição" (redundante, já que a edição mais
nova já aparece primeiro na lista); cabeçalho mais compacto no celular
(menos padding, H1 menor, fonte da listagem ao lado do título em vez de
rótulo "Fonte:").

**3. Jornal Online — cards de edição:** a capa inteira agora é clicável
(abre a edição); os botões "Ler edição" e "PDF" passaram a ficar
sobrepostos na parte inferior da capa, com um scrim escuro em gradiente +
sombra/anel de contorno, garantindo contraste legível em capas de qualquer
cor. Ordem (mais recente primeiro) não foi alterada — já vinha da API.

**4. Jornal Online — leitor/zoom:** no leitor (`[id]/page.tsx`), o botão
"Voltar ao acervo" agora sai da tela cheia primeiro (se estiver ativa) em
vez de navegar por baixo dela. No celular, a área de leitura passou a
ocupar a largura inteira da tela (cancela o padding do `site-shell`) para
um modo de leitura mais "de página cheia". O pinch-to-zoom nativo
(`touchAction: "pan-x pan-y pinch-zoom"` em `MobilePdfReader.tsx`) já
estava habilitado e já é citado primeiro no texto de ajuda; os controles
+/− continuam existindo apenas como complemento (ajustam a resolução do
canvas renderizado, o que o pinch por si só não faz). Não foi necessário
trocar o visualizador de PDF (pdfjs-dist + canvas já é a abordagem mais
confiável no mobile).

**5. Preparação para storage:** revisado `/api/jornal-online/editions`
(route.ts) — já busca `pdf_url`/`cover_url` da tabela `newspaper_editions`
como URLs públicas quaisquer (não está acoplado ao Google Drive legado, que
é só o fallback via `/api/jornal-online/drive`). **Nenhuma mudança de
código foi necessária**: quando as edições forem movidas para o storage
nesta semana, basta os novos registros em `newspaper_editions` apontarem
`pdf_url`/`cover_url` para a nova URL — a página e o leitor continuam
funcionando sem alteração.

**6. APK/identificadores:** confirmado sem alteração — nome "Jornal IR",
`applicationId`/`appId` = `com.jornalir`, `versionName=v.00.00`,
`signingConfig` de release intacto (`apps/mobile/android/app/build.gradle`,
`apps/mobile/capacitor.config.ts`). **Pendência real identificada (não
corrigida agora, fora do escopo deste lote):** o ícone do app
(`mipmap-*/ic_launcher*`, `drawable-v24/ic_launcher_foreground.xml`) ainda é
o ícone padrão de template do Capacitor/Android Studio (fundo branco,
vetor genérico de ~1,9 KB) — precisa de um ícone próprio do Jornal IR antes
de qualquer publicação em Google Play / Apple App Store. Nenhuma
publicação em loja foi iniciada, por instrução explícita.

**Arquivos alterados:** `apps/sistema/src/app/globals.css`,
`apps/sistema/src/components/admin/AdminHeader.tsx`,
`apps/sistema/src/components/admin/MobileNav.tsx`,
`apps/site/src/app/(public)/jornal-online/page.tsx`,
`apps/site/src/app/(public)/jornal-online/[id]/page.tsx`.

**Commit local:** `3daa32b` (`feat(ux): submenu recolhivel do JoIR e
refinamento do Jornal Online no app`). Nenhum push, nenhum deploy, nenhuma
migration aplicada, nenhuma mudança destrutiva. Todos os commits
anteriores (inclusive APK assinado/piloto) preservados.

**Pendências reais para o app ficar "redondo":** (a) ícone próprio do app
(ver item 6); (b) FCM/push nativo ainda não conectado (projeto Firebase
próprio pendente, já registrado no lote anterior); (c) migração das edições
para storage ainda não executada (planejada para esta semana, código já
preparado); (d) registro do release do APK no painel
`/sistema/configuracoes/aplicativo` e liberação do botão em `/aplicativo`
ainda aguardando autorização separada (herdado do lote anterior); (e)
nenhum teste manual em dispositivo real Android foi feito nesta rodada para
os ajustes de pinch-zoom/tela cheia — recomendado validar no APK já
assinado antes de considerar o item 4 definitivamente fechado.

## LOTE — Safe-area (câmera/status bar) e indicadores do destaque (18/10/2026, commit `b147e3d`)

A partir do estado local preservado (sem reset/pull destrutivo; branch
`feature/site-lancamento-editorial-publicidade-20261018` seguiu 4→5 commits
à frente do GitHub após este lote, nenhum push). **Não repetiu** o trabalho
já feito nos commits `3daa32b`/`2458aec` (submenu JoIR, cabeçalho/cards do
Jornal Online, botão Voltar) — apenas conferiu e, quando necessário,
complementou.

**1. Causa raiz do conteúdo escondido sob a câmera/barra de status
encontrada e corrigida:** faltava `viewport-fit=cover` no `viewport` export
de `apps/site/src/app/layout.tsx`. Sem isso, `env(safe-area-inset-*)`
resolvia sempre para `0` no WebView do app/Safari — todo o CSS de
safe-area que já existia em vários pontos do site (menu mobile, botão
Voltar global, modais, WhatsApp flutuante) ficava **inerte** nesse
contexto. Com o `viewport-fit=cover` ligado, esse CSS pré-existente passa
a funcionar de fato. Confirmado que isso **não afeta o navegador comum**
(desktop/sem notch): `env()` sem recurso resolve para `0px` nesses casos,
preservando o layout atual lá.
- `.site-header` (globals.css) passou a somar `env(safe-area-inset-top)`
  ao próprio `padding-top` — o fundo continua colado no topo (tela
  cheia), só o conteúdo (logo, busca, menu) desce para não ficar atrás da
  câmera/ilha dinâmica/barra de status.
- A barra fixa do leitor de PDF mobile (`MobilePdfReader.tsx`, "Página X de
  Y" + zoom) tinha `sticky top-0`, igual ao `.site-header` — as duas
  disputavam o topo da tela quando a página rolava. Corrigida para ficar
  por baixo do header (`top: calc(58px + env(safe-area-inset-top))`), não
  por cima.
- Android nativo (`styles.xml`): `windowLayoutInDisplayCutoutMode=shortEdges`
  adicionado aos 3 temas (`AppTheme`, `AppTheme.NoActionBar`,
  `AppTheme.NoActionBarLaunch`), coerente com o tratamento via CSS —
  permite o app continuar "tela cheia" até a área do notch, deixando a
  página web responsável por manter o conteúdo interativo fora dela.
  Validado recompilando os recursos do Gradle localmente (`processDebugResources`,
  após limpar `app/build` — pasta gerada/gitignorada que estava com lock
  de uma execução anterior); **nenhum APK novo foi gerado nesta etapa**.

**2. Indicadores "Deslizar"/"Rolar" no destaque:** mantida a animação e
posição atuais do indicador "deslize" (`PublicFeaturedHero.tsx`); somado
contorno preto discreto (`-webkit-text-stroke`) ao texto e às setas `‹ ›`,
além do `text-shadow` que já existia, para não desaparecer em fotos muito
claras. Criado novo indicador "Rolar ↓" no rodapé do destaque (mobile),
reaproveitando o espaço de respiro que o `padding-bottom` do `.hero-copy`
já reservava abaixo do texto — não sobrepõe título/subtítulo/meta, nem os
pontos/setas de navegação (que ficam no topo/centro). Some com
fade suave ao detectar `scrollY > 4px` e não volta a aparecer. Nenhuma
mudança na composição da imagem do destaque.

**3. Conferência do Jornal Online (sem refazer o lote anterior):** capa
clicável, botões sobrepostos com contraste e botão Voltar saindo da tela
cheia primeiro — todos já corrigidos no lote anterior, revisados aqui só
de leitura, sem alteração de código. Adicionalmente corrigida a disputa de
`sticky top-0` da barra do leitor (ver item 1) e a nova `padding-top` do
header, que juntas eliminam o cenário de controle escondido sob a barra
superior. Pinch-to-zoom com dois dedos já estava habilitado via
`touchAction: "pan-x pan-y pinch-zoom"` (não exclusivo dos botões +/−);
não foi necessário trocar o visualizador de PDF.

**4. Próxima versão Android:** nome, `applicationId`/`appId`
(`com.jornalir`) e keystore de distribuição **não foram alterados**.
**Nenhum APK novo foi publicado/gerado** nesta etapa — por instrução
explícita, aguardando aprovação dos ajustes antes de compilar uma eventual
`v.00.01`/`versionCode=2` (mesma assinatura). O APK `v.00.00` já publicado
no R2 permanece como está.

**Arquivos alterados:** `apps/site/src/app/layout.tsx`,
`apps/site/src/app/globals.css`,
`apps/site/src/components/site/MobilePdfReader.tsx`,
`apps/site/src/components/site/public/PublicFeaturedHero.tsx`,
`apps/mobile/android/app/src/main/res/values/styles.xml`.

**Testes reais executados:** `npm run typecheck --workspace @ir/site`
(limpo), `npm run build --workspace @ir/site` (18 rotas geradas com
sucesso), `./gradlew :app:processDebugResources` no módulo Android (limpo,
confirma que os novos itens de tema são aceitos pelo Gradle).
**Testes NÃO executados/mocks:** nenhuma validação visual em aparelho ou
emulador Android real (nenhum dispositivo/emulador conectado nesta
sessão — `adb devices` retornou lista vazia); o comportamento do
`env(safe-area-inset-*)` dentro do WebView real do app e o resultado
visual do indicador "Rolar" e do header/leitor seguem **pendentes de
validação visual em dispositivo físico ou emulador** antes de uma
decisão de publicar nova versão.

**Pendências para a próxima etapa:** validar visualmente em dispositivo
Android real (idealmente um com câmera furo/notch) o header, o menu
mobile, o Jornal Online e o leitor de PDF; decidir, após essa validação,
se compila `v.00.01`; demais pendências (ícone do app, FCM, migração para
storage, registro do release no painel) continuam as mesmas do lote
anterior.

## LOTE — Central de notificações do leitor (18/10/2026, commit `3e49dad`)

A partir do estado local preservado (branch
`feature/site-lancamento-editorial-publicidade-20261018`, sem reset/pull
destrutivo; todos os commits anteriores, inclusive APK assinado/piloto,
preservados). Nenhum push, deploy, migration aplicada ou notificação real
enviada nesta etapa.

**Decisão de arquitetura (antes de codar):** levantamento completo da
infraestrutura existente confirmou que já existe um pipeline real de push
anônimo (`site_push_subscriptions` / `notification_events` com
`app_kind='site'`, `kind` em `ordinary`/`urgent`/`administrative` /
`site_push_deliveries`), já RLS-fechado e só acessível via
`/api/public/push` (hoje hospedado em `apps/sistema`, chamado pelo site em
`controle.altnix.com.br`). A central de notificações **não cria um segundo
sistema de disparo** — ela só passou a *ler* o que já é publicado de
verdade nesse pipeline. Rascunhos do módulo Comercial → Avisos gerais
(`commercial_announcements.status='draft'`) nunca chegam a
`notification_events`, logo nunca aparecem no sininho — só o que foi
realmente confirmado/enviado (`status='sent'`) ou publicado pelo fluxo
editorial.

**Gap identificado e não resolvido nesta etapa (fora do pedido original):**
a publicação de uma matéria (`articles.status='published'`) hoje **não**
insere automaticamente em `notification_events` no pipeline atual — só o
gatilho legado (`notification_outbox`, tabela antiga, não lida por nenhum
código em produção) reage à publicação. Ou seja: a central de
notificações já está pronta para mostrar notícias, mas **nenhuma notícia
é inserida automaticamente nela hoje** — só os avisos gerais/comerciais
confirmados manualmente pelo módulo Comercial → Avisos. Fica registrado
para decisão do usuário: reativar/recriar o gatilho editorial→
`notification_events`, ou manter avisos gerais como único canal por
enquanto.

**1. Backend (`apps/sistema`, mesmo host do `/api/public/push`):**
- `apps/sistema/src/lib/publicApi/cors.ts` (novo): CORS extraído do
  `/api/public/push` para reaproveitar sem duplicar a lógica de segurança
  (allow-list de origem, headers). `push/route.ts` foi refatorado para
  importar daqui, sem mudança de comportamento.
- `apps/sistema/src/app/api/public/notifications/route.ts` (novo): `GET`
  lista os avisos reais de `app_kind='site'` (até 40, mais recentes
  primeiro), filtrando por categoria conforme o opt-in salvo em
  `site_push_subscriptions` quando o leitor já tem cadastro (mesmo hash);
  sem cadastro, usa os mesmos padrões do formulário de preferências
  (notícias do dia/urgentes sim, avisos gerais não). `POST` marca um aviso
  como lido. Identidade = **o mesmo management token anônimo** já usado em
  `/api/public/push` (`sha256("site-push:"+token)`) — sem exigir login,
  sem expor chave de serviço, sem tabela nova de identidade. Se a tabela
  `site_notification_reads` ainda não existir (migration não aplicada), o
  `GET` degrada mostrando tudo como não lido em vez de falhar, e o `POST`
  responde `503` explicando que depende da migration.

**2. Migration preparada, NÃO aplicada:**
`supabase/migrations/20261030100500_site_notification_reads.sql` — cria
`site_notification_reads` (hash do dispositivo + id do evento + data de
leitura), RLS fechada para `anon`/`authenticated` (só `service_role`, mesmo
modelo de `site_push_subscriptions`), mais dois índices de apoio. **Sem
esta migration aplicada, o `POST` de marcar como lido responde 503** — a
central continua funcional para listar/abrir avisos, só o estado de
"lido" persistente no servidor fica pendente até a aplicação autorizada.

**3. Frontend (`apps/site`):** novo diretório
`components/site/public/notifications/`:
- `NotificationCenterContext.tsx`: busca o feed uma vez ao montar e a cada
  2 min, calcula não lidas, controla abertura do painel, marca como lida
  (otimista no cliente + `POST` ao servidor) e a visibilidade do
  flutuante (só aparece com não lida; `sessionStorage` lembra que o leitor
  ocultou nesta sessão, mas **reaparece se chegar uma notificação nova**
  que não existia antes do ocultar — exatamente como pedido).
- `HeaderNotificationBell.tsx`: sininho fixo e discreto, sem animação,
  com contador; usado no header desktop (ao lado da busca) e no topo
  mobile (ao lado da logo/busca/menu).
- `FloatingNotificationBell.tsx`: só renderiza quando há não lida;
  arrastável (clampado dentro da tela via `pointermove`, distingue
  arraste de toque para não abrir o painel por engano), balanço de ~2s ao
  aparecer (`prefers-reduced-motion` desliga a animação), X próprio que
  oculta só nesta sessão sem marcar nada como lido, posicionado acima do
  botão do WhatsApp (que já ocupa o canto inferior direito em todas as
  larguras) para não sobrepor, e some junto com o WhatsApp quando o menu
  ou a busca mobile estão abertos (evita duplicação visual com o sininho
  fixo do header, que fica atrás do painel/backdrop).
- `NotificationPanel.tsx`: lista compacta (categoria/título/hora/resumo);
  clique em notícia abre a matéria e marca como lida; clique em aviso
  geral/institucional expande o texto ali mesmo e marca como lida; estado
  vazio; fecha por X, clique fora ou Esc.
- `SiteHeader.tsx`: sininho inserido nos dois cabeçalhos (desktop/mobile).
  Correção adicional pedida no item 5 do lote: o botão de fechar ("X") do
  menu mobile deixou de depender só do hambúrguer no header, fixo no topo
  real da tela — agora o painel do menu (`.ir-mobile-menu`, que abre como
  bottom sheet) tem seu próprio botão de fechar **sticky dentro do
  painel** (`.ir-mobile-menu-brand` virou `position: sticky; top:0`),
  sempre visível ao rolar a lista de links, sem precisar arrastar nada.

**Testes reais executados:** `npm run typecheck` e `npm run build` em
`@ir/site` e `@ir/sistema` — ambos limpos, incluindo a nova rota
`/api/public/notifications` aparecendo compilada no build do `@ir/sistema`.
**Não testado (mock/pendente):** nenhuma chamada real ao
`controle.altnix.com.br/api/public/notifications` foi feita (endpoint só
existe local/não publicado ainda); nenhuma validação visual em navegador
ou app real do sininho/painel/flutuante/drag; a migration não foi
aplicada, então o `POST` de marcar como lido retorna 503 em produção até
ser autorizada e aplicada; nenhum evento de notícia chega automaticamente
ao painel hoje (ver gap do item acima) — só avisos gerais confirmados
manualmente.

**Pendências para a próxima etapa:** (a) decidir e aplicar a migration
`20261030100500_site_notification_reads.sql` (autorização separada); (b)
decidir se/como reativar a inserção automática de `notification_events`
na publicação de matérias (gap pré-existente, não criado por este lote);
(c) validar visualmente em navegador/APK: posição do flutuante vs.
WhatsApp, drag, balanço, badge, painel, botão de fechar do menu mobile;
(d) demais pendências herdadas dos lotes anteriores (ícone do app, FCM,
migração das edições para storage, registro do release no painel)
continuam as mesmas.

## LOTE — Integração editorial↔notificações + auditoria de segurança (18/10/2026, commits `da2dd2e`/`490caec`)

A partir do estado local preservado (branch
`feature/site-lancamento-editorial-publicidade-20261018`; todos os
commits anteriores, inclusive APK assinado/piloto, intactos). Nenhum
push, deploy, migration aplicada, envio real ou matéria de teste no banco
remoto. Testado num **Supabase local isolado** (`supabase start` +
replay de todas as migrations, porta alternativa para não colidir com
outro projeto Docker já em uso na máquina) — nunca tocou o projeto
remoto; container local descartado ao final (`supabase stop`).

### 1. Integração publicação de matéria -> notification_events

Levantamento ANTES de codar confirmou: existem **três caminhos de código
independentes** que levam `articles.status` a `'published'` —
`ArticleService.publishNow()` (publicar manual), o job `pg_cron`
`publish_due_scheduled_articles()` (matérias agendadas, roda fora da
aplicação Next.js) e `ArticleService.importLegacyArticle()` (import
direto, sem chamador real hoje). Os três já convergiam num único lugar: o
gatilho `article_push_on_published` (existente desde 15/10, que até
então só alimentava a `notification_outbox` legada, confirmado morta —
nenhum código em produção a lê). Em vez de duplicar a lógica nos três
lugares, só o CORPO desse gatilho foi trocado.

**Nova migration (PENDENTE, não aplicada):**
`20261030100600_article_publish_notification_events.sql` — substitui
`queue_article_push_on_publish()` para inserir de verdade em
`notification_events` (`app_kind='site'`, `kind` ordinary/urgent),
mantendo o mesmo guard de idempotência (não refaz em matéria já
publicada) e usando `dedupe_key := 'article-publish:'||id` com
`on conflict do nothing` — mesmo padrão já usado por
`dispatch_commercial_announcement`. Cria também
`site_notification_feature_flags` (linha única,
`article_publish_events_enabled boolean default false`), lida pelo
próprio gatilho antes de inserir qualquer evento.

**Trava "desligado por padrão" (pedido explícito do usuário):** como o
`pg_cron` roda dentro do Postgres, fora da aplicação Next.js, uma
variável de ambiente comum (como `COMMERCIAL_PUSH_SEND_ENABLED`) não
alcançaria esse caminho — por isso a trava é uma configuração no próprio
banco. Enquanto `article_publish_events_enabled=false` (estado inicial),
**nenhuma matéria publicada gera evento**, em nenhum dos três caminhos —
ativar isso é uma decisão separada (hoje só por `UPDATE` direto no banco;
não foi criado um toggle no painel admin nesta etapa, por não ter sido
pedido). Importante: ligar essa trava passa a ARMAR o pipeline de entrega
real já existente (`/api/cron/push` -> Web Push de verdade para
assinantes já inscritos), então ligá-la não é "só mostrar no sininho" —
é decisão equivalente a autorizar envio real, e deve ser tratada como tal.

**Testado de verdade (não só revisão de código), num Postgres local
isolado, com fixtures descartáveis (nenhuma linha fica no banco remoto):**
- Flag desligada (padrão): matéria "normal" publicada -> **0 eventos**. ✅
- Matéria "sem notificação" publicada com flag LIGADA -> **0 eventos**
  (nunca gera, independente da flag). ✅
- Matéria "normal" publicada com flag ligada -> **1 evento**
  `kind=ordinary`, `href=/noticias/<slug>` correto. ✅
- Reeditar a matéria já publicada (título) e "republicar" (status para o
  mesmo valor) -> continua **1 evento só**, nenhuma duplicata. ✅
- Matéria "urgente" publicada -> `kind=urgent`. ✅
- Matéria agendada cujo horário NÃO chegou -> o cron não toca, **0
  eventos**, status continua `scheduled`. ✅
- Matéria agendada cujo horário já passou -> o cron publica de verdade e
  o MESMO gatilho gera **1 evento**, confirmando que o caminho do
  agendador também está coberto sem duplicar lógica. ✅ Rodar o cron de
  novo não duplica. ✅
- Import direto com `status='published'` (caminho do import legado,
  mesmo sem chamador real hoje) -> também gera evento pelo mesmo gatilho
  (ponto de atenção registrado abaixo). ✅
- Publicação que falha (transação com `ROLLBACK`) -> **0 eventos** e a
  própria matéria nem existe — nunca aponta para conteúdo indisponível,
  por construção (o gatilho só comita se a transação inteira comitar). ✅

**Ponto de atenção para o futuro (não é bug, é característica a
observar):** se `importLegacyArticle()` ganhar um chamador real algum
dia (hoje não tem nenhum) enquanto a flag estiver ligada, uma importação
em massa de matérias antigas geraria um evento de notificação por
matéria — o mesmo comportamento que o gatilho legado já tinha, só que
agora apontando para um pipeline que entrega de verdade. Vale revisar
esse caso antes de reativar qualquer importador em massa com a flag
ligada.

**Bugs reais encontrados e corrigidos enquanto testava** (nenhum deles
criado por este lote; pré-existiam em migrations já commitadas, nenhuma
delas aplicada ainda): duas migrations (`20261030100100` e `20261030100200`)
tinham um erro de sintaxe — abriam o corpo de uma função com `as $` (um
dólar só) e fechavam com `$$;` (dois). Isso só seria descoberto no
momento de aplicar de verdade; corrigido agora (commits `da2dd2e`/`490caec`
— por engano de digitação de comando, o primeiro desses dois commits
ficou com as mudanças deste lote coladas ao corpo errado; o segundo
commit tem a nota explicando e os 2 arquivos de typo corretos).

### 2. Revisão da central de notificações do leitor (sem refazer a interface)

Conferido por revisão + leitura do código (sem precisar de dispositivo
real para a maior parte):
- Sininho fixo, flutuante (só com não lida), arrastar, animação, X,
  contador — conferidos, batem com o pedido original, sem alteração de
  interface.
- Notícia abre a matéria e marca como lida; aviso geral expande e marca
  como lido — confirmado no código (`NotificationPanel.tsx`).
- Fechar o flutuante (X) não chama `markRead` em nada — confirmado, não
  apaga nem marca nada como lido.
- "Funciona para quem nunca autorizou push": confirmado por desenho — o
  `GET /api/public/notifications` nunca exige um `managementToken`; sem
  token, mostra notícias normais/urgentes com os mesmos padrões do
  formulário de preferências (avisos gerais ficam ocultos até o leitor
  optar). **A central e a permissão de push do Android/navegador são
  mesmo recursos diferentes, como pedido** — nenhum código da central
  chama `Notification.requestPermission()` ou toca no Service Worker de
  push.

**Limitação real de arquitetura encontrada (explicada antes de alterar
qualquer coisa, como pedido):**
1. Sem a migration `20261030100500` aplicada, a marcação de "lido" **não
   persiste no servidor** — hoje, `POST` responde `503`. Corrigido nesta
   etapa para nunca fingir sucesso: o `GET` agora devolve
   `readTrackingAvailable:false` quando a tabela ainda não existe, e o
   `POST` deixa isso explícito (`readPersistenceDegraded` no contexto,
   com um aviso visível no painel: *"O registro de 'lido' ainda está
   sendo preparado neste servidor..."*). Antes desta correção, a falha
   era engolida silenciosamente — era exatamente o "sucesso falso" que o
   usuário pediu para evitar.
2. A identidade do leitor (`jornalir_push_management_token`) vive só no
   `localStorage` daquele navegador/instalação do app — é a mesma
   limitação que já existia para a assinatura de push (não é uma
   regressão deste lote). Consequência: o mesmo leitor usando o site no
   navegador do celular E o app instalado é tratado como **dois
   dispositivos diferentes** (sem correlação entre eles); dentro do
   próprio app instalado (Capacitor/WebView), o `localStorage` é
   persistente entre reaberturas — não é afetado pelo limite de 7 dias do
   Safari (ITP), que só se aplica a abas de navegador comum, não ao
   WebView do app. Nenhuma mudança no modelo de identificação foi feita
   — fica para decisão do usuário se isso precisa de uma solução de
   sincronização entre dispositivos no futuro (fora do escopo deste lote).

### 3. Auditoria de segurança — resultado

Revisão de código + **testes reais no Postgres local isolado** (não só
leitura):
- `management_hash` isola por dispositivo de verdade: criei leitura para
  um hash fictício e confirmei que só aparece para aquele hash — sem
  cruzamento entre leitores. ✅
- `anon` e `authenticated` recebem **erro de permissão** (não apenas RLS
  silenciosa) ao tentar ler `site_notification_reads`,
  `site_notification_feature_flags` diretamente — testado de verdade
  (`SET ROLE anon; SELECT ...` -> `permission denied`). ✅
- As RPCs novas (`claim_site_notifications_action`) e as já existentes
  (`queue_article_push_on_publish`) **não são executáveis por `anon`
  diretamente** — testado (`SET ROLE anon; SELECT public.<rpc>(...)` ->
  `permission denied`). ✅
- Nenhuma chave de serviço é devolvida ao navegador em nenhuma resposta
  das rotas — confirmado por leitura de `route.ts`. A chave VAPID pública
  (que é pública por natureza do protocolo Web Push) é o único "segredo"
  exposto, e já era antes deste lote.
- **Gap de rate limit encontrado e corrigido:** `/api/public/notifications`
  não tinha limite de tentativas (ao contrário de `/api/public/push`, que
  já usava `claim_site_push_registration`). Nova migration **PENDENTE**
  `20261030100700_site_notifications_rate_limit.sql` cria um limite
  dedicado (`claim_site_notifications_action`, 120/hora por hash de IP,
  cota própria — não reaproveita a de registro de push). Testado de
  verdade: 3 chamadas liberadas com limite 3, a 4ª bloqueada
  (`false`). ✅ Antes da migration ser aplicada, a rota detecta a função
  ausente e segue sem bloquear (degrada em vez de derrubar a central).
- Categorias (`ordinary`/`urgent`/`administrative`) seguem com
  preferências independentes, herdadas de `site_push_subscriptions`
  quando existe; sem cadastro, avisos gerais ficam ocultos por padrão —
  nenhuma categoria sem consentimento é "entregue" nem mesmo exibida na
  central.
- Nenhum rascunho aparece: `commercial_announcements.status='draft'`
  nunca é inserido em `notification_events`; a nova integração editorial
  só insere na transição real para `published`, nunca em `draft`/
  `adjusting`/`scheduled` ainda não vencido/`archived`.
- A migration nova (`20261030100600`) não libera nada por engano:
  `site_notification_feature_flags` tem RLS com `revoke all` de
  `anon`/`authenticated` (testado), a função que a lê é
  `security definer` mas só é alcançável via o próprio gatilho (não é
  uma RPC pública) e já tinha `revoke all` desde antes.

### 4. Migrations pendentes — ordem de aplicação recomendada

Nenhuma foi aplicada. Ordem recomendada (a ordem de timestamp já reflete
isso; nenhuma dependência cruzada rígida entre elas, mas mantém o lote
coerente):
1. `20261030100100_site_assine_visibility_toggle.sql` (typo corrigido
   nesta etapa — lote anterior ao de notificações).
2. `20261030100200_commercial_general_push_announcements.sql` (idem).
3. `20261030100300_subscription_due_reminders.sql` / `20261030100400_mobile_app_android_release.sql` (lotes anteriores, sem relação com este).
4. `20261030100500_site_notification_reads.sql` (central de notificações — leitura/estado de lido).
5. `20261030100600_article_publish_notification_events.sql` (integração editorial, flag desligada por padrão).
6. `20261030100700_site_notifications_rate_limit.sql` (rate limit da central).

**Configuração de servidor necessária quando for autorizado testar envio
real:** `UPDATE public.site_notification_feature_flags SET article_publish_events_enabled = true;`
— nenhum toggle de painel foi criado para isso nesta etapa.

### 5. Testes executados vs. pendentes

**Reais, executados:** `npm run typecheck` e `npm run build` em
`@ir/site` e `@ir/sistema` (ambos limpos); as 13+ verificações descritas
no item 1/3 acima, feitas num Postgres local isolado via
`supabase start` (replay de TODAS as migrations do projeto, inclusive as
novas), nunca contra o projeto remoto, container descartado ao final.

**Não testado / mock / pendente:** nenhuma chamada real feita ao
`controle.altnix.com.br` em produção; nenhuma validação visual em
navegador/app real da central (herdado do lote anterior); nenhum envio
real de push foi disparado ou testado ponta a ponta (fora do escopo
autorizado desta etapa); a migration de leitura (`...100500`) e a de rate
limit (`...100700`) continuam sem persistência real em produção até
aplicadas.

### Pronto para homologação coordenada?

**Tecnicamente sim, do ponto de vista de código** — `@ir/site` e
`@ir/sistema` compilam e buildam limpos com todas as mudanças dos últimos
4 lotes (JoIR/Jornal Online, safe-area/destaque, central de notificações,
integração editorial). **Mas NÃO antes de**: (a) autorizar e aplicar as 5
migrations pendentes listadas no item 4, na ordem indicada; (b) decidir
se/quando ligar `article_publish_events_enabled` (lembrando que isso arma
o envio real, não é inofensivo); (c) validar visualmente em
navegador/dispositivo real os ajustes visuais dos lotes anteriores (JoIR,
Jornal Online, safe-area, sininhos) — nenhum teste manual em tela real
foi feito em nenhum desses lotes ainda. Nenhuma publicação foi executada
nesta etapa.

## SINCRONIZAÇÃO GITHUB — 11 commits enviados (18/10/2026)

Push único, fast-forward, autorizado explicitamente, só para
`feature/site-lancamento-editorial-publicidade-20261018`
(`e1f4478..2056c75`). Verificado antes: `git fetch`, ancestralidade
confirmada, working tree limpo, `vercel.json` de ambos os apps com
`git.deploymentEnabled=false` e inalterados nesses 11 commits, único
workflow do GitHub Actions não dispara nesta branch. Depois do push: SHA
remoto = SHA local (`2056c75`), `origin/main` inalterada (`9a2ae7b`),
nenhum dos 11 commits alcança `main`. Nenhuma migration aplicada, nenhum
deploy, nenhuma mudança no Supabase remoto.

## LOTE — Correções de duplicidade/data/segurança na central (18/10/2026, commit `b2d6942`)

Pedido pelo usuário após revisar as sete migrations e a central já
sincronizadas no GitHub, antes de autorizar a aplicação remota. Três
correções pontuais, **nenhuma delas exigiu criar ou alterar migration**
— todas em código de aplicação (`apps/sistema`, `apps/site`). As sete
migrations pendentes continuam exatamente como estavam;
`article_publish_events_enabled` continua `false`.

**1. Duplicidade entre envio manual e gatilho automático:** o envio
manual existente (`EditorialPushSender.tsx` /
`enqueueSitePushAction`, dedupe `site-editorial:<requestId>`) e o
gatilho automático do lote anterior (dedupe `article-publish:<id>`)
podiam gerar dois avisos para a mesma matéria se os dois caminhos fossem
usados. Corrigido: ao detectar que o link manual aponta para
`/noticias/<slug>` de uma matéria que já tem um evento automático,
`enqueueSitePushAction` recusa o envio e devolve um aviso explicando o
motivo; o administrador pode confirmar explicitamente (novo campo
`confirm_duplicate`, mesmo padrão do `confirm()` já usado para
"urgente") para enviar mesmo assim. Nenhuma das duas idempotências
originais foi alterada (`article-publish` continua
`on conflict do nothing`; `site-editorial` continua upsert
`ignoreDuplicates` por `requestId`).

**2. Visibilidade por data:** `GET /api/public/notifications` agora
filtra `scheduled_at<=agora` — um evento agendado para o futuro nunca
aparece no feed antes da hora. Eventos internos (`app_kind='sistema'`)
já ficavam de fora (filtro `app_kind='site'` já existia); rascunhos do
Comercial → Avisos (`commercial_announcements.status='draft'`) nunca
chegam a `notification_events`, então também já ficavam de fora.

**3. Segurança da central:** o `managementToken` deixou de ir em query
string no `GET` — agora vai em cabeçalho (`X-Notification-Token`), fora
de logs de acesso, histórico do navegador e `Referer`; CORS atualizado
para permitir esse cabeçalho (`cors.ts`, compartilhado com
`/api/public/push`). Antes de marcar como lido, o `POST` agora confirma
que o evento é `app_kind='site'` (nunca um evento interno), já está
liberado (`scheduled_at<=agora`) e que a categoria é uma das que aquele
dispositivo pode ver — mesma lógica de preferências do `GET`, extraída
para uma função compartilhada (`allowedKindsFor`). Nenhuma permissão de
push do sistema operacional é exigida para nada disso (confirmado:
nenhum código da central chama a API de permissão de notificação).

**Testado de verdade, num Supabase local isolado** (mesmo processo dos
lotes anteriores — `supabase start` com portas alternativas, nunca
tocou o projeto remoto nem o outro projeto Docker local já em execução
na máquina; descartado ao final): duplicidade detectada corretamente ao
simular a consulta real; evento futuro excluído do feed filtrado (e
confirmado que, sem o filtro, ele apareceria — prova de que o filtro é
quem protege); pré-checagem de marcar como lido aceita um evento
real/site/vencido, rejeita um evento interno (`app_kind='sistema'`) e
rejeita um evento futuro; categoria `administrative` confirmada negada
por padrão sem cadastro de push; isolamento entre hashes de dispositivo
e bloqueio de leitura direta por `anon` reconfirmados (ambos já tinham
sido testados no lote anterior, repetidos aqui por segurança).
`npm run typecheck`/`build` em `@ir/site` e `@ir/sistema`: ambos limpos.

**Arquivos alterados:** `apps/sistema/src/app/api/public/notifications/route.ts`,
`apps/sistema/src/app/sistema/configuracoes/notificacoes-push/actions.ts`,
`apps/sistema/src/app/sistema/configuracoes/notificacoes-push/EditorialPushSender.tsx`,
`apps/sistema/src/lib/publicApi/cors.ts`,
`apps/site/src/components/site/public/notifications/NotificationCenterContext.tsx`.

**Commit local:** `b2d6942`. Nenhum push, deploy, migration, envio real
ou APK nesta etapa — aguardando decisão do usuário sobre sincronizar
este commit e sobre aplicar as sete migrations.

**Ordem das sete migrations (sem alteração desde o lote anterior):**
100100 → 100200 → 100300 → 100400 → 100500 → 100600 → 100700. Todas já
versionadas no GitHub (commit `2056c75`, verificado nesse push). Nenhuma
aplicada ao Supabase remoto.

## LOTE — Auditoria ampliada + tela de consulta + catálogo JoIR (18/10/2026, commit `91570c9`)

Primeiro lote da "evolução do JoIR como assistente operacional sem API
paga" + "auditoria completa do Jornal IR", conforme pedido explícito —
parado aqui para revisão, como instruído ("parar após o primeiro lote
funcional"). Branch `feature/site-lancamento-editorial-publicidade-20261018`,
commits `b2d6942`/`3528ef2` anteriores preservados. Nenhum push nesta
etapa (branch 3 à frente do GitHub agora).

**O que já existia (reaproveitado, não duplicado):** `public.audit_events`
já existe desde a Fase P (migration original `20260921101000_audit_events.sql`)
— log imutável (sem policy de UPDATE/DELETE para nenhum papel, nem
owner), RLS: owner/admin leem tudo, qualquer staff ativo insere só em
seu próprio nome (`user_id = auth.uid()`, nunca forjável). O helper
`recordAuditEventSupabase` (`apps/sistema/src/providers/supabase/auditEvents.supabase.ts`)
já era o ponto único de gravação, usado por ~20 pontos do sistema
(NFS-e, publicidade, financeiro/cobranças, configurações, propostas do
JoIR). **Nada disso foi recriado** — só estendido.

**Gap real encontrado:** `ArticleService` (packages/core) recebe
`AuditContext` em todos os métodos (`saveDraft`, `updateDraft`,
`publishNow`, `schedule`, `archive`) mas o parâmetro é literalmente
`_audit` (prefixo de "não usado") — comentário no próprio código:
"nesta fase mock nenhum log é gravado". Ou seja: **matérias nunca foram
auditadas**, apesar do contexto já estar sendo passado desde sempre.
`editorial/destaques/actions.ts` (fixar/desafixar/reordenar destaque)
também não tinha nenhuma chamada de auditoria. Esses dois eram
exatamente os pontos que o usuário pediu primeiro ("Matérias:
criação, edição, publicação, agendamento, arquivamento, exclusão e
alterações de destaque").

**1. Cobertura ampliada:**
- `editorial/materias/actions.ts`: `createArticle`/`updateArticle`/
  `archiveArticle` agora chamam `recordAuditEventSupabase` depois de
  cada operação real (nunca antes — se a operação falhar, nada é
  gravado). Metadata inclui `title` e, quando há transição de status,
  `statusChange: "Rascunho → Publicado"` etc., exatamente no formato
  pedido. "Exclusão" não existe como funcionalidade real no sistema hoje
  (confirmado: nenhum DELETE de matéria em nenhum lugar) — mapeada para
  "arquivamento", a única forma de remoção existente.
- `editorial/destaques/actions.ts`: fixar/desafixar/remover do destaque
  e reordenação agora geram evento (`action: update_placement` /
  `reorder_placement`).
- `usuarios/actions.ts`: convite de usuário (`invite`) e solicitação de
  redefinição de senha (`password_reset_requested`) agora geram evento.
  **Pendência real, não construída agora:** não existe hoje no código
  nenhuma ação de ativar/bloquear usuário ou trocar papel (só convite e
  reset de senha) — não há nada para auditar nesse ponto específico até
  essa funcionalidade ser criada; registrado para quando for pedida.
- Dois pontos de banco (fora do alcance de qualquer Server Action)
  passam a registrar com `user_id = null` (ação do sistema, nunca de
  uma pessoa — "distinguir eventos automáticos do usuário que
  autorizou", pedido explícito): `public.publish_due_scheduled_articles()`
  (pg_cron, matéria agendada publicada automaticamente) e
  `public.queue_article_push_on_publish()` (gatilho de notificação
  editorial do lote anterior — agora registra tanto quando dispara
  (`notification_dispatched`) quanto quando ignora por a flag estar
  desligada (`notification_skipped`), satisfazendo "incluindo falhas e
  ações ignoradas").
- **Módulos ainda pendentes** (não tocados neste lote, por decisão
  explícita de ir em lotes controlados): agenda/tarefas,
  assinaturas/operações financeiras específicas (cobranças/Asaas já
  tinham cobertura prévia, mas o módulo de Assinaturas em si não foi
  revisado), app/versões (já cobertas antes, revisado só por
  referência), integrações externas (Asaas, WhatsApp) alem do que já
  existia.

**2. Nova tela `/sistema/configuracoes/auditoria` ("Auditoria e
Atividades"):** acesso owner/admin, mesmo guard de página usado em
`configuracoes/aplicativo` e NFS-e (`profile.active && role in
(owner,admin)`, com redirect), reforçado pela RLS já existente da
própria tabela (mesmo sem o guard de página, ninguém abaixo de
owner/admin conseguiria ler uma linha). Link adicionado em
`configuracoesNavGroup` (`navigation.ts`) — aparece só para quem já vê o
menu Configurações (operador nunca vê essa seção, confirmado no código
do header). Tabela com data/hora, responsável, módulo, acontecimento em
português claro (nunca SQL/JSON bruto — tradução feita em
`auditEventPresentation.ts`, com fallback humanizado para qualquer
entidade/ação ainda não mapeada), registro afetado (id truncado) e
resultado (badge Sucesso/Falha/Ignorado). Ordenação por clique no
cabeçalho (data/hora, módulo, acontecimento) com indicador visual (▲/▼);
busca livre (ação, módulo, título dentro do metadata); filtros
combináveis (módulo, ação, origem usuário/automática, resultado,
período) — tudo via querystring, sem JavaScript extra para o filtro
básico; paginação no servidor (`listAuditEventsAdminPageSupabase`, nunca
busca tudo de uma vez); visualização detalhada em modal (client
component `AuditEventsTable.tsx`), com todos os campos do metadata
traduzidos; botão "Limpar filtros". Visual reaproveita exatamente as
classes já usadas em Contas a Receber (`materias-toolbar`,
`materias-table`, `PaginatedNav`, `ModuleHeader`) — nenhum componente
novo de layout inventado.

**3. JoIR — catálogo de regras (primeira fase, sem API paga):** nova
tabela `joir_automation_rules` — catálogo de regras determinísticas
(`observe`/`prepare`/`approve_required`/`auto_execute_allowed`), toda
regra nasce `enabled=false`. **Trava redundante no próprio banco**
(constraint `joir_automation_rules_no_auto_exec_yet`): nenhuma regra da
categoria `auto_execute_allowed` pode estar habilitada nesta fase, de
nenhum módulo — testado de verdade (inserir uma regra assim falha com
erro de constraint). Isso cobre por construção, não só por convenção,
"não publicar matéria, não alterar valor financeiro, não enviar
mensagem externa, não cobrar, não alterar registro sensível sem
autorização" — mesmo que alguém tentasse marcar uma regra assim
diretamente no banco, falharia. 4 regras iniciais cadastradas, todas
`observe`/`prepare`/`approve_required` (nunca executam nada sozinhas):
assinaturas próximas do vencimento, tarefas/pauta atrasadas, matérias
com pendências editoriais, revisão de notificações editoriais ignoradas.
RLS: só owner lê/atualiza (mesmo padrão das outras telas de JoIR);
inserir/remover regra do catálogo só por `service_role` (catálogo
versionado em migration, não editável por tela nesta fase). **Nenhuma
automação de verdade roda ainda** — este lote só prepara o catálogo e a
trava de segurança; execução real é etapa futura, com simulação/teste
antes de qualquer `enabled=true`.

**Migrations preparadas, NÃO aplicadas** (nenhuma delas tocou RLS nem
dado existente): `20261030100800_audit_scheduled_publish.sql` (estende
`publish_due_scheduled_articles`), `20261030100900_joir_automation_rules.sql`
(catálogo novo), `20261030101000_audit_events_viewer_indexes.sql`
(índices de apoio, zero mudança de comportamento). A migration
`20261030100600` (do lote anterior, também ainda não aplicada) foi
**editada** para acrescentar o log de decisão automática — sem mudar
nada do que já fazia.

**Testado de verdade, num Supabase local isolado** (mesmo processo dos
lotes anteriores — nunca tocou o remoto nem o outro projeto Docker local
em execução na máquina; descartado ao final): as 4 regras JoIR nascem
desligadas; inserir uma regra `auto_execute_allowed` habilitada falha
com erro de constraint; publicar uma matéria agendada via
`publish_due_scheduled_articles()` gera o evento de auditoria certo;
publicar com a flag de notificação desligada gera `notification_skipped`
com o motivo certo, ligada gera `notification_dispatched` com
kind/href certos; os filtros da tela (módulo, origem, resultado, busca
livre) testados contra consultas reais via `@supabase/supabase-js`
(não só leitura de código) — incluindo um bug real de sintaxe
encontrado e corrigido (`metadata::text` não é aceito dentro de uma
árvore `or()` pelo PostgREST; trocado para `metadata->>title`); join com
`profiles` traz o nome do responsável corretamente; RLS confirmada por
teste real (JWT assinado manualmente, não só leitura das policies):
owner lê todo o log mas **não consegue** `UPDATE` nem `DELETE` (nem
owner — confirmado tentando de verdade e checando que a linha não
mudou), operador não lê o log nem o catálogo JoIR, operador **não
consegue** inserir um evento forjando o `user_id` de outra pessoa
(RLS rejeita). `npm run typecheck`/`build` de `@ir/sistema`: limpo.

**Pendências para a próxima rodada (não iniciadas, por decisão de ir em
lotes):** estender auditoria a agenda/tarefas e demais módulos
financeiros ainda não cobertos; construir a funcionalidade de
ativar/bloquear usuário e trocar papel (hoje não existe) antes de poder
auditá-la; avaliar se/quando uma regra JoIR passa de `observe` para
`approve_required` de verdade (gerando uma proposta real em
`ai_approval_requests`); aplicar as agora **dez** migrations pendentes
(as 7 anteriores + estas 3 novas, na ordem documentada) — decisão do
usuário, não executada aqui.

## URGENTE — APK v.00.01 para demonstração (18/10/2026, commit `e9ae092`)

JoIR/auditoria pausados a pedido do usuário; prioridade virou preparar o
APK para demo. Confirmado: lote de auditoria/JoIR só tocou
`apps/sistema` + migrations não aplicadas — zero impacto no site público
ou no app Android (que só consome `apps/site` via `server.url`).

**Feito:** ícone real do Jornal IR em todas as densidades (era o padrão
genérico do Capacitor, confirmado numa auditoria anterior) — gerado de
`apps/site/public/icons/icon-ir-512.png`, mesma identidade já em uso no
PWA, nenhuma marca inventada; `versionCode` 1→2, `versionName`
v.00.00→v.00.01, mesmo `package` e mesma keystore de assinatura
(`keys-mobile/jornalir-release.keystore`, fora do repo, inalterada).
Build release gerado e verificado: `apksigner verify` ok (certificado
`CN=Jornal Informativo Regional`, mesma keystore = compatível para
atualizar sobre a v.00.00 sem desinstalar), `zipalign -c` ok, `aapt
badging` confirma `com.jornalir` / `versionCode=2` / `versionName=v.00.01`.
3.336.676 bytes, SHA-256
`55d2c7d54b389773fee7d30974d383406affa71e84cac6430843fb83d1848a84`.
APK **não commitado** (`*.apk` já no `.gitignore`), copiado para
`..\releases-mobile\jornal-ir-v.00.01.apk` (fora do repo). v.00.00 no R2
**não foi tocada/substituída**. Nenhum upload ao R2, push, deploy ou
registro no painel admin nesta etapa.

**Incidente a registrar:** ao tentar exibir o `keystore.properties` com
senha redigida para conferência, um `sed` com padrão case-sensitive
("password=" não casou com "storePassword=") falhou silenciosamente e a
senha real do keystore apareceu em texto puro na saída de uma ferramenta
desta sessão. A senha não foi reaproveitada nem reimpressa depois, mas
ficou exposta no transcript desta conversa — avaliar se vale trocar a
senha do keystore por precaução (não compromete o keystore em si, só a
confidencialidade da senha nesta sessão específica).

**Migrations (10 pendentes) — nenhuma indispensável para publicar o site
atualizado na Vercel:** todo recurso que depende delas já foi construído
com padrão fail-closed (ex.: `getSiteAssineEnabled()` cai pra `false` se
a coluna não existir; a central de notificações já degrada avisando
`readTrackingAvailable:false` em vez de quebrar). O site pode ir para
homologação sem aplicar nenhuma — os recursos dependentes (Assine
on/off, central de notificações persistente, avisos gerais, integração
editorial→notificação, auditoria ampliada, catálogo JoIR) ficam
inativos/ocultos até serem aplicadas, não impedem o deploy.


## 20/10/2026 — Branch ChatGPT de Agenda/Pauta e auditoria (primeira etapa, NÃO homologada)
Nova branch remota `feature/agenda-mobile-sync-auditoria-20261020` baseada em `be3e61da`. UX mobile, cores por pessoa, baixa individual, dono e admins habilitados para editar/reabrir, consulta de logs concedida individualmente, canal Realtime e proteção de edições concorrentes. Migração `20261020155100_agenda_team_permissions_progress_audit.sql` é apenas arquivo Git; NÃO aplicada ao `site-system-ir`. Banco e produção seguem inalterados nesta etapa. Ler `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md` ANTES de integrar localmente. NÃO concluir unificação Pauta/Agenda nem auditoria geral como prontas: são pendências expressas. Sem typecheck/build/E2E real realizados nesta sessão de conector. Claude/Codex deve buscar a branch inteira com `git fetch` somente ao retomar uso local; conferir mudanças/worktrees, preservar história e não publicar sem autorização.


## 20/10/2026 — Segunda etapa remota: fonte única da Agenda para Pauta (ainda sem QA)
Depois dos testes de compilação da primeira etapa pela Claude, ChatGPT adicionou à mesma branch remota o arquivo `supabase/migrations/20261020162000_agenda_pauta_unified_source.sql`, novas RPCs atômicas e alterações no `AgendaWorkspace.tsx`, `agendaData.ts`, `agendaTypes.ts`, `actions.ts` e `AdminHeader.tsx`. Todas as pautas passam a ter vínculo obrigatório e automático com Agenda; Pauta usa Agenda como origem e mantém campos extras necessários à matéria. Múltiplos responsáveis, conclusão individual e status único. Migração preserva histórico, não trunca títulos antigos; detecta títulos maiores que 180 para revisão. `controle.altnix.com.br` e Supabase remoto **intocados**. Últimos testes da Claude são ANTERIORES a esta etapa; rodar novamente após fetch seguro. Instruções completas em `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`.
