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
