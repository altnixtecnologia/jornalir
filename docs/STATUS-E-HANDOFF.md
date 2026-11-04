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
Nova branch remota `feature/agenda-mobile-sync-auditoria-20261020` baseada em `be3e61da`. UX mobile, cores por pessoa, baixa individual, dono e admins habilitados para editar/reabrir, consulta de logs concedida individualmente, canal Realtime e proteção de edições concorrentes. Migração `20261020204050_agenda_team_permissions_progress_audit_20261020.sql` é apenas arquivo Git; NÃO aplicada ao `site-system-ir`. Banco e produção seguem inalterados nesta etapa. Ler `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md` ANTES de integrar localmente. NÃO concluir unificação Pauta/Agenda nem auditoria geral como prontas: são pendências expressas. Sem typecheck/build/E2E real realizados nesta sessão de conector. Claude/Codex deve buscar a branch inteira com `git fetch` somente ao retomar uso local; conferir mudanças/worktrees, preservar história e não publicar sem autorização.


## 20/10/2026 — Segunda etapa remota: fonte única da Agenda para Pauta (ainda sem QA)
Depois dos testes de compilação da primeira etapa pela Claude, ChatGPT adicionou à mesma branch remota o arquivo `supabase/migrations/20261020204121_agenda_pauta_unified_source_20261020.sql`, novas RPCs atômicas e alterações no `AgendaWorkspace.tsx`, `agendaData.ts`, `agendaTypes.ts`, `actions.ts` e `AdminHeader.tsx`. Todas as pautas passam a ter vínculo obrigatório e automático com Agenda; Pauta usa Agenda como origem e mantém campos extras necessários à matéria. Múltiplos responsáveis, conclusão individual e status único. Migração preserva histórico, não trunca títulos antigos; detecta títulos maiores que 180 para revisão. `controle.altnix.com.br` e Supabase remoto **intocados**. Últimos testes da Claude são ANTERIORES a esta etapa; rodar novamente após fetch seguro. Instruções completas em `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`.

## 20/10/2026 — AGENDA E PAUTA PUBLICADAS: ESTADO FINAL CONFIRMADO
A versão de sistema da Agenda/Pauta foi publicada na Vercel PRODUCTION, deployment `dpl_7BZUuoRTtNr7xDZ5uS3tjvYPwLgY`, commit de código `46c0f17595f4404f9874a6b1a9fbb518b74730b9`, status READY, domínio `controle.altnix.com.br` confirmado. Staging READY `dpl_2PoV84isbHBgpqQuXkWjemzseMgK` do mesmo commit. Três migrations foram APLICADAS com sucesso no projeto Supabase `site-system-ir` na seguinte ordem e com as versões reais do ledger: `20261020204050_agenda_team_permissions_progress_audit_20261020`, `20261020204121_agenda_pauta_unified_source_20261020`, `20261020204306_agenda_internal_trigger_exec_hardening_20261020`. Os arquivos SQL do GitHub foram renomeados para os mesmos nomes/versões reais neste commit para evitar reexecução inadvertida. NUNCA reaplicar estes SQLs no projeto remoto; conferir sempre o ledger primeiro. A primeira e segunda migrations foram também verificadas juntas em transação com ROLLBACK, com testes reversíveis de criação de pauta, conclusão individual, reabertura, edição, sincronização e auditoria; dados de teste não persistiram. A produção tinha 0 pautas/0 agendas antes da publicação e manteve 0 ao fim das migrations. Realtime habilitado nas 3 tabelas. Execução direta das três funções de trigger foi revogada para `anon` e `authenticated`, verificado por `has_function_privilege`. Build Next.js e TypeScript aprovados no staging e produção. Sem testes com múltiplos usuários ou celulares reais autenticados. Claude deve FAZER FETCH da branch para incorporar renomeação e documentação e preservar a branch Android v.00.03 e stash; não executar migration/deploy adicionais sem autorização. Auditoria de todos os módulos, notificações pessoais e app administrativo ainda pendentes.

## 27/10/2026 — Modernizacao da interface de permissoes de usuarios (IR Controle, local, sem publicacao)
Branch local nova `feature/permissoes-usuarios-modernizacao-20261027`, criada a partir da base real de producao `feature/homologacao-integrada-ir-20261023` (`61fe3068`), preservando `hotfix-materias-irc-20261026`, `hotfix-jornalonline-site-20261026`, `consolidacao-pr11-pr8-20261026`, PR #19, stash e os dois worktrees. Autorizado pelo proprietario para implementacao local completa (nao apenas proposta).

FEITO: `UsersManager.tsx` (edicao de permissoes do operador) trocou as caixas de selecao por switches acessiveis (checkbox real + trilho/bolinha via `role=switch`/`aria-checked`) organizados em cartoes recolhiveis por modulo, cada um mostrando estado e contagem de acoes liberadas. Nova logica pura em `src/lib/permissions/permissionsDraft.ts` (sem Supabase/React, testavel com `node:test`) cobre: ativacao automatica de permissoes operacionais padrao na primeira vez que um modulo e ligado (nunca acoes `adminOnly`, nunca NFS-e, nunca criticas como cancelar venda/assinatura, nunca baixas/estornos/cancelamentos/reaberturas/ajustes financeiros sensiveis); reativacao de modulo previamente configurado preserva as escolhas anteriores em vez de aplicar o padrao de novo; desativar modulo so desliga a visibilidade e preserva as concessoes de acao no rascunho. Catalogo (`staffPermissionsCatalog.ts`) ganhou `isDefault`/`isCritical` por acao e `releaseBlocked` no modulo NFS-e, com `STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION` excluindo NFS-e do comando geral "Ativar modulos (padrao)". "Selecionar tudo" por modulo/financeiro nunca inclui `adminOnly`; quando o modulo tem acao critica (cancelar venda, cancelar assinatura, estornar recebimento, cancelar cobranca Pix), pede confirmacao explicita antes de incluir essas acoes (nao inclusas automaticamente). Salvamento deixou de gravar a cada clique: edicao 1000cal no rascunho, um unico botao "Salvar permissoes" calcula o diff contra o estado real e grava em lote por tabela (`staff_module_visibility`, `staff_module_action_permissions`, `staff_finance_action_permissions`), sem transacao unica entre as tres (Supabase client nao oferece); se alguma falhar, nunca informa sucesso completo, recarrega o estado real do banco e permite repetir com seguranca. Aviso de alteracoes nao salvas via `beforeunload` e confirmacao (`ConfirmDialog`) antes de descartar ao trocar de operador ou cancelar com edicao pendente. RLS/autorizacao real preservada (nenhuma chamada usa `service_role` no navegador); nenhuma migration criada so para a interface. Agenda/Pauta e liberacao de Auditoria mantidas com as mesmas regras e chamadas imediatas de sempre (somente o visual do controle foi trocado para o mesmo switch).

TESTES: 11 testes novos em `apps/sistema/test/permissions-draft.test.ts` (node:test, logica pura) cobrindo ativacao com padrao, bloqueio de NFS-e/adminOnly/criticos no padrao automatico, reativacao preservando escolhas, desativacao preservando concessoes, selecionar tudo/limpar com e sem criticos, ativacao em lote nunca tocando NFS-e, diff por tabela nunca persistindo `adminOnly=true`, e contagens ao vivo do rascunho — suite completa de `apps/sistema` com 119/119 passando (`npx tsx --test apps/sistema/test/*.test.ts`). `tsc --noEmit` limpo e `next build` de `apps/sistema` concluido sem erros/warnings, rota `/sistema/usuarios` compilada normalmente. Sem teste de navegador/E2E real (sem servidor Supabase de teste disponivel nesta sessao) — a mesma ressalva de validacao manual ja registrada para outras telas administrativas se aplica aqui.

FALTA/BLOQUEIOS: nenhum. Trabalho encerrado localmente, sem push/merge/deploy/migration remota, conforme autorizado. Publicacao depende de autorizacao separada do proprietario, como de costume.

## 27/10/2026 — Integracao da modernizacao de permissoes sobre a producao atual do IR Controle
Nova branch local `integracao-permissoes-usuarios-irc-20261027`, criada a partir de `6bc95a11` (versao real publicada do IR Controle, com a correcao de Materias ja incluida), nao de `61fe3068`. Cherry-pick limpo (sem conflitos) do commit `3067e211` da branch `feature/permissoes-usuarios-modernizacao-20261027`, mais pequenos ajustes de clareza na propria interface (ver abaixo), resultando no commit `b9b61852`. Diff contra `6bc95a11` toca exatamente os mesmos 6 arquivos da modernizacao (UsersManager.tsx, staffPermissionsCatalog.ts, permissionsDraft.ts novo, globals.css, o teste novo e o handoff) — confirmado por `git diff --name-status`; os 3 arquivos do hotfix de Materias (`articleRepository.supabase.ts`, `error.tsx`, `materias-admin-page-performance.test.ts`) ficam byte a byte identicos entre a base e esta branch (`git diff --quiet` vazio), ou seja, o hotfix nao foi desfeito nem alterado.

Ajuste de clareza pedido pelo proprietario: a secao de permissoes agora rotula explicitamente "Salvo imediatamente" sobre os switches de Agenda/Pauta (gestores) e de Auditoria, com texto explicando que esses dois gravam direto no banco ao clicar e nao dependem do botao "Salvar permissoes" nem sao desfeitos por "Cancelar"; a secao "Modulos e acoes" ganhou o rotulo "Rascunho local — exige Salvar permissoes" e o botao "Cancelar" ganhou um `title` explicando que ele descarta so as mudancas pendentes de modulos/acoes, sem afetar Agenda/Auditoria.

Confirmado (sem mudanca de comportamento, so verificacao): switches, selecao automatica de padroes operacionais na primeira ativacao de modulo, selecao em lote (com confirmacao para itens criticos), bloqueio de ativacao automatica da NFS-e pelo comando geral, e salvamento agrupado por tabela continuam funcionando. Nenhuma acao `adminOnly` ou critica (cancelar venda/assinatura, estornar recebimento, cancelar cobranca Pix, baixas/estornos/ajustes financeiros sensiveis) tem `isDefault=true` no catalogo — adicionado teste de invariante (`apps/sistema/test/permissions-draft.test.ts`) que falha caso isso mude no futuro.

TESTES: suite completa de `apps/sistema` com 125/125 passando (`npx tsx --test apps/sistema/test/*.test.ts`, agora com 2 testes de invariante adicionais). `tsc --noEmit` limpo. `next build` de `apps/sistema` concluido sem erros/warnings, rotas `/sistema/usuarios` e `/sistema/editorial/materias` compiladas.

FALTA/BLOQUEIOS: nenhum para a integracao local. Preservados: commit `3067e211` e a branch original `feature/permissoes-usuarios-modernizacao-20261027`, `hotfix-materias-irc-20261026` (`6bc95a11`), `hotfix-jornalonline-site-20261026` (`3b78d88e`), `consolidacao-pr11-pr8-20261026`, PR #19, stash e os dois worktrees. Sem push, merge, deploy, Preview ou migration remota. Publicacao depende de autorizacao separada.

## 27/10/2026 — Correcao do fluxo de ativacao/definicao de senha (bug real, usuario Silas)

Problema confirmado pelo usuario: convite chega, conta aparece confirmada no Supabase, mas `/definir-senha` fica com os campos de senha desabilitados para sempre. Branch local isolada `fix-ativacao-definir-senha-irc-20261027`, criada a partir de `3f11a7dd` (HEAD publicado via push autorizado nesta sessao).

CAUSA CONFIRMADA (nao descartada — investigacao no codigo-fonte instalado de `@supabase/auth-js`, nao suposicao): `createBrowserClient` de `@supabase/ssr` fixa `flowType:"pkce"` (`node_modules/@supabase/ssr/src/createBrowserClient.ts`). Convites (`admin.auth.admin.inviteUserByEmail`) e recuperacoes administrativas (`admin.auth.resetPasswordForEmail`) sao emitidos pela Admin API, server-side, sem nenhum navegador envolvido no momento da emissao — logo nao existe `code_verifier` salvo em lugar algum. `GoTrueClient._isPKCECallback` (em `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`) exige um `code_verifier` correspondente no storage para aceitar um retorno `?code=...`; sem ele, retorna `false`, `_initialize()` nao entra no ramo de deteccao de sessao por URL, e cai para `_recoverAndRefresh()` — que nao acha nada. Resultado: a conta e confirmada no Auth (o `/verify` do proprio Supabase roda e marca `email_confirmed_at`), mas o navegador de quem recebeu o e-mail nunca grava sessao, e os campos ficam desabilitados para sempre. Isso bate exatamente com o relato (confirmado no Supabase, tela nunca libera).

CORRECAO:
- Nova rota `apps/sistema/src/app/auth/confirm/route.ts` — le `token_hash`+`type` da URL, aceita só `invite`/`recovery`, chama `supabase.auth.verifyOtp({type,token_hash})` usando `createSupabaseServerClient()` (grava sessao real nos cookies via `next/headers`, nao depende de `code_verifier` nem de hash/implicit), e só então redireciona para `/definir-senha` (`?recovery=1` para recovery). Erro de `verifyOtp` (link expirado/já usado) redireciona para `/definir-senha?erro=link-expirado` preservando o tipo — nunca expõe o token em log (só `error.code`).
- Logica pura extraida para `apps/sistema/src/lib/auth/authConfirmFlow.ts` (`parseAuthConfirmType`, `authConfirmSuccessDestination`, `authConfirmErrorDestination`, `INVALID_LINK_DESTINATION`) — todos os destinos sao caminhos internos fixos por `type` validado; nenhum parametro de URL externo decide o redirecionamento (sem open redirect).
- `apps/sistema/src/lib/auth/staffAuthRedirect.ts` — `staffAuthRedirectUrl` agora sempre aponta para `/auth/confirm` (nunca mais direto para `/definir-senha`); mesma validacao estrita de origem/protocolo/producao de antes, inalterada.
- `apps/sistema/src/app/definir-senha/page.tsx` — deixou de ser client component com deteccao de sessao via `onAuthStateChange`/`getSession()` (fonte da race condition). Agora é Server Component: chama `createSupabaseServerClient().auth.getUser()` (validação real contra o Auth) e so entao decide `ready`; a logica de formulario foi para `apps/sistema/src/app/definir-senha/DefinirSenhaForm.tsx` (client), que nunca destrava campos sem a sessao vinda do servidor. Trata explicitamente link expirado/ja usado (`erro=link-expirado`) com mensagem e botao de volta ao login, separado do estado de sucesso.
- `apps/sistema/src/app/login/page.tsx` ("Esqueci minha senha") — passou a gerar o `redirectTo` via `staffAuthRedirectUrl` (mesma validacao de origem usada no convite), em vez de montar a URL na mao; destino final passa a ser o mesmo `/auth/confirm`.
- `updateUser({password})` continua a unica operacao que grava a senha, autenticada pela sessao real ja gravada nos cookies; nenhuma regra de autorizacao/RLS foi alterada.

FLUXOS VERIFICADOS (leitura de codigo, nao E2E — sem Supabase de teste disponivel nesta sessao): convite inicial (`inviteUser`), reenvio de acesso (`resendPendingUserAccess`, tenta novo convite e cai para recovery se a conta ja existir sem confirmar), redefinicao administrativa (`sendPasswordResetForUser`, sempre recovery) e "Esqueci minha senha" (login) — todos os quatro chamam `inviteUserByEmail`/`resetPasswordForEmail` com o mesmo `redirectTo` apontando para `/auth/confirm`, logo todos passam a depender só da troca de template (ver abaixo) para funcionar; nenhum deles cria, deleta ou recria conta. Item 9 (e-mail confirmado sem senha) ja era resolvido por `sendPasswordResetForUser` sem exclusao de conta — confirmado inalterado, so corrigido o caminho de confirmacao do link.

AJUSTE PENDENTE NO SUPABASE (NAO FEITO — requer autorizacao explicita e acesso ao painel remoto; instrucoes exatas abaixo nesta secao do handoff):
Os templates de e-mail "Invite user" e "Reset Password" (Authentication → Email Templates) continuam usando `{{ .ConfirmationURL }}`, que resolve a verificacao no proprio servidor do Supabase antes do clique chegar na aplicacao — e isso que causa o bug. Trocar para linkar direto em `/auth/confirm` fecha a correcao. **Correcao de 27/10/2026 (segunda revisao):** a variavel `{{ .Type }}` nao esta disponivel nos dados dos templates de convite/recuperacao do Supabase — o `type` tem que ser escrito literal em cada template, um por tipo:
- Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
- Reset Password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

`/auth/confirm` (`apps/sistema/src/lib/auth/authConfirmFlow.ts`) ja aceitava exatamente essas duas strings literais (`"invite"`/`"recovery"`) desde a primeira versao — nao foi preciso alterar codigo nesta revisao, so a instrucao documentada aqui, que antes sugeria (erradamente) usar `{{ .Type }}`.

Tambem adicionar `https://controle.altnix.com.br/auth/confirm` em Authentication → URL Configuration → Redirect URLs, senao `inviteUserByEmail`/`resetPasswordForEmail` passam a rejeitar o `redirectTo`. Por decisao do proprietario, **nao** adicionar o equivalente `http://localhost:3001/auth/confirm` de dev a essa allow-list de producao.

TESTES: `apps/sistema/test/auth-confirm-flow.test.ts` (novo, 6 casos: tipos aceitos/rejeitados, destino de sucesso para invite/recovery, destino de erro preservando o tipo, e verificacao de que nenhum destino desta rota sai do dominio interno). `apps/sistema/test/staff-auth-redirect.test.ts` atualizado para o novo destino `/auth/confirm` (mantendo as mesmas garantias de bloqueio de producao/HTTP/dominio externo/credenciais ja existentes). Suite completa de `apps/sistema`: 131/131 passando (`npx tsx --test apps/sistema/test/*.test.ts`). `tsc --noEmit` limpo. `next build` limpo (`.next` removido antes, rebuild completo), rotas `/auth/confirm` e `/definir-senha` compiladas sem erros.

FALTA/BLOQUEIOS: ajuste manual dos dois templates de e-mail e da allow-list de Redirect URLs no painel do Supabase — pendente de autorizacao explicita, nao executado nesta sessao. Sem teste real com caixa de entrada/usuario Silas (sem acesso a ambiente de teste nesta sessao) — validacao final só acontece apos a troca de template e um novo convite/recovery real. Sem push, merge, deploy ou migration remota nesta branch.

## 27/10/2026 — Sistema global de avisos flutuantes (toasts)

Branch local isolada `feature-toast-avisos-flutuantes-irc-20261027`, criada a partir de `5fb1bc16` (HEAD publicado via push autorizado). Componente global de avisos temporarios, aprovado pelo proprietario, para confirmar sucesso/erro/aviso importante de operacoes em qualquer modulo do IR Controle — diferente da central de notificacoes (`features/notificacoes`), do push (`AdminNotificationBell`/`SiteRequestNotificationBell`) e dos dialogos de confirmacao (`ConfirmDialog`); nenhum desses foi tocado.

NOVO:
- `apps/sistema/src/lib/feedback/toastStore.ts` — store externo (singleton de modulo, pub/sub) com fila/limite de 4 visiveis simultaneos, dedupe por `kind+titulo+descricao` numa janela de 4s (evita duplicata por clique duplo ou re-render), e promocao automatica da fila ao fechar um visivel.
- `apps/sistema/src/lib/feedback/notify.ts` — API publica `notify.success/error/warning(titulo, descricao?)`, usavel de qualquer handler/callback client-side sem precisar de hook.
- `apps/sistema/src/components/feedback/ToastProvider.tsx` — renderiza a pilha fixa (canto superior direito desktop, base da tela no mobile), usando `useSyncExternalStore`. Sucesso fecha em 5s (barra de contagem regressiva, pausa ao passar o mouse ou dar foco, retomando do tempo restante, nao do zero); erro e aviso importante exigem fechamento manual (botao OK ou X); `role="status"` para sucesso, `role="alert"` para erro/aviso; animacao de entrada/saida respeitando `prefers-reduced-motion` (desligada via media query, sem afetar o timer real de fechamento).
- CSS novo em `apps/sistema/src/app/globals.css` (`.ir-toast*`) reaproveitando a paleta/raio/sombra ja usados em `.status-pill`/`.form-error`/cartoes elevados do painel.
- `apps/sistema/src/components/admin/RootProviders.tsx` — passou a montar `ToastProvider` em volta de `AuthProvider`/children, no layout raiz — funciona em `/login` e `/definir-senha` tambem, nao só em `/sistema/*`.

INTEGRADO (avisos de RESULTADO de operacao substituidos pela solucao global; validacao de campo continua inline, perto do formulario, quando ajuda o usuario — nao foi convertida):
- `UsersManager.tsx` (usuarios/permissoes): ativar/desativar usuario, promover/rebaixar papel, editar nome/e-mail, convite inicial, reenvio de acesso, redefinicao administrativa de senha, liberar/revogar gestao de Agenda, liberar/bloquear Auditoria, salvar permissoes (modulos/acoes/financeiro). Os dois avisos de pre-voo do formulario de convite (nome/e-mail vazios) continuam inline, junto ao formulario — nao sao resultado de operacao.
- `ReceivableActionsPanel.tsx` (financeiro/contas a receber): registrar recebimento, quitar com diferenca, lancar abatimento, estornar recebimento/abatimento, cancelar titulo, reabrir titulo — as 7 acoes passaram a ter confirmacao explicita de sucesso (antes só erro era mostrado; sucesso só dava `router.refresh()` silencioso) e erro com titulo especifico por acao, nunca mais expondo `saveError.message`/texto bruto do Supabase.
- `DefinirSenhaForm.tsx` (definir-senha): falha ao gravar a nova senha agora é toast; validacao de tamanho/confirmacao de senha (antes de enviar) continua inline, junto aos campos.
- `ArticleForm.tsx` (editorial/materias): falha ao salvar/publicar/agendar/arquivar matéria agora é toast com o erro especifico do servidor (`Não foi possível salvar/arquivar a matéria`). Sucesso de criar/atualizar/arquivar NÃO pode usar toast aqui — essas tres acoes chamam `revalidateAndRedirect` no servidor (redirect real), o componente é desmontado pela navegacao antes que qualquer `then` de sucesso execute; isso já era assim antes desta tarefa (`justSavedRef.current = true` nessa posição já era inalcançavel no sucesso), não foi alterado.
- Em todos os pontos acima, removido texto generico ("Erro inesperado", "Sucesso"): cada titulo/descricao é especifico ("Permissões atualizadas" / "As permissões de Silas foram salvas e já estão valendo.", "Convite solicitado" / "O Supabase aceitou a solicitação de envio para Silas. A entrega ainda depende do serviço de e-mail.", etc.) — nenhuma mensagem afirma entrega de e-mail, pagamento confirmado ou operação concluída sem evidência real.

NAO CONVERTIDO NESTA SESSAO (telas que ainda usam feedback local/antigo — nao sao as 4 apontadas pelo usuario, ficam para um lote futuro): cadastros de clientes, assinaturas, propostas/vendas de publicidade, NFS-e, configuracoes, e qualquer outro formulario server-action com padrao `setError`/`router.refresh()` silencioso fora dos 4 arquivos+matérias listados acima. Nenhuma regra de negocio, permissao, RLS ou comportamento de operacao foi alterada — só a apresentacao do feedback (e, no caso de `ReceivableActionsPanel`, a adicao de confirmacao de sucesso onde antes nao havia nenhuma, e a remocao de mensagens de erro com texto bruto do banco).

TESTES: `apps/sistema/test/toast-store.test.ts` (novo, 8 casos: duracao por tipo, dedupe de duplicata, nao-dedupe entre tipos/descricoes diferentes, sucesso nunca fecha erro visivel e vice-versa, limite de 4 visiveis com fila, promocao da fila ao fechar um visivel, fechar um id em fila nao promove nada indevido, fechar id desconhecido nao lanca erro) — logica pura do store, sem renderizar React (mesmo padrao de testes já usado no projeto; não há testes de renderização de componente nesta base). Suite completa de `apps/sistema`: 139/139 passando (`npx tsx --test apps/sistema/test/*.test.ts`). `tsc --noEmit` limpo. `next build` limpo (`.next` removido antes, rebuild completo), rotas `/sistema/usuarios`, `/sistema/financeiro/contas-a-receber/[id]`, `/sistema/editorial/materias/[id]` compiladas sem erros.

FALTA/BLOQUEIOS: nenhum bloqueio tecnico. Pendente apenas a extensão gradual aos módulos listados acima como "não convertidos", quando autorizado. Sem push, merge, Preview, deploy, migration ou qualquer alteração remota nesta sessão. Sem criação de novo projeto/banco/recurso cobrável.

## 27/10/2026 — Avisos flutuantes: extensão aos demais módulos (fechamento do lote)

Mesma branch `feature-toast-avisos-flutuantes-irc-20261027`, sobre o commit `c7407462` (preservado, nada desfeito). Objetivo: padronizar `notify` nos módulos que faltavam, sem recriar a arquitetura do lote anterior.

CONVERTIDOS NESTA ETAPA (23 arquivos, todos já checados contra `tsc`/`next build`):
- **Clientes e cadastros**: `ClientForm.tsx` (salvar cadastro; vínculo de aniversariante existente), `DigitalExportControl.tsx` (pré-autorização de exportação digital).
- **Assinaturas**: `SubscriptionForm.tsx` (criar/editar), `SubscriptionStatusActions.tsx` (suspender/reativar/cancelar — `ConfirmDialog` de cancelamento preservado, só o resultado virou toast), `DueReminderPanel.tsx` (salvar rascunho e confirmar envio de lote de avisos de vencimento; busca/transferência de destinatários continuam com feedback local, por serem passos intermediários, não resultado final).
- **Comercial/Publicidade, propostas e vendas**: `CommercialProposalForm.tsx`, `CommercialProposalDetail.tsx` (status/duplicar/converter em venda), `CommercialSaleForm.tsx`, `CommercialSaleDetail.tsx` (editar/status/cancelar — `ConfirmDialog` preservado/gerar financeiro; criação de rascunho de NFS-e manteve só o erro em toast, sem adicionar nova confirmação de sucesso, por prudência com a NFS-e), `CommercialProductsPanel.tsx` (catálogo de produtos), `RentalOperationsPanel.tsx` (equipamentos/reservas/vistorias de locação), `AvisosGeraisPanel.tsx` (avisos institucionais push), `ConvertSubscriptionInterestButton.tsx`.
- **Aniversariantes**: `BirthdaysList.tsx` — arquivo muito grande (1900+ linhas, ~20 pontos de erro/sucesso compartilhando um único par de estados `error`/`notice`); em vez de reescrever cada ponto individualmente (risco desproporcional ao ganho), uma ponte via `useEffect` observa esses dois estados já existentes e os encaminha ao `notify`, removendo o bloco de exibição inline antigo — nenhuma lógica de nenhum handler foi tocada.
- **Agenda e Pauta**: `AgendaWorkspace.tsx` — o helper `run()` compartilhado por ~16 ações (compromissos, convites, pauta) passou a notificar sucesso/erro distintamente (antes usava o mesmo texto para os dois casos, sem diferenciação visual nem persistência de erro).
- **Configurações**: `AssineVisibilityToggle.tsx`, `SiteOfferSettingsPanel.tsx`, `BillingProviderSettingsPanel.tsx` (teste de conexão Asaas, webhook, salvar), `MobileAppReleasePanel.tsx` (`window.confirm` de liberação preservado), `SiteAdSlotsPanel.tsx`/`SiteAdPublicationRow.tsx` (grupos de anúncio do site: salvar configuração, ativar/desativar, upload de imagens com distinção sucesso/aviso-parcial/erro, reordenar, remover, período de veiculação — os dois pequenos widgets com indicador "Salvo ✓" no próprio botão mantiveram esse indicador e só o erro virou toast, evitando duplicar sucesso).
- **Contratos**: `ContractForm.tsx` (criar/editar — redireciona no servidor ao salvar com sucesso, então só o erro é alcançável no cliente, mesmo padrão já confirmado em Matérias/Clientes/Assinaturas).
- **Jornal Online/edições**: `EdicoesManager.tsx` (criar, editar, ativar/inativar edição, upload de PDF+capa — esta tela não tinha NENHUM feedback de sucesso antes, só erro; agora tem os dois).

Em todos os casos: textos de erro trazem só a mensagem do servidor/exceção (nunca SQL/stack); nenhuma mensagem afirma entrega de e-mail, pagamento ou conclusão sem evidência (ex.: envio de avisos de vencimento/avisos institucionais continua dizendo "incluído na fila"/"contagem retornada pela API", nunca "entregue"); diálogos de confirmação prévia (`ConfirmDialog`, `window.confirm`) foram preservados integralmente — só o que acontece DEPOIS da confirmação virou toast. Nenhuma regra de negócio, RLS, permissão ou lógica financeira foi alterada.

NÃO CONVERTIDO NESTA ETAPA (fora de escopo desta rodada; nenhum é NFS-e, que permanece intocada por decisão explícita):
- Sub-painéis de Contratos/Comercial com fluxos de assinatura e geração de documento: `ContractAmendmentsPanel.tsx`, `ContractCommitmentOrdersPanel.tsx`, `ContractDocumentsPanel.tsx`, `ContractInstallmentsPanel.tsx`, `ContractIntakeWizard.tsx`, `ContractSignaturesPanel.tsx`, `ContractSignerCanvas.tsx`, `ContractTemplateGenerationPanel.tsx`, `ContractTemplatesManager.tsx`, `CommercialAddendaPanel.tsx`, `CommercialContractPreparationPanel.tsx`, `CommercialContractSignerCanvas.tsx`, `CommercialSignatureRequestsPanel.tsx`, `CommercialSignersPreparationPanel.tsx` — fluxos sensíveis (assinatura eletrônica, geração de PDF) que merecem revisão dedicada, não uma passada rápida.
- Telas de Assinaturas/Financeiro auxiliares: `CompositionPaymentPanel.tsx`, `PixChargePanel.tsx`, `ReceivableCreditPanel.tsx`, `ReceivableForm.tsx`, `SubscriptionBillingPanel.tsx`.
- Demais telas editoriais: `DestaquesManager.tsx`, `EditoriasManager.tsx`, `LocalidadesManager.tsx`, `MidiasLibrary.tsx`, `GenerateCandidatesForm.tsx`, `ImportCandidateReview.tsx`, editor de imagem (`ArticleImageEditorModal.tsx`, `DesktopArticleImageCrop.tsx`, `PreUploadImageCrop.tsx`).
- Assistente IA (`AiAssistantChatPanel.tsx`, `AiAssistantProposalsPanel.tsx`, `AiAssistantSettingsPanel.tsx`), push/FCM de teste (`EditorialPushSender.tsx`, `NativeFcmTestPanel.tsx`, `PushDeviceRegistration.tsx`, `NotificationPreferences.tsx`).
- NFS-e (`features/nfse/*`) — não tocado, release continua bloqueado.

TESTES: nenhum teste novo (esta etapa foi só integração de UI sobre lógica já existente, sem nova lógica pura a testar). Suite completa de `apps/sistema`: 139/139 passando, inalterada. `tsc --noEmit` limpo (checado a cada bloco de arquivos, não só ao final). `next build` limpo (`.next` removido antes, rebuild completo).

FALTA/BLOQUEIOS: nenhum para o que foi convertido. Lista "NÃO CONVERTIDO" acima documentada para retomada futura, se autorizada. Sem push, merge, Preview, deploy, migration ou alteração remota nesta sessão.

## 28/10/2026 — Avisos flutuantes: bloco final de encerramento

Mesma branch `feature-toast-avisos-flutuantes-irc-20261027`, sobre o commit `f23818df` (preservado, nada desfeito). Objetivo: fechar a padronização nos módulos que ainda faltavam e corrigir o risco identificado em Aniversariantes — sem reabrir nem refazer o que já estava concluído.

CORREÇÃO EM ANIVERSARIANTES (ponte `useEffect` → chamada direta): a revisão anterior ligou os estados `error`/`notice` já existentes ao `notify` via dois `useEffect`. Risco real identificado: se um handler define `error`/`notice` para o MESMO valor de string já presente (ex.: a mesma falha ocorrendo de novo sem passar por um reset para `null` antes), o React não re-renderiza (Object.is considera o valor igual) e o `useEffect` correspondente não dispara de novo — a segunda ocorrência do mesmo resultado fica sem aviso. A correção substitui a ponte por chamadas diretas `notify.error(...)`/`notify.success(...)` no exato momento de cada resultado (~30 pontos: troca/edição manual de mensagem, aplicar modelo, gerar homenagem por IA, salvar modelo customizado, upload/remoção de foto, atualizar cadastro, incluir aniversariante, alternar publicação, arquivar registro, salvar personalização, copiar relação), eliminando a dependência de comparação de estado — cada chamada agora gera exatamente um aviso, sempre. A preparação silenciosa em segundo plano (pré-carregamento de mensagens da semana, sem ação do operador) deixou de notificar via toast (vira `console.error`) — não é resultado de operação do usuário, só prefetch. Os `error`/`notice` e a ponte foram removidos por completo do arquivo.

MÓDULOS CONCLUÍDOS NESTA ETAPA (32 arquivos no total, todos conferidos com `tsc`/`next build` a cada bloco):
- **Assinatura eletrônica e documentos (Contratos/Comercial)**: `ContractSignaturesPanel.tsx` (rodada de assinatura, convite individual, revogação — distinguindo sucesso pleno de aviso de entrega automática falha, que agora é `notify.warning`, persistente), `ContractAmendmentsPanel.tsx`, `ContractCommitmentOrdersPanel.tsx`, `ContractDocumentsPanel.tsx`, `ContractInstallmentsPanel.tsx` (geração em lote — resumo via toast, detalhe por parcela continua na lista inline), `ContractTemplateGenerationPanel.tsx`, `ContractTemplatesManager.tsx`, `ContractIntakeWizard.tsx`, `CommercialAddendaPanel.tsx`, `CommercialContractPreparationPanel.tsx`, `CommercialSignatureRequestsPanel.tsx`, `CommercialSignersPreparationPanel.tsx`.
  - **Deliberadamente não tocados**: `ContractSignerCanvas.tsx` e `CommercialContractSignerCanvas.tsx` — telas PÚBLICAS de assinatura eletrônica (`/assinar-contrato/[token]` e `/assinar-contrato-comercial/[token]`), usadas por signatários externos sem conta no sistema, com fluxo de autenticação por código de e-mail (OTP) embutido. Risco desproporcional ao converter sem poder testar interativamente com um signatário real; o aviso inline atual já é persistente e funcional. Preservados integralmente, conforme a regra de proteger fluxos de autenticação e contratos.
- **Financeiro auxiliar (Pix, créditos, faturamento)**: `PixChargePanel.tsx` (geração/cancelamento/consulta de cobrança Pix — o feedback dentro do `ConfirmDialog` de envio por WhatsApp foi preservado como estava, por já ficar visível com o diálogo aberto; só os erros/sucessos FORA do diálogo migraram), `ReceivableCreditPanel.tsx`, `SubscriptionBillingPanel.tsx` (geração única e em lote de cobranças — resumo via toast, detalhe por competência continua inline), `CompositionPaymentPanel.tsx`, `ReceivableForm.tsx`.
- **Editorial**: `DestaquesManager.tsx` e `EditoriasManager.tsx` (fixar/remover/reordenar — só erro virou toast; a reordenação por arrastar ou por clique já mostra o resultado visualmente, evitando aviso a cada movimento), `LocalidadesManager.tsx`, `MidiasLibrary.tsx`, `ArticleImageEditorModal.tsx` (erro virou toast; o indicador "Alterações salvas" no próprio botão foi preservado), `GenerateCandidatesForm.tsx` (erro do servidor virou toast; a lista detalhada de candidato duplicado/extraído continua inline, por ser informação de revisão, não um resultado único), `ImportCandidateReview.tsx` (manter/descartar/dividir/converter candidato).
  - **Deliberadamente não tocados**: `DesktopArticleImageCrop.tsx` e `PreUploadImageCrop.tsx` — ferramentas de recorte de imagem client-side; o erro ali é sobre a MECÂNICA do recorte em si (seleção pequena demais, canvas indisponível no navegador), não sobre uma operação persistida — mantido inline, junto à própria ferramenta de edição, por ajudar mais o usuário nesse contexto.
- **Assistente IA**: `AiAssistantSettingsPanel.tsx` (salvar configurações, atualizar resumo operacional — o indicador de progresso "Testando.../Salvando..." ao lado do campo de chave de API foi preservado, por representar um estado "em andamento" que não cabe em toast), `AiAssistantProposalsPanel.tsx` (atualizar lista, aprovar/recusar sugestão), `AiAssistantChatPanel.tsx` (registrar sugestão, consultar uso de tokens — convertidos; o erro de uma pergunta malsucedida na conversa em si foi deliberadamente mantido inline, por ficar melhor contextualizado dentro do fluxo contínuo do chat do que um toast passageiro).
- **Configurações e testes de notificações push/FCM**: `EditorialPushSender.tsx` (texto já cuidadoso — "incluído na fila, ainda não entregue" — preservado; só migrou para `notify`, com aviso de cancelamento por duplicidade como `notify.warning`), `NativeFcmTestPanel.tsx`, `PushDeviceRegistration.tsx` (ativar/testar/desativar push do próprio dispositivo — bloqueio do navegador vira `notify.warning`, persistente, por exigir ação do usuário fora do sistema), `NotificationPreferences.tsx` (falha ao carregar preferências salvas passou a notificar — antes ficava só num texto discreto, podendo passar despercebido enquanto os switches mostravam valores padrão incorretos).

NÃO TOCADO (por decisão explícita do escopo, não por esquecimento): toda a pasta `features/nfse/*` — NFS-e continua bloqueada nesta versão, conforme instrução. Portal público (`apps/site`) não foi tocado.

REVISÃO FINAL DIRECIONADA (conforme pedido, antes de encerrar):
- Erros de compilação: nenhum — `tsc --noEmit` checado após cada bloco de arquivos (não só ao final) e `next build` limpo no fechamento.
- Avisos duplicados: conferido com busca automatizada por arquivos que ainda tivessem bloco `{error}`/`{message}` inline JUNTO com chamadas `notify` — todas as ocorrências remanescentes são validações de campo (pré-voo) deliberadamente preservadas, sem sobreposição com o que virou toast.
- Mensagens de sucesso sem comprovação: revisadas as mensagens novas que mencionam envio/WhatsApp/Pix — nenhuma afirma entrega confirmada; usam "aceito para envio", "incluído na fila", "gerada" (estado do nosso próprio banco, não de terceiros).
- Erros que desaparecem automaticamente: `toastStore.ts`/`notify.ts` não foram alterados nesta etapa — a regra de erro/aviso persistente até fechamento manual (já implementada nos commits anteriores) continua em vigor; nenhum dos ~30 novos `notify.error`/`notify.warning` usa duração.
- Operações que falham sem apresentar feedback: busca por `if ("error" in result) return;` sem nenhum `notify`/`setError` entre os trechos adicionados nesta sessão — nenhuma ocorrência.

TESTES: nenhum teste novo — esta etapa foi correção de um bug de UI (ponte frágil em Aniversariantes) e integração de `notify` em lógica já existente, sem nova lógica pura isolável para testar neste padrão de testes (sem testes de renderização React nesta base). Suite completa de `apps/sistema`: 139/139 passando, inalterada. `tsc --noEmit` limpo. `next build` limpo (`.next` removido antes, rebuild completo).

FALTA/BLOQUEIOS: nenhum. Telas deliberadamente não convertidas (assinatura pública, ferramentas de recorte client-side, chat da IA) estão documentadas acima com o motivo; NFS-e e portal público não fazem parte do escopo desta tarefa. Sem push, merge, Preview, deploy, migration ou alteração remota nesta sessão. Tarefa encerrada — pronta para publicação única mediante autorização.

## 28/10/2026 — Sincronização incremental do site legado (80 matérias importadas)

Base: `bc106b3c` (branch `feature-toast-avisos-flutuantes-irc-20261027`, HEAD confirmado antes de iniciar, árvore limpa, todas as branches/worktrees/stash preservados). Reutilizou integralmente `scripts/legacy-audit/sync-recent.mjs`/`report-sync-recent.mjs`/`lib/importer.mjs` — nenhum importador novo foi criado. Nenhuma alteração em `apps/sistema` nem `apps/site`.

PROTEÇÃO ADICIONADA (mínima, indispensável): novo `scripts/legacy-audit/lib/manual-guard.mjs`, acoplado em `sync-recent.mjs`/`report-sync-recent.mjs` logo após a barreira de integridade existente — nunca duplica nem reescreve a classificação já existente, só reparte a lista "eligible". Carrega as matérias `origin='manual'` do banco (consulta dinâmica, não uma lista fixa de 5) e, para cada candidata do site, exige título normalizado batendo E data próxima (até 4 dias — ajustado durante a execução real: ver abaixo) E conteúdo com pelo menos 50% das palavras distintivas da matéria manual em comum. Só os três sinais juntos confirmam duplicata (nunca descarta por só título ou só data) — assuntos parecidos com acontecimento diferente nunca batem no conteúdo e continuam elegíveis normalmente. Teste novo `lib/manual-guard.test.mjs` (8 casos, incluindo o ajuste de data abaixo), suite completa de `scripts/legacy-audit`: 14/14 passando (6 testes já existentes de `lib/importer.test.mjs` + 8 novos).

ACHADO REAL durante a execução (não só teórico): a janela de data inicial (±1 dia) deixou passar 1 dos 5 duplicatas reais — "GOVERNO DO ESTADO ASSUME GESTÃO DO HOSPITAL NOSSA SENHORA DOS NAVEGANTES, EM TORRES" tinha título idêntico e conteúdo idêntico (overlapRatio=1) à matéria manual, mas a data de cadastro manual (23/10) ficava 2 dias depois da publicação real no legado (21/10) — ajustado para até 4 dias de distância (sempre exigindo título+conteúdo também). Reexecutado o preflight depois do ajuste: as 5 confirmadas, 0 ambíguas, 0 falso-positivo nas 80 elegíveis restantes (verificado 1 a 1 por slug).

PREFLIGHT (read-only, `report-sync-recent.mjs` e a simulação interna de `sync-recent.mjs` sem `--commit` — os dois bateram exatamente): 277 itens encontrados no site (antes de deduplicar) · 102 candidatas únicas no intervalo 16/10 a 28/10/2026 · 17 já existentes no banco (preservadas, não tocadas — sem `--reconcile-existing`) · **80 elegíveis** · **5 confirmadas como duplicata de matéria manual** (excluídas) · 0 ambíguas · 0 em revisão · 0 em quarentena · 0 rejeitadas · 0 falhas ao buscar detalhe · 0 exceções de data.

IMPORTAÇÃO REAL (`--commit --publish-recent`, autorizado explicitamente pelo proprietário, condicionado ao preflight íntegro — confirmado antes de rodar): 80 matérias criadas com `status=published`, `origin=legacy_site`, `notification_mode='none'` (default da coluna, nunca setado pelo importador) e `published_at` preservada do site original (nunca a data da importação). 216 imagens enviadas ao R2, 0 falhas de imagem, 0 matérias com falha. As 17 já existentes e as 5 manuais não foram tocadas.

VERIFICAÇÃO PÓS-IMPORTAÇÃO (consultas diretas ao Supabase, read-only):
- `articles`: total 23.581 (23.506 published + 75 archived) — 23.421 históricas + 5 manuais + 80 novas = 23.506 published, confere exatamente com os números informados pelo proprietário antes da execução.
- As 5 matérias `origin='manual'` continuam intactas (mesmo id, título, status, data) e **sem nenhuma linha em `article_external_sources`** — confirmado que não foram reimportadas como legado.
- Das 80 importadas: 0 com `notification_mode` diferente de `'none'`, 0 com `status` diferente de `'published'`, 0 com `origin` diferente de `'legacy_site'`, 0 com `published_at` ausente.
- `notification_outbox` e `notification_events`: 0 linhas novas nas últimas 2h. `audit_events` com `notification_dispatched` ou `notification_skipped` para as 80 matérias: 0 — confirma que o gatilho `article_push_on_published` nem chegou a avaliar o feature flag, porque `notification_mode='none'` já retorna cedo (checado no código do gatilho, nas duas versões existentes nas migrations — a vigente e a pendente de aplicação).
- 216 vínculos em `article_media` para as 80 importadas — bate com `uploadedImages=216` do relatório de importação.
- Observação (não é falha, fora do escopo pedido): 1 título duplicado DENTRO das 80 importadas — "SANTA ROSA DO SUL LIDERA ÍNDICE DE PROGRESSO SOCIAL NA AMESC E SE DESTACA ESTADUAL E NACIONALMENTE" aparece 2x, com `external_id` diferente cada vez (15486972 e 15487051) — o próprio site legado publicou/republicou a mesma matéria duas vezes com IDs distintos; o importador trata como duas matérias legítimas por identidade externa, igual seria tratado em qualquer outro lote histórico. Não é duplicata de matéria manual, não foi pedido para resolver, registrado só para conhecimento.

ARQUIVOS ALTERADOS: `scripts/legacy-audit/lib/manual-guard.mjs` (novo), `scripts/legacy-audit/lib/manual-guard.test.mjs` (novo), `scripts/legacy-audit/lib/integrity.mjs` (export de `normalizeTitle`, zero mudança de comportamento), `scripts/legacy-audit/sync-recent.mjs` e `report-sync-recent.mjs` (chamada ao guard logo após `classifyCandidates`, nunca uma reescrita). Nenhuma migration, nenhuma alteração em `apps/sistema`/`apps/site`.

FALTA/BLOQUEIOS: nenhum. Comentários sobre as 17 matérias já existentes na janela (mídia não reconciliada nesta execução, por decisão de escopo — sem `--reconcile-existing`) ficam disponíveis para uma execução futura, se autorizada. Sem push, merge, Preview, deploy, migration ou alteração remota — gravação feita só no Supabase/R2 já configurados do projeto, conforme autorização explícita do proprietário para esta importação específica.

## 29/10/2026 — Segunda sincronização incremental (21 matérias importadas)

Base: `1431b306` (mesma branch, HEAD confirmado, árvore limpa, branches/worktrees/stash preservados). Reutilizou `sync-recent.mjs`/`report-sync-recent.mjs` SEM nenhuma alteração de código — só executados de novo (a proteção `manual-guard.mjs` do lote anterior já está embutida neles).

PREFLIGHT (os dois bateram exatamente, como no lote anterior): 178 itens encontrados no site · 30 candidatas únicas no intervalo 27/10 a 29/10/2026 · 9 já existentes (preservadas) · **21 elegíveis** · 0 duplicata/ambígua de matéria manual (esperado — as 5 manuais já foram todas confirmadas e excluídas no lote de 28/10, nenhuma colisão nova) · 0 em revisão, quarentena, rejeitada · 0 exceções de data.

IMPORTAÇÃO REAL (`--commit --publish-recent`, autorizado): 21 matérias criadas, `status=published`, `notification_mode='none'`, `published_at` original preservada. 33 imagens enviadas ao R2, 0 falhas de imagem, 0 matérias com falha. As 9 já existentes e as 5 manuais não foram tocadas.

VERIFICAÇÃO PÓS-IMPORTAÇÃO: `articles` total 23.602 (23.527 published + 75 archived) — 23.506 (published antes) + 21 = 23.527, confere exatamente. As 5 manuais continuam sem nenhuma linha em `article_external_sources`. Das 21 novas: 0 com `notification_mode`/`status`/`origin`/`published_at` incorretos, 0 títulos duplicados entre si. 33 vínculos em `article_media` — bate com `uploadedImages=33`. `notification_outbox`/`notification_events`/`audit_events` (dispatched ou skipped): 0 linhas novas.

Observação (mesma classe já registrada no lote anterior, não é falha, não corrigida por não ter sido pedido): "ZÉ MILTON DEBATE EM BRASÍLIA A RENEGOCIAÇÃO DE DÍVIDAS DOS PRODUTORES RURAIS" apareceu de novo nesta leva (external_id `15487910`, editoria "sociais"), repetindo o título de uma matéria já importada no lote anterior sob outro `external_id` (`15487832`, editoria "politica") — o site legado republicou a mesma matéria com ID novo; tratada como candidata legítima e distinta pela identidade externa, igual a qualquer outro lote. A duplicata editorial identificada anteriormente (Santa Rosa do Sul/AMESC, lote de 28/10) não foi arquivada nem tocada, conforme instrução explícita.

ARQUIVOS ALTERADOS: nenhum arquivo de código — só `docs/LEGADO-DRY-RUN-sync-recent-20261018.md` regenerado pelo próprio `report-sync-recent.mjs`.

FALTA/BLOQUEIOS: nenhum. Sem push, merge, Preview, deploy, migration ou alteração remota. Próxima tarefa (NFS-e) não iniciada automaticamente, conforme pedido do proprietário.

## 29/10/2026 — NFS-e: preparação final para homologação (reaproveitamento do PR #19)

Nova branch local `nfse-homologacao-finalizacao-irc-20261029`, criada a partir de `cbbd23d0` (preservado, nada desfeito; branch anterior `feature-toast-avisos-flutuantes-irc-20261027` intacta). Não recomeçou o módulo: trouxe os 24 commits funcionais/arquitetura de `fix/convite-nfse-finalizacao-20261025` (PR #19, branch remota não mesclada) via `git cherry-pick`, em ordem cronológica, excluindo deliberadamente: 3 commits de UI de Usuários/Convite (fora do escopo NFS-e) e 7 commits que só atualizavam `docs/STATUS-E-HANDOFF.md` da outra branch (substituídos por esta entrada consolidada). Único conflito real: `docs/STATUS-E-HANDOFF.md` em 1 commit — resolvido mantendo esta versão (conteúdo funcional do commit preservado normalmente).

O que já veio pronto e testado no PR (confirmado por execução real nesta sessão, não só por leitura):
- **Pacote XSD oficial de Produção Restrita v1.01-20261020** vendorizado (`packages/core/src/nfse/xsd/prodrest-v1.01-20261020/`), substituindo o de julho/2026. **Checksums SHA-256 dos 10 arquivos recalculados nesta sessão a partir do blob Git e comparados 1 a 1 com o README do pacote — todos batem exatamente**, confirmando integridade real (não assumida). `checkHomologationReadiness()` bloqueia explicitamente se o pacote divergir do exigido.
- **Certificado A1 (.pfx/.p12)**: `pfx-parser.ts` extrai CNPJ exclusivamente do SAN/otherName OID 2.16.76.1.3.3 (ICP-Brasil/ITI) — nunca do CN —, valida senha, presença de chave privada, correspondência chave↔certificado (protege contra PFX com cadeia de certificados fora de ordem) e validade (vencido/ainda não válido). `certificate-service.ts` confere titularidade (CNPJ do certificado = CNPJ do prestador configurado) antes de aceitar. `secret-store.ts` cifra a chave privada com AES-256-GCM (chave mestra só de `NFSE_CERTIFICATE_MASTER_KEY`, nunca do banco); decifragem adulterada falha por autenticação, nunca devolve texto corrompido. `NfseCertificatePanel.tsx` (interface já existente): upload com senha mascarada (toggle mostrar/ocultar), nunca oferece download do certificado/chave, mostra só metadata segura (fingerprint truncado, validade, alerta de vencimento em 30/15/7 dias), limpa o formulário após salvar, e exibe aviso explícito quando o cofre (`NFSE_CERTIFICATE_MASTER_KEY`) não está configurado no servidor.
- **Testes de assinatura/certificado 100% locais**: `certificate.test.ts` gera um PFX sintético autoassinado (RSA 2048 via `node-forge`, CNPJ fictício, chave mestra de teste via `randomBytes(32)`) — nunca um certificado real. `sefin-nacional-client.test.ts`/`nfse-end-to-end-real-client.test.ts` usam `MockAgent` do `undici` — zero chamada de rede real à SEFIN em qualquer teste.
- **Bloqueio de produção, verificado no código, não só por configuração**: `releasePolicy.ts` tem `NFSE_AVAILABLE_IN_THIS_RELEASE: boolean = false` como constante TypeScript (não variável de ambiente — exige revisão de código pra mudar). `environment.ts` tem `production.operationsEnabled = false` hardcoded. `transmission-service.ts` linha 157 fixa `const environment = "homologation" as const` na transmissão real, **ignorando** o que estiver salvo em `issuerConfig.environment` — mesmo que um admin selecione "Produção" no formulário (campo existe só como metadado/preparação), a chamada real nunca sai do ambiente de Produção Restrita. `FetchNationalNfseProvider`/`CancellationService.submitCancellation()` lançam erro "not ready" incondicionalmente antes de qualquer lógica.
- **Configuração fiscal do emissor** (`NfseIssuerConfigForm.tsx`): CNPJ, inscrição municipal/estadual, município/UF/código IBGE, regime tributário administrativo, opção Simples Nacional, código de regime especial, regime IBS/CBS (Reforma Tributária), série da DPS — nenhum valor assumido silenciosamente (inicial vazio, nunca persistido até salvar).
- **Outras peças reais e testadas** (ver `docs/NFSE-RELIGAMENTO-FUTURO-20261026.md`, já trazido): cliente REST da SEFIN Nacional, builder de DPS e de evento de cancelamento, assinatura XML (perfil oficial confirmado), adaptador ponta a ponta, dispatcher mTLS, geração de DANFSe v2.0 em PDF, reconciliação sem retransmissão, consulta por chave de acesso — todas plugáveis na composição real (`apps/sistema/src/composition/nfse.ts`), nenhuma delas ativada.

TESTES/TYPECHECK/BUILD (executados nesta sessão, não herdados do PR): `packages/core` → **176/176** (`npm test`, inclui as novas suítes de SEFIN client, evento de cancelamento, assinatura de evento, DANFSe, cliente ponta a ponta, concorrência real de mutex/idempotência). `apps/sistema` → **146/146** (`npx tsx --conditions=react-server --test apps/sistema/test/*.test.ts` — a flag `--conditions=react-server` foi necessária porque `danfsePdf.ts` importa `"server-only"`, que só resolve pro no-op `empty.js` sob essa condição de exports do pacote; sem a flag, 1 teste novo falhava ao importar o módulo — achado real desta sessão, não um defeito de código, só da forma de invocar o test runner fora do Next.js). `tsc --noEmit` limpo. `next build` limpo (rota `/sistema/nfse/notas/[id]/danfse` compilada).

PENDÊNCIA REAL QUE NINGUÉM PODE RESOLVER SEM A SEFIN (documentada em `event-builder.ts`/`NFSE-RELIGAMENTO-FUTURO-20261026.md`, não uma falha desta sessão): a fórmula do atributo `Id` de `infPedReg` do evento de cancelamento é corroborada por 3 fontes como `"PRE" + chave de acesso + tipo do evento`, mas o regex do XSD oficial só aceita essa fórmula se o 9º caractere da chave de acesso real (emitida pela própria SEFIN) for `"1"` ou `"2"` — só testável contra o validador real em Produção Restrita, na homologação supervisionada.

PROCEDIMENTO SEGURO PARA CADASTRAR O CERTIFICADO A1 REAL (quando autorizado — nenhum passo abaixo foi executado nesta sessão):
1. Gerar `NFSE_CERTIFICATE_MASTER_KEY` (32 bytes aleatórios em base64 — ex. `openssl rand -base64 32`) e configurá-la **só** como variável de ambiente do servidor de produção/homologação (nunca no código, nunca no Git, nunca em `.env.local` versionado) — sem ela, `NfseCertificatePanel.tsx` já bloqueia o upload mostrando o aviso correspondente.
2. Confirmar `NFSE_AVAILABLE_IN_THIS_RELEASE` continua `false` até TODOS os critérios de `docs/NFSE-FINALIZACAO-20261025.md` serem cumpridos — mesmo com o certificado cadastrado, a emissão real continua bloqueada em múltiplas camadas independentes.
3. O upload do .pfx/.p12 e a senha acontecem só pela tela (`NfseCertificatePanel.tsx`) — a senha nunca deve ser passada por e-mail, chat, script ou variável de ambiente; ela é usada uma única vez em memória pra abrir o arquivo e descartada imediatamente após extrair a chave privada (que é cifrada antes de qualquer gravação).
4. Conferir na tela, após o upload: titular, CNPJ (precisa bater com o CNPJ já salvo na configuração do prestador — senão a validação rejeita automaticamente) e validade — nunca confiar só na mensagem "sucesso".
5. Nunca restaurar backup de banco de outro ambiente que contenha a coluna cifrada da chave privada sem também restaurar a MESMA `NFSE_CERTIFICATE_MASTER_KEY` daquele ambiente — chaves cifradas com uma chave mestra diferente falham a decifragem (por design, nunca "quase funcionam").

ARQUIVOS: 24 commits cherry-picked trazendo `packages/core/src/nfse/{xsd/prodrest-v1.01-20261020,sefin-nacional-client,event-builder,danfse-data,certificate-*,pfx-parser,secret-store,signature,transmission-service,cancellation-service,xsd-validator,environment}.ts` + testes correspondentes; `apps/sistema/src/features/nfse/{NfseCertificatePanel,NfseConsultationPanel,NfseTransmissionPanel}.tsx`; `apps/sistema/src/app/sistema/nfse/notas/[id]/{danfse/route.ts,page.tsx,query-actions.ts}`; `apps/sistema/src/lib/nfse/danfsePdf.ts`; `apps/sistema/src/providers/supabase/nfseTransmissionAttemptRepository.supabase.ts`; `supabase/migrations/20261026100000_nfse_transmission_attempts_dps_id.sql` e `20261026100100_nfse_transmission_attempts_signed_xml.sql` (preparadas, **não aplicadas remotamente**); `docs/NFSE-{FINALIZACAO-20261025,NACIONAL-ARQUITETURA,RELIGAMENTO-FUTURO-20261026}.md`.

FALTA/BLOQUEIOS: nenhum bloqueio técnico para o escopo desta etapa. Pendente só o que exige acesso real à SEFIN (seção acima) e autorização explícita futura para religar a transmissão (`docs/NFSE-RELIGAMENTO-FUTURO-20261026.md`, passo a passo). Sem push, merge, Preview, deploy ou migration remota nesta sessão. `NFSE_AVAILABLE_IN_THIS_RELEASE` permanece `false`.

## 29/10/2026 — NFS-e: separação técnica configuração×emissão (encerramento, commit `d6c36023`)

Mesma branch `nfse-homologacao-finalizacao-irc-20261029` (HEAD anterior `3a4e57e0`). Pedido do usuário: verificar e corrigir, só se necessário, se `NFSE_AVAILABLE_IN_THIS_RELEASE=false` também bloqueava a **configuração**/certificado A1 (deveria ficar liberada só pra Proprietário/Admin ativo), mantendo a **emissão** (transmissão, cancelamento, qualquer chamada fiscal externa) completamente bloqueada.

**Confirmado por leitura direta do código (bug real, não hipotético)**: 3 camadas independentes bloqueavam `/sistema/nfse/configuracoes` pra TODO MUNDO, inclusive owner/admin — `middleware.ts` (bloqueio por URL antes da checagem de papel), `checkModuleAction.ts` (bloqueio geral de toda Server Action do módulo "nfse", antes da RPC de permissão) e `certificado-actions.ts` (checagem própria e independente em `uploadCertificateAction`/`getActiveCertificateAction`, antes de `requireFiscalAdmin`). Corrigido nas 3 camadas, com uma exceção estreita e documentada em cada uma:
- `middleware.ts`: só exime `/sistema/nfse/configuracoes`, e só quando `privileged` (owner/admin); todo o resto de `/sistema/nfse` (rascunhos, notas, nova, perfis-servico) continua bloqueado por URL pra qualquer papel.
- `checkModuleAction.ts`: só exime a ação `"configuracoes_gerenciar"` (já `adminOnly: true` no catálogo `staffPermissionsCatalog.ts` — a RPC `staff_can_module_action` já restringe a owner/admin uma vez liberado o bloqueio geral). Nenhuma outra ação de NFS-e (`notas_emitir`, `notas_cancelar`, `perfis_servico_gerenciar`, `rascunhos_criar`, `rascunhos_editar`) foi tocada.
- `certificado-actions.ts`: removida a checagem própria de `NFSE_AVAILABLE_IN_THIS_RELEASE` em `uploadCertificateAction`/`getActiveCertificateAction` — nenhuma das duas faz qualquer chamada externa (só parse local do PFX e leitura do cofre/DB); ficam protegidas só por `requireFiscalAdmin` (reconfere `active`+`role in (admin,owner)` no banco a cada chamada, nunca confia em claim do cliente).
- **Decisão deliberada e verificada, não tocada**: `parametrizacao-actions.ts` (`querySaoJoaoDoSulParametersAction`) permanece com o bloqueio original intocado — essa função monta um dispatcher mTLS real e faz uma chamada HTTP genuína ao ADN, então é "chamada fiscal externa" no sentido literal do pedido, mesmo estando na mesma página de configuração. `NfseMunicipalParametersPanel.tsx` confirma que essa consulta só dispara por clique explícito no botão (sem `useEffect`/efeito automático no carregamento da página) — a página renderiza e mostra o aviso "NFS-e adiada" nesse painel sem nunca tentar a chamada real.
- `AdminHeader.tsx`/`MobileNav.tsx` (navegação): criado o controle separado e restrito pedido pelo usuário como alternativa — enquanto `NFSE_AVAILABLE_IN_THIS_RELEASE=false`, o menu mostra só um link isolado "NFS-e (config.)"/"Configurações" pra owner/admin, nunca o grupo completo com rascunhos/notas/perfis-serviço (que só aparece quando a emissão for religada).

TESTES: ajustados os 2 casos de `prepublication-release-gates.test.ts` que fixavam o comportamento antigo (bloqueio total), agora cobrindo a exceção estreita (regex sobre o código-fonte real dos 5 arquivos tocados, inclusive confirmando que `parametrizacao-actions.ts` continua com o bloqueio original). `apps/sistema` → **146/146** (`npx tsx --conditions=react-server --test apps/sistema/test/*.test.ts`). `packages/core` → **176/176** (`npm test`, inalterado — cobre certificado válido/inválido sintético, cofre configurado/não configurado, bloqueio de transmissão/cancelamento, nenhum desses módulos foi tocado nesta etapa). `tsc --noEmit` limpo. `next build` concluído sem erros, com `/sistema/nfse/configuracoes` compilada normalmente. Simulação adicional da lógica de roteamento do middleware (8 combinações de path×privilégio) confirmou manualmente: owner/admin acessa `/configuracoes`; qualquer outro papel é bloqueado nela; TODO papel (inclusive owner/admin) é bloqueado em `/rascunhos`, `/notas`, `/nova`, `/perfis-servico` e na raiz `/sistema/nfse`.

ARQUIVOS: `apps/sistema/src/middleware.ts`, `apps/sistema/src/lib/permissions/checkModuleAction.ts`, `apps/sistema/src/app/sistema/nfse/configuracoes/certificado-actions.ts`, `apps/sistema/src/components/admin/{AdminHeader,MobileNav}.tsx`, `apps/sistema/test/prepublication-release-gates.test.ts`. **Não tocados** (confirmado por diff): `parametrizacao-actions.ts`, `actions.ts` (saveIssuerConfigAction — corrigido automaticamente pela mudança em `checkModuleAction.ts`, sem edição própria), `releasePolicy.ts` (constante permanece `false`), qualquer código de transmissão/cancelamento/XSD/certificado.

FALTA/BLOQUEIOS: nenhum. Nada cadastrado, emitido ou transmitido nesta sessão — mudança só de controle de acesso. Sem push, merge, Preview, deploy ou migration remota. `NFSE_AVAILABLE_IN_THIS_RELEASE` permanece `false`. **HEAD final: `d6c36023f1b4755ef74b65a3177e966a21d64dcb`.** Confirmação objetiva ao usuário: após publicação autorizada, Proprietário/Admin ativo conseguirá acessar `/sistema/nfse/configuracoes`, cadastrar dados fiscais do prestador e fazer upload/consulta/substituição do certificado A1; qualquer outro papel continua bloqueado nessa mesma tela; e toda emissão (rascunhos, notas, transmissão, cancelamento, consulta real de parâmetros municipais ao ADN) continua 100% bloqueada pra todos os papéis, sem exceção.

## 31/10/2026 — Sincronização e Bloco 1 (Solicitações do Portal): conversão real de publicidade/pacotes mistos

**Etapa 0 (sincronização/proteção), executada antes de qualquer alteração**: `pwd`/branch/HEAD confirmados (`nfse-homologacao-finalizacao-irc-20261029`, HEAD `7c8bf02f`, igual ao SHA publicado em produção informado pelo usuário). Árvore limpa, nenhum arquivo não rastreado. Stash preexistente (`wip: correcao centralizacao header mobile`, branch `feature/site-lancamento-editorial-publicidade-20261018`) e worktree Android (`C:/JornalIR-worktrees/ir-controle`, branch `feature/ir-controle-mobile-android-20261020`, 13 commits à frente do remoto) **preservados, intocados**. `git fetch origin` executado. **Achado real (não presumido)**: `origin/main` **não contém** o SHA publicado e está ~1000 commits atrás de `origin/frontend-integracao-20261008` (a branch real de integração) — `main` no GitHub é uma branch legada, nunca foi o tronco real deste projeto, e não foi tratada como referência de produção (exatamente a armadilha que o pedido do usuário avisou para não presumir). `origin/frontend-integracao-20261008` confirmado como ancestral direto do HEAD atual (HEAD contém tudo dela + 1068 commits). PR #15 (`feature/homologacao-integrada-ir-20261023`) confirmada já **integralmente incorporada** ao HEAD (zero commits exclusivos) — nenhum merge necessário. Nova branch de trabalho isolada criada a partir do HEAD: **`solicitacoes-financeiro-contratos-irc-20261031`**.

### Bloco 1 — Solicitações do Portal (bug real corrigido)

**Bug confirmado por leitura direta do código**: `updateSiteInterestStatusAction(id, "converted")` conseguia marcar QUALQUER solicitação (publicidade ou mista) como "convertida" sem criar cliente, proposta ou venda — a função `resolveOrCreateAdvertisingClient` já existia no arquivo desde 29/10 mas nunca era chamada (código morto), e a coluna `converted_proposal_id` (migration `20261029100010`, comentário "Proposta comercial criada para a parte de publicidade, quando houver") nunca era preenchida. Só solicitações de assinatura pura tinham conversão real (`convertSubscriptionInterestAction`).

**Corrigido** (`apps/sistema/src/app/sistema/publicidade/solicitacoes/`):
- `updateSiteInterestStatusAction` agora **recusa** `status: "converted"` incondicionalmente — só as ações dedicadas podem marcar conversão.
- Nova `convertAdvertisingInterestAction(id)`: publicidade pura cria cliente (via `resolveOrCreateAdvertisingClient`, sem exigir CPF/CNPJ, mesma regra já existente) + proposta comercial (`commercial_proposals`, pré-venda — nunca uma venda/contrato fechado automaticamente, continua exigindo aprovação manual da proposta pelo fluxo Comercial já existente). Pacote misto usa o cliente com CPF/CNPJ (mesma regra da assinatura) e cria TAMBÉM a assinatura + 1º título financeiro, reaproveitando a lógica extraída (`ensureSubscriptionAndReceivable`, idempotente por `originTag` nas notas, igual ao padrão já usado pela conversão de assinatura). Caso um pacote misto tenha assinatura mas nenhum item de publicidade identificável no payload, grava o vínculo da assinatura mesmo sem marcar "converted" (nunca perde o link, nunca duplica numa nova tentativa) e devolve erro explícito pedindo criação manual da proposta.
- **Permissões granulares nas Server Actions** (gap real: nenhuma das 5 actions deste arquivo tinha qualquer checagem de permissão, só confiavam em RLS/visibilidade de menu): novo catálogo `{ module: "publicidade", key: "solicitacoes_gerenciar", isDefault: true }`; `checkModuleAction("publicidade","solicitacoes_gerenciar")` adicionado a `updateSiteInterestStatusAction`, `markSiteInterestAttendedAction`, `reviewSiteInterestAction`, `convertAdvertisingInterestAction`; `convertSubscriptionInterestAction` passou a exigir `checkModuleAction("assinaturas","assinaturas_criar")` (mesma permissão já usada pela criação manual de assinatura, `apps/sistema/src/app/sistema/assinaturas/actions.ts`).
- **RLS/PostgREST** (gap real, mesmo tipo de contorno que motivou `enforce_assine_admin_update` em 22/10): a policy de UPDATE de `site_interest_requests` (desde 12/10/2026) só exigia `is_active_staff()` — qualquer funcionário ativo podia marcar "convertida" chamando a API REST direto, contornando a checagem da Server Action. Migration preparada (**NÃO aplicada remotamente**) `supabase/migrations/20261031120000_site_interest_requests_granular_rls.sql` — troca a policy pra exigir `staff_can_module_action('publicidade','solicitacoes_gerenciar')` OU `staff_can_module_action('assinaturas','assinaturas_criar')`, owner/admin continuam liberados incondicionalmente (sem regressão administrativa).
- UI (`page.tsx`): botão genérico "Marcar convertida" (publicidade/mista) substituído por `ConvertAdvertisingInterestButton` (novo componente, mesmo padrão de `ConvertSubscriptionInterestButton`); link "ver proposta" exibido quando `converted_proposal_id` estiver preenchido.
- Refatoração de testabilidade: funções puras (`advertisingSelections`, `subscriptionSelectionAmount`, `commercialConditionFromPayment`, `onlyDigits`, `addDaysIso`, `addYearsIso`, `todayInBrazil`) extraídas pra `siteInterestConversionHelpers.ts` (um arquivo `"use server"` só pode exportar async functions — não dava pra testar essas funções sem tirá-las de `actions.ts`). 8 testes novos (`site-interest-conversion-helpers.test.ts`) cobrindo os casos de parsing que a nova conversão depende diretamente (extração de itens de publicidade vs. assinatura, nunca confundir os dois; prioridade de preço `finalPrice > individualPrice > price`; fuso America/Sao_Paulo real em `todayInBrazil`).

**Achado de coerência mais amplo, NÃO corrigido nesta etapa (fora do escopo de Bloco 1, risco de regressão em módulo não pedido)**: `commercial_proposals`/`commercial_proposal_items` (e provavelmente outras tabelas comerciais) têm a MESMA policy ampla (`is_active_staff()` em vez de permissão granular) — é um padrão sistêmico, não um bug introduzido agora. Fica registrado como pendência real para uma sessão dedicada de hardening de RLS, se o usuário quiser priorizar.

**Bloco 2 (Assinaturas e Financeiro) — verificação de coerência, sem alterar regra comercial**: confirmado que a criação manual de assinatura (`createSubscription`, tela `/sistema/assinaturas/nova`) **não** gera título financeiro automaticamente — isso é deliberado, feito depois, numa tela própria de revisão (`generateReceivableFromSubscriptionAction`, "Geração manual de UMA cobrança a partir de Assinatura"). A conversão de solicitação (Bloco 1) gera o título imediatamente, mas isso tem seu próprio checkpoint de revisão humana equivalente (`reviewSiteInterestAction`, que já exige o staff aprovar um "valor aprovado" antes de a conversão ficar disponível) — são dois portões de entrada diferentes, cada um com sua própria revisão; não é uma incoerência real, e não foi alterado. Idempotência da conversão (por `originTag` nas notas) confirmada e reaproveitada também pela nova conversão de publicidade/mista. **Limitação real não resolvida**: não há lock/claim atômico contra duas conversões *simultâneas* da mesma solicitação (corrida rara, exigiria dois cliques concorrentes do mesmo staff ou dois staff ao mesmo tempo); dado o volume de uso (poucos operadores, ação deliberada manual, não um endpoint público de alto tráfego), uma trava distribuída foi avaliada como risco maior que benefício (um "claim" malfeito podia deixar a solicitação travada em "converted" sem registro vinculado se a criação falhasse depois) — decisão de não implementar, registrada aqui para decisão futura do usuário.

**Bloco 3 (Modelos de Contrato) — minutas preparadas, achado de arquitetura documentado**: `docs/MODELOS-DE-CONTRATO-MINUTAS-DRAFT-20261031.md` traz as 6 minutas pedidas (assinatura anual impresso, publicidade impressa, publicidade digital, painel LED, locação de equipamentos, pacotes combinados), com os placeholders reais do sistema (`{{cliente.nome}}` etc., de `contract-template-merge.ts`) — **nenhuma cadastrada no banco** (sem migration de inserção, sem chamada a `createContractTemplateAction`; restrição explícita do usuário). **Achado real**: o motor de geração de PDF/assinatura (`resolveTemplateVariables`) hoje só resolve os placeholders automáticos a partir de um registro em `public.contracts` ("Contratos institucionais", `/sistema/financeiro/contratos`) — apesar do nome da tela, o schema (`InstitutionalContract`) é genérico (qualquer `clientId`, não só órgão público). Ou seja: mesmo depois de cadastrados os modelos, gerar um PDF assinável para uma assinatura/venda hoje exige um passo manual extra (criar um "Contrato institucional" ligado ao mesmo cliente) — a conversão de solicitação (Bloco 1) não cria esse registro automaticamente, e isso não foi alterado (decisão do usuário, não da sessão).

**Bloco 4 (Testes de integração) — real, com limitação honesta**: `apps/sistema` → **154/154** (`npx tsx --conditions=react-server --test apps/sistema/test/*.test.ts`, incluindo os 8 testes novos de parsing). `tsc --noEmit` limpo (confirmado duas vezes, antes e depois do ajuste de vínculo parcial da conversão mista). **`next build` NÃO foi confirmado limpo nesta sessão** — falhou 3 vezes seguidas com o mesmo erro genérico de I/O (`HookWebpackError: UNKNOWN: unknown error, read`, dentro de `Compilation.hooks.processAssets`, nunca um erro de tipo/compilação do código). Teste de controle: um `git stash` simples (sem nenhuma alteração de código envolvida) falhou com `fatal: mmap failed: Invalid argument` no mesmo momento — confirma que é uma instabilidade do disco sincronizado pelo OneDrive nesta sessão, não um defeito introduzido pelas mudanças (nenhuma alteração desta sessão toca build tooling/webpack). Nenhum dado foi perdido (`git status` confirmado íntegro após a falha do stash). Recomendação: repetir `next build` numa sessão futura, se possível fora de uma pasta sincronizada pelo OneDrive ou com o OneDrive pausado durante o build. **O que NÃO pôde ser testado**: os fluxos completos de ponta a ponta (solicitação → conversão → cliente real no Supabase → Pix/Asaas → WhatsApp → webhooks) exigem um Supabase/Asaas real — este ambiente de execução não tem acesso de rede a nenhum serviço externo nem a um Postgres local. A cobertura real ficou em: (a) lógica pura testada por unidade (parsing/decisão, sem I/O), (b) typecheck/build garantindo que a árvore de chamadas compila e está corretamente tipada, (c) leitura direta do código de permissão/RLS pra confirmar os gates. Simulação de webhooks, concorrência real contra o banco e repetição de cliques contra um servidor real **não foram exercitadas** — ficam como pendência real (precisam de homologação com Supabase acessível, mesmo princípio já registrado nas sessões de NFS-e).

ARQUIVOS: `apps/sistema/src/app/sistema/publicidade/solicitacoes/{actions.ts,page.tsx,siteInterestConversionHelpers.ts}` (novo), `apps/sistema/src/features/publicidade/ConvertAdvertisingInterestButton.tsx` (novo), `apps/sistema/src/lib/permissions/staffPermissionsCatalog.ts`, `apps/sistema/test/site-interest-conversion-helpers.test.ts` (novo), `supabase/migrations/20261031120000_site_interest_requests_granular_rls.sql` (novo, **não aplicada**), `docs/MODELOS-DE-CONTRATO-MINUTAS-DRAFT-20261031.md` (novo).

FALTA/BLOQUEIOS: nenhuma migration aplicada remotamente, nenhum cadastro real, nenhuma cobrança real, nenhuma mensagem enviada, sem push/merge/Preview/deploy — tudo conforme restrição explícita. Branch `nfse-homologacao-finalizacao-irc-20261029` e demais branches de outros agentes intocadas. Pendências reais listadas acima (RLS ampla do módulo Comercial fora do escopo; sem lock de concorrência na conversão — **corrigido no lote seguinte**; geração de contrato assinável não ligada automaticamente à conversão; testes de integração reais dependem de Supabase acessível).

## 01/11/2026 — Bloco 2 (Assinaturas e Financeiro): idempotência real, coerência de valores, vínculos visíveis

Continuação da mesma branch `solicitacoes-financeiro-contratos-irc-20261031`, a partir do commit `cd4e2762`. Antes de iniciar: `pwd`/branch/HEAD confirmados, árvore limpa. **Uma única tentativa** de `next build` (sem repetir) — falhou de novo com o mesmo `HookWebpackError: UNKNOWN: unknown error, read` em `processAssets`, idêntico às 3 falhas da sessão anterior; registrado sem atribuir ao código (nenhuma evidência aponta nessa direção — typecheck e suíte completa seguem 100% verdes). Pendência de ambiente, não de código.

**Item 5 do Bloco 2 (idempotência contra conversões simultâneas) — corrigido de verdade, não só documentado como limitação**: a idempotência das conversões (Bloco 1) dependia só de buscar um registro já existente por um texto-marcador nas notas ANTES de criar um novo — sem nenhuma trava, duas chamadas concorrentes (duplo clique, ou dois operadores convertendo a mesma solicitação ao mesmo tempo) podiam passar pela mesma checagem "ainda não existe" e cada uma criar sua própria assinatura/proposta, só a última gravando o vínculo final (a primeira ficaria órfã, sem erro visível). Implementada uma **trava otimista real**: nova coluna `conversion_started_at` (migration preparada, **não aplicada**, `supabase/migrations/20261101090000_site_interest_requests_conversion_claim.sql`) + função `claimConversion`, que faz um UPDATE condicional (`WHERE status NOT IN ('converted','discarded') AND (conversion_started_at IS NULL OR conversion_started_at < agora-2min)`) ANTES de criar qualquer coisa — só uma das chamadas concorrentes consegue gravar essa primeira escrita; a outra recebe 0 linhas afetadas e devolve erro amigável sem criar nada. Em qualquer falha depois da trava, `releaseConversionClaim` libera de volta pra `null` (nunca bloqueia uma nova tentativa legítima); se o processo crashar sem liberar, a janela de 2 minutos (`CONVERSION_CLAIM_STALE_AFTER_MS`) trata como abandonada automaticamente, sem exigir outra migration. Usada nas duas ações (`convertSubscriptionInterestAction` e `convertAdvertisingInterestAction`).

**Item 3 do Bloco 2 (pacotes mistos sem duplicar valores) — achado real + correção de validação**: confirmado que cada seleção de `selections` é classificada em exatamente um balde (`advertisingSelections` só pega `print_ad`/`digital_ad`; `subscriptionSelectionAmount` só pega o item de assinatura) — nunca soma o mesmo item duas vezes. **Achado não corrigido automaticamente (decisão do usuário, não da sessão)**: `approved_total` (um único valor pro pedido inteiro, definido manualmente na revisão) nunca era usado nos valores reais da proposta/assinatura — a conversão sempre usava o preço bruto de cada item de `selections`, ignorando silenciosamente qualquer desconto/ajuste que o operador tivesse aprovado no valor total. Não dá pra ratear esse valor automaticamente entre assinatura e publicidade sem inventar uma regra comercial. **Correção aplicada**: a conversão agora BLOQUEIA (em vez de ignorar silenciosamente) quando `approved_total` diverge da soma real dos itens em mais de 1 centavo — `advertisingItemsTotal`/`approvedTotalDivergesFromItems` (novas, testadas), com mensagem clara pedindo pra reconciliar itens ou valor aprovado antes de converter.

**Item 2 do Bloco 2 (momento da ativação) — achado documentado, NADA alterado automaticamente, conforme instrução explícita**: a criação manual de assinatura (`createSubscription`, `/sistema/assinaturas/nova`) deixa o `status` como campo livre escolhido pelo operador (pode criar já "suspensa" até confirmar pagamento/contrato). A conversão de solicitação (Bloco 1, sem alteração nesta etapa) sempre grava `status: "active"` incondicionalmente, sem esperar confirmação de pagamento nem formalização contratual (que hoje nem existe automaticamente — ver achado do Bloco 3 sobre "Contratos institucionais"). **Consequência real, se isso não mudar**: o cliente começa a receber o jornal impresso e fica com título em aberto desde a conversão, mesmo que nunca confirme o pagamento ou assine contrato depois — e hoje não há nenhuma trava que impeça isso. Fica registrado pra decisão explícita do usuário (ex.: ativação condicionada à confirmação do pagamento, ou manter como está por ser mais simples operacionalmente); nenhuma regra comercial foi mudada nesta sessão.

**Item 6 (preservação de títulos pagos/históricos)** — confirmado por leitura de código, sem necessidade de mudança: `ensureSubscriptionAndReceivable` só CRIA um recebível quando nenhum já existe pra aquela assinatura/competência — nunca atualiza um recebível existente (pago, cancelado ou não). Com a trava do item 5, uma solicitação já `status = 'converted'` nunca mais passa por `claimConversion` (ambas as ações recusam de novo, e agora também no nível do UPDATE condicional) — proteção extra, em mais de uma camada, especificamente contra tocar de novo a solicitação de teste já convertida/paga que o usuário pediu pra preservar (nenhum dado dessa solicitação foi lido ou alterado nesta sessão — sem acesso a Supabase real neste ambiente).

**Item 7 (permissões)**: sem mudança — `convertSubscriptionInterestAction` já usa `assinaturas.assinaturas_criar` (mesma do formulário manual) e `convertAdvertisingInterestAction`/demais ações já usam `publicidade.solicitacoes_gerenciar` (Bloco 1); a nova trava de conversão passa pelas mesmas duas permissões, sem introduzir uma terceira.

**Item 8 (coerência pro operador)**: adicionado link direto "ver assinatura" (`/sistema/assinaturas/[id]`) na lista de solicitações — antes só havia link pro financeiro e pra proposta, faltava a assinatura em si.

TESTES: 5 testes novos (`advertisingItemsTotal`/`approvedTotalDivergesFromItems`, casos de soma simples, tolerância de 1 centavo, e os dois cenários reais de divergência — desconto de combo aprovado e itens editados depois da aprovação). `apps/sistema` → **156/156** (`npx tsx --conditions=react-server --test apps/sistema/test/*.test.ts`). `tsc --noEmit` limpo. A trava de concorrência (`claimConversion`/`releaseConversionClaim`) depende de UPDATE condicional real contra Postgres — não testável por unidade sem Supabase; verificada por leitura cuidadosa da sintaxe PostgREST (`.not("status","in","(...)")`/`.or(...)`) e pelo typecheck, que a compila corretamente contra os tipos do cliente Supabase.

ARQUIVOS: `apps/sistema/src/app/sistema/publicidade/solicitacoes/{actions.ts,page.tsx,siteInterestConversionHelpers.ts}`, `apps/sistema/test/site-interest-conversion-helpers.test.ts`, `supabase/migrations/20261101090000_site_interest_requests_conversion_claim.sql` (novo, **não aplicada**).

FALTA/BLOQUEIOS: `next build` continua não confirmado (pendência de ambiente, registrada sem repetir indiscriminadamente, conforme instrução). Duas decisões comerciais deliberadamente NÃO tomadas nesta sessão, aguardando o usuário (ativação condicionada a pagamento/contrato; rateio de desconto em pacotes mistos — hoje bloqueado em vez de ignorado). RLS ampla do módulo Comercial (fora do escopo) e testes de integração reais (Supabase/Asaas/WhatsApp) seguem como pendências já registradas no lote anterior. Sem push, merge, Preview, deploy ou migration remota.

## 01/11/2026 — Bloco 3 (Modelos de Contrato): minutas reais, categorias corretas, achado dos dois assinadores

Continuação da mesma branch `solicitacoes-financeiro-contratos-irc-20261031`, a partir do commit `601bde6f`. Antes de iniciar: `pwd`/branch/HEAD confirmados, árvore limpa, `git fetch origin` executado, branches/worktree/stash de outros agentes confirmados intocados (mesmo estado do lote anterior). Detalhe completo em `docs/MODELOS-DE-CONTRATO-MINUTAS-BLOCO3-20261101.md` — aqui só o resumo executivo.

**Achado central (exatamente o que o usuário pediu pra verificar antes de definir os modelos)**: existem DOIS mecanismos de merge de placeholder no sistema, com vocabulários diferentes — o mais antigo (`contract-template-merge.ts`, achado já registrado no lote de 31/10) e um pipeline **completo e muito mais recente** (Nov/2026, não construído nesta sessão) especificamente pra vendas comerciais (`commercial_sales`/`commercial_contract_packages`/`assign_commercial_contract_default_templates`), com **seleção automática real de modelo** por `categoria = "commercial_" + canal_do_serviço` (`newspaper`/`website`/`social_media`/`led_panel`/`equipment_rental`/`package`/`other`) ou `"commercial_combined"`. Usar as 4 categorias "sugeridas" genéricas (`publicidade`, `prestacao_servicos` etc., como a minuta de 31/10 tinha usado) teria feito os modelos nunca serem selecionados automaticamente — corrigido antes de cadastrar qualquer coisa.

**Bug real corrigido**: a validação de chave de variável (`VARIABLE_KEY_RE` em `packages/core/src/financeiro/contract-template-service.ts`) não aceitava ponto, mas o pipeline comercial EXIGE que o modelo declare `contratada.razao_social`/`cnpj`/`endereco`/`representante` (com ponto) em `variables` pra passar a emissão (`missingCommercialLegalParties`). Ou seja: **nenhum modelo comercial jamais teria passado da tela de cadastro** desde que esse pipeline foi construído — ninguém tinha notado porque a tabela está vazia. Regex corrigida pra aceitar exatamente um `prefixo.sufixo`; 2 testes novos cobrindo aceitação do padrão real e rejeição de variações malformadas.

**6 minutas preparadas** (migration `supabase/migrations/20261101100000_contract_templates_seed_minutas.sql`, **não aplicada**, todas com `active = false` — nenhuma juridicamente aprovada nem selecionável automaticamente até alguém ativar depois da revisão): assinatura anual (`assinaturas`), publicidade impressa (`commercial_newspaper`), publicidade digital (`commercial_website`), painel LED (`commercial_led_panel`), locação de equipamentos (`commercial_equipment_rental`), pacote combinado (`commercial_combined`). Nenhum dado fiscal real, valor ou condição comercial foi inventado. 4 testes novos (`apps/sistema/test/contract-templates-seed-minutas.test.ts`) leem a migration de verdade e chamam as funções de validação REAIS (`missingCommercialLegalParties`, `ContractTemplateService.create`) — não uma cópia da lógica — confirmando que as 6 minutas passam.

**Seleção automática (item 2) e regras de rateio (item 4) — verificadas, já corretas, sem necessidade de código novo**: o pipeline comercial já identifica a modalidade pelo canal real, já suporta documento combinado ou separado, já usa o valor negociado por item (snapshot imutável) sem jamais ratear automaticamente (lança erro em vez de dividir), já exige vigência por serviço, já vincula ao cadastro único do cliente, já versiona documentos sem sobrescrever. **Esse pipeline só cobre vendas comerciais — assinaturas nunca passam por ele** (mesma lacuna já registrada no Bloco 1/2, reconfirmada).

**Achado importante do assinador (item 3)**: o sistema já tem DOIS pipelines de assinatura eletrônica separados — institucional (`contract_signature_invitations`, 16/10) e comercial (`commercial_signature_requests`/`commercial_signature_invitations`, 13/11, comentário da própria migration: "Assinatura comercial separada do assinador institucional"). Nenhum terceiro foi criado nesta sessão (instrução respeitada). Fica documentado como decisão arquitetural de sessão anterior, pra o usuário decidir se unifica.

TESTES: `apps/sistema` → **160/160** (incluindo os 4 novos de minutas; os 11 testes `commercial-*.test.ts` pré-existentes continuam passando depois da correção da regex). `packages/core` → **178/178** (incluindo os 2 novos de validação de chave). `tsc --noEmit` limpo. **`next build`: uma única tentativa, falhou de novo com o mesmo tipo de erro de I/O já registrado nos lotes anteriores** (`UNKNOWN: unknown error, read`, agora na fase de carregamento de módulo do worker do Next, não mais em `processAssets` — mesma categoria de instabilidade do disco sincronizado pelo OneDrive, não um erro de tipo/compilação; typecheck e suíte completa seguem 100% verdes). Não repetido, conforme instrução.

ARQUIVOS: `packages/core/src/financeiro/contract-template-service.ts`, `packages/core/test/contract-template.test.ts`, `apps/sistema/test/contract-templates-seed-minutas.test.ts` (novo), `supabase/migrations/20261101100000_contract_templates_seed_minutas.sql` (novo, **não aplicada**), `docs/MODELOS-DE-CONTRATO-MINUTAS-BLOCO3-20261101.md` (novo, detalhe completo), `docs/MODELOS-DE-CONTRATO-MINUTAS-DRAFT-20261031.md` (nota de superseding adicionada no topo).

FALTA/BLOQUEIOS: pendências jurídicas (revisão humana das 6 minutas, nenhuma aprovada) e comerciais (unificar ou não os dois assinadores; ligar ou não documento automático à conversão; "publicidade digital" como um ou dois modelos; quem pode ativar um modelo hoje é qualquer staff ativo, não só admin/owner) — todas listadas em detalhe em `docs/MODELOS-DE-CONTRATO-MINUTAS-BLOCO3-20261101.md`, nenhuma decidida ou alterada automaticamente nesta sessão. `next build` seguindo pendente por instabilidade de ambiente. Nenhum dado real do Supabase tocado, nenhuma migration remota aplicada, nenhum convite/contrato/cobrança/WhatsApp enviado, sem push/merge/Preview/deploy. NFS-e, Agenda e Altnix Informativo intocados.

## 01/11/2026 — Bloco 4 (Homologação integrada): 7 fluxos testados, nenhum bug novo de aplicação — 3 lacunas reais de cobertura preenchidas

Continuação da mesma branch `solicitacoes-financeiro-contratos-irc-20261031`, a partir do commit `23d21bb5`. Antes de iniciar: `pwd`/branch/HEAD confirmados, árvore limpa, `git fetch origin` executado, branches/worktree/stash de outros agentes confirmados intocados (mesmo estado dos lotes anteriores, sem merge/rebase).

**Resultado honesto, diferente dos 3 lotes anteriores**: este lote **não encontrou nenhum bug novo na aplicação**. Os 7 fluxos pedidos foram verificados com testes simulados reais (serviços de `packages/core`/`apps/sistema` de verdade, repositórios fake em memória — nunca Supabase real, que não existe neste ambiente) e todos já funcionam corretamente por construção. O valor real deste lote foi **encontrar e preencher 3 lacunas de cobertura de teste** em peças financeiramente críticas que nunca tinham sido testadas (achado real, não assumido — confirmado por busca, zero arquivo de teste existia pra nenhuma das três antes desta sessão):

1. **`ReceivableService.registerFromSubscription`** (prevenção de cobrança duplicada de assinatura) — 6 testes novos (`packages/core/test/receivable-subscription-duplicate-prevention.test.ts`): primeira cobrança cria normalmente; segunda tentativa pra mesma assinatura+competência é bloqueada pela pré-checagem (nunca chega a tentar criar no banco); competência diferente não é bloqueada (duplicidade é por competência, nunca por assinatura isolada); corrida real simulada (pré-checagem passa, índice único do banco pega) é traduzida pro erro de domínio, nunca deixa a mensagem bruta do Postgres escapar; `sourceType` errado e competência ausente são recusados.
2. **`CommercialProposalService`** (nenhum teste existia) — 7 testes novos (`packages/core/test/commercial-proposal-service.test.ts`): validação de registro, transições de status pela tabela oficial (confirmado que `draft` pode ir direto pra `approved`, achado de comportamento real não documentado antes), e o mais importante pro item 7 do Bloco 4 — `markConverted` nunca permite converter a MESMA proposta duas vezes (`CommercialProposalAlreadyConvertedError`), protegendo contra duas vendas geradas da mesma proposta.
3. **Idempotência do webhook simulado** (`PaymentChargeService.confirmPixCharge`) — 3 testes novos (`packages/core/test/payment-charge-webhook-idempotency.test.ts`): simula o Asaas entregando o mesmo evento de pagamento 2 e 3 vezes (comportamento real e documentado do provedor) — confirma que o service repassa `alreadyConfirmed=true` sem reprocessar, nunca cria um segundo recibo, delegando a atomicidade real pro banco (RPC `confirm_payment_charge`, já correta desde `20261027100500_confirm_payment_charge_idempotency_fix.sql`, não tocada).

**2 testes de integração ponta a ponta NOVOS**, cada um encadeando múltiplos serviços reais pela primeira vez (nenhum teste existente fazia isso — cada peça só era testada isolada):
- `apps/sistema/test/bloco4-subscription-contract-financeiro-integration.test.ts` (Fluxo 2: assinatura → contrato → financeiro): cliente → assinatura → contrato institucional → **minuta REAL "assinaturas" lida do seed do Bloco 3** (nunca uma cópia) renderizada com `resolveTemplateVariables` sem nenhum placeholder pendente → título financeiro, confirmando `clientId`/valores coerentes entre os 4 módulos e bloqueio de cobrança duplicada na mesma competência.
- `apps/sistema/test/bloco4-proposal-sale-document-signers-integration.test.ts` (Fluxos 3+4+5: publicidade→proposta→venda→contrato, pacotes mistos, modelo→PDF→assinatura simulada): proposta com 2 serviços de canais diferentes (LED + jornal impresso) → aprovada → venda (valores individuais preservados, total nunca dividido automaticamente — o próprio `CommercialSaleService` rejeita se não bater) → `markConverted` (nunca duas vezes) → qualificação do cliente do cadastro mestre → **minuta REAL "commercial_combined" lida do seed do Bloco 3** passa `missingCommercialLegalParties` → anexo operacional sem pendência → documento final renderizado sem nenhum placeholder sobrando → signatários (contratante+contratada) validados e prontos pro assinador (nunca enviado de verdade).

**Item 1 (solicitação→aprovação→cliente) e item 7/permissões**: reaproveitados dos Blocos 1/2 sem necessidade de novo código — `claimConversion`, `approvedTotalDivergesFromItems`, `checkModuleAction`/`checkFinanceAction` já cobrem exatamente isso; não repetida a auditoria geral desses blocos, conforme instrução.

**6 minutas inativas preservadas**: nenhuma alteração em `active`; a migration do Bloco 3 continua não aplicada. Nenhuma regra de ativação de assinatura ou rateio automático de pacote misto foi alterada (instrução explícita respeitada — o teste de integração do Fluxo 3/4/5 inclusive comprova, rejeitando um valor de venda que não bate com a soma dos itens, que o rateio automático continua impossível por desenho).

TESTES: `apps/sistema` → **162/162** (incluindo os 2 novos de integração). `packages/core` → **194/194** (incluindo os 3 arquivos novos, agora também adicionados ao script `test` de `packages/core/package.json` — antes não rodavam com `npm test`). `tsc --noEmit` limpo. **`next build`: uma única tentativa — progrediu mais que nas tentativas anteriores** (`✓ Compiled successfully`, ou seja, o código compila corretamente) **mas travou de novo no mesmo erro de I/O já conhecido** (`UNKNOWN: unknown error, read`, agora na fase de "Linting and checking validity of types", nunca chegou a produzir nenhum erro de lint/tipo real) — ambiente, não código; não repetido.

ARQUIVOS: `packages/core/test/{receivable-subscription-duplicate-prevention,commercial-proposal-service,payment-charge-webhook-idempotency}.test.ts` (novos), `packages/core/package.json` (script `test` atualizado com os 3 arquivos novos), `apps/sistema/test/bloco4-{subscription-contract-financeiro,proposal-sale-document-signers}-integration.test.ts` (novos).

FALTA/BLOQUEIOS: nenhum bug novo de aplicação pendente de correção — este lote foi majoritariamente de verificação e preenchimento de lacuna de teste. Pendências já registradas nos lotes anteriores continuam as mesmas (jurídicas/comerciais do Bloco 3; `next build` por instabilidade de ambiente). Nenhum dado real do Supabase tocado, nenhuma migration remota aplicada/executada, nenhum convite/contrato/cobrança/WhatsApp enviado, sem push/merge/Preview/deploy. NFS-e, Agenda e Altnix Informativo intocados.

## 02/11/2026 — Cadastro inicial e complementar (Blocos A/B/C)

Continuação da mesma branch `solicitacoes-financeiro-contratos-irc-20261031`, a partir do commit publicado `7c061ddf`. Antes de iniciar: `pwd`/branch/HEAD confirmados, `git fetch origin` executado, branch local idêntica à remota (sem divergência, sem fast-forward necessário), 4 blocos anteriores + ajuste do YouTube confirmados íntegros.

**Bloco A — Identificação inicial no formulário do portal** (`apps/site/src/components/site/public/AssineConfigurator.tsx`): CPF/CNPJ e o seletor "Tipo" (PF/PJ) saíram do bloco condicional "só quando há assinatura" e passaram a ser sempre exigidos, para qualquer tipo de solicitação (assinatura, publicidade ou mista) — endereço continua condicional (só quando há assinatura, pra análise de rota). Nova migration `supabase/migrations/20261120270000_site_interest_request_identification.sql` (**não aplicada**) redefine `submit_site_interest_request_v4` (mesma assinatura, `create or replace`) para exigir documento sempre e acrescenta `matched_client_id`/`matched_client_ambiguous` em `site_interest_requests`: a função agora busca silenciosamente um cliente já cadastrado pelo CPF/CNPJ (nunca por nome/telefone) e grava o match internamente — a resposta da RPC pro público nunca muda, nenhuma mensagem de erro/sucesso revela se o documento já existe. Documento batendo em mais de um cliente (cadastro legado duplicado) fica marcado `matched_client_ambiguous = true`, sem resolver automaticamente.

**Bloco B — Complementação cadastral**, reaproveitando `clients` (mestre) e `birthday_entries` (base editorial de Aniversariantes já existente, ainda não aplicada) — nenhum CRM novo criado, nenhuma duplicidade de CPF/CNPJ:
- Migration `20261120280000_client_related_persons.sql` (nova tabela `client_related_persons`: responsável/sócio/colaborador vinculado a um cliente PJ, satélite de `clients`, RLS `is_active_staff()`, soft delete).
- Migration `20261120290000_birthday_entries_consent_and_sync.sql`: acrescenta `consent_status`/`consent_recorded_by`/`consent_recorded_at`/`is_minor`/`guardian_name` em `birthday_entries` e troca o default de `publish_in_print` para `false` — constraint nova impede `publish_in_print = true` sem `consent_status = 'granted'` (nunca mais presume autorização de publicação, inclusive pra menores, que exigem `guardian_name`). Trigger `clients_sync_birthday_entry` mantém a linha `origin='cadastro'` de um titular espelhada a partir de `clients.birth_date`/`founding_date`, sem jamais criar essa linha automaticamente. Nova coluna `clients.family_members_confirmed_empty` guarda a confirmação discreta (uma única vez) de "sem familiares a cadastrar".
- Migration `20261120300000_client_completion_tokens.sql` (**não aplicada**, mesma regra de `birthday_entries`: desenvolver agora, aplicar depois): tabela + 4 funções (`generate_client_completion_token`, `reserve_client_completion_otp`, `verify_client_completion_channel`, `consume_client_completion_token`) para o link individual seguro de complementação — token com hash (nunca em claro no banco), expiração de 72h, uso único, revogação automática de qualquer link anterior ainda ativo do mesmo cliente, allow-list de campos editáveis (nunca CPF/CNPJ/kind por este caminho), e o mesmo rate limit de OTP já aprovado para assinatura comercial (60s/24h/máx. 8). A verificação de posse de canal é delegada ao Supabase Auth (mesmo princípio da assinatura comercial), não implementada nesta sessão.
- Server Actions novas (`apps/sistema/src/app/sistema/clientes/complementacao-actions.ts`): adicionar/remover familiar (dia/mês, consentimento sempre nasce pendente), confirmar "sem familiares", adicionar/remover pessoa vinculada (PJ), gerar o link de complementação — **esta última ação só devolve o caminho (`urlPath`) pra equipe copiar; não envia nada automaticamente.**
- UI nova na tela de detalhe do cliente (`apps/sistema/src/app/sistema/clientes/[id]/page.tsx`): `FamilyAndRelatedPersonsControl` (familiares para PF / pessoas vinculadas para PJ, com a confirmação discreta de "sem familiares") e `CompletionLinkControl` (gera o link, mostra validade e aviso de que nada é enviado automaticamente).
- **Explicitamente fora deste lote:** a página pública que consome o token (`/complementar-cadastro/[token]`) e qualquer envio real de link — adiados por decisão explícita de não enviar links reais nesta sessão.

**Bloco C — Assinaturas e financeiro**: `convertSubscriptionInterestAction`/`convertAdvertisingInterestAction` (`apps/sistema/src/app/sistema/publicidade/solicitacoes/actions.ts`) passaram a exigir um parâmetro `confirmed: boolean` (rejeitado se não for `true`) — defesa em profundidade atrás de uma nova UI de dois passos em `ConvertSubscriptionInterestButton.tsx`/`ConvertAdvertisingInterestButton.tsx`: o primeiro clique mostra um resumo (cliente, serviço, valor aprovado, forma de pagamento) e só o segundo clique ("Confirmar e criar") de fato chama a Server Action. **Decisão que segue pendente de aprovação explícita do usuário** (registrada também em `docs/ACORDOS-E-FONTE-DA-VERDADE.md`): hoje a assinatura nasce com status `active` e o primeiro título financeiro é criado no mesmo clique — não existe hoje um status "pendente de formalização" em `SubscriptionStatus` (`packages/types/src/assinaturas/index.ts`); separar isso em estados distintos (ex.: assinatura "pendente" até uma ativação explícita separada da geração de cobrança) exigiria mudança de schema com impacto em todo o módulo de Assinaturas, deliberadamente não feita sem decisão explícita do usuário.

TESTES: `packages/core` → **194/194** (sem mudança — nenhuma lógica de `packages/core` foi tocada neste lote). `apps/sistema` → **162/162** (toda a suíte, incluindo os 2 testes de integração do Bloco 4 e o helper de conversão — nenhuma regressão pela mudança de assinatura das duas Server Actions). `tsc --noEmit` limpo em `apps/site` e `apps/sistema`. **Nenhum teste automatizado novo foi escrito** para as Server Actions/UI novas deste lote (mesmo padrão já existente no projeto: `digital-export-actions.ts`/`validateClientPayload` também não têm teste dedicado — são wrappers finos sobre Supabase; a validação de negócio real fica nas constraints SQL, que não têm como ser exercitadas sem um Postgres real). `next build` **não executado neste lote** (instabilidade de I/O do OneDrive já documentada nos lotes anteriores; typecheck + suíte completa já dão sinal forte de que não há erro de tipo/sintaxe).

ARQUIVOS: `apps/site/src/components/site/public/AssineConfigurator.tsx` (editado); `supabase/migrations/20261120270000_site_interest_request_identification.sql`, `20261120280000_client_related_persons.sql`, `20261120290000_birthday_entries_consent_and_sync.sql`, `20261120300000_client_completion_tokens.sql` (novas, **nenhuma aplicada**); `apps/sistema/src/app/sistema/clientes/complementacao-actions.ts` (novo); `apps/sistema/src/features/clientes/{FamilyAndRelatedPersonsControl,CompletionLinkControl}.tsx` (novos); `apps/sistema/src/app/sistema/clientes/[id]/page.tsx` (editado); `apps/sistema/src/app/sistema/publicidade/solicitacoes/actions.ts`, `apps/sistema/src/app/sistema/publicidade/solicitacoes/page.tsx`, `apps/sistema/src/features/publicidade/{ConvertSubscriptionInterestButton,ConvertAdvertisingInterestButton}.tsx` (editados).

**Não tocados, por instrução explícita:** `apps/sistema/src/features/aniversariantes/BirthdaysList.tsx` e `messageGenerator.ts` (o usuário está preparando separadamente as alterações do modal/frases — nenhuma versão concorrente foi criada; a base de dados que este lote estende, `birthday_entries`, é consumida por esses arquivos, mas nenhuma linha deles foi editada).

## 02/11/2026 — Build local do OneDrive corrigido; patch de Aniversariantes (150 modelos + "Gerar tabela") homologado

Mesma sessão, antes de Blocos D/E. Diagnóstico completo do `next build` falhando sempre por I/O (pendência registrada em todos os lotes anteriores): dois problemas distintos e reais, nenhum bug de aplicação — (1) `staticPageGenerationTimeout` padrão (60s) insuficiente pra "Collecting page data" de `/sistema/financeiro/contratos/[id]` (rota mais pesada em módulos) só por I/O lento do OneDrive (confirmado isolando a página compilada via `require()` direto: ~0,3s); (2) `outputFileTracing` (nodeFileTrace/@vercel/nft) falha deterministicamente lendo reparse points do OneDrive — etapa que só serve pra `output: "standalone"`, que o projeto não usa. Ambos corrigidos em `apps/sistema/next.config.mjs`, **condicionados a `IR_LOCAL_ONEDRIVE_BUILD=1`** (pedido explícito do usuário para nunca afetar o build de produção da Vercel, que não roda em OneDrive): sem a variável, o comportamento padrão do Next foi confirmado idêntico ao original (mesma falha reproduzida); com a variável, build completo em ~1m16–1m21s. `next build` finalmente **confirmado limpo nesta sessão**, depois de vários lotes anteriores registrando a mesma pendência de ambiente.

Também confirmado, a pedido do usuário, que o patch de Aniversariantes (aplicado pelo usuário antes deste lote, fora desta sessão de diagnóstico) permaneceu intacto durante todo o trabalho: `BirthdaysList.tsx`/`messageGenerator.ts`, 157 linhas adicionadas / 3 removidas, repertório de **150 modelos** (`TEMPLATES`) confirmado por contagem programática, modal "Gerar tabela"/"Copiar tabela" presente e respeitando os mesmos filtros (período/cidade/publicação/origem) já aplicados na árvore — cópia e tabela só incluem entradas ativas e com `publishInPrint` autorizado.

TESTES: `tsc --noEmit` limpo; `packages/core` → 194/194; `apps/sistema` → 162/162; `next build` com `IR_LOCAL_ONEDRIVE_BUILD=1` → sucesso; `next build` sem a variável → reproduz a falha original (confirma que o padrão de produção não foi alterado).

ARQUIVOS: `apps/sistema/next.config.mjs` (editado, condicionado); `apps/sistema/src/features/aniversariantes/{BirthdaysList.tsx,messageGenerator.ts}` (do usuário, só confirmados — sem edição desta sessão).

FALTA/BLOQUEIOS: nenhum. Commits locais separados: `dfddec21` (Aniversariantes) e `8da39d44` (build condicionado).

## 02/11/2026 — Bloco D (Página pública de complementação cadastral)

Continuação da mesma branch/sessão, a partir do commit `8da39d44`. Implementa a página pública que faltava desde o Bloco B (`/complementar-cadastro/[token]`), reaproveitando a infraestrutura de token já preparada (`client_completion_tokens` + `generate_client_completion_token`/`reserve_client_completion_otp`/`verify_client_completion_channel`, todas de `20261120300000`) — nenhuma segunda estrutura de clientes criada.

**Rota pública** (`apps/sistema/src/app/complementar-cadastro/[token]/page.tsx` + `actions.ts`), no mesmo padrão já usado por `/assinar-contrato-comercial/[token]` (fora do `matcher` do middleware — não exige sessão de staff; `next.config.mjs` ganhou o mesmo `Referrer-Policy: no-referrer`/`X-Robots-Tag: noindex`/`Cache-Control: private, no-store` do link comercial). Verificação de posse de canal reaproveita exatamente o padrão já testado de `assinar-contrato-comercial/actions.ts`: `supabase.auth.signInWithOtp`/`verifyOtp` (e-mail ou telefone, conforme o canal gravado no token) — nenhum mecanismo de código novo inventado. **Nenhuma ação lê ou grava dado algum sem uma sessão real do Supabase Auth** (`createSupabaseServerClient().auth.getUser()`), nunca confiando em `client_id`/`auth_user_id` vindo do navegador.

Nova migration `supabase/migrations/20261120310000_client_completion_public_flow.sql` (**não aplicada**, mesma regra: desenvolver agora, aplicar depois de homologação):
- `require_verified_client_completion` (helper interno): centraliza a exigência de `status='verified'` + mesmo `verified_user_id` + não expirado antes de qualquer leitura/escrita — "antes de exibir ou modificar dados já existentes, exigir verificação de posse de canal" aplicado literalmente a toda função nova.
- `get_client_completion_snapshot`: devolve os dados para prefill do formulário (nunca CPF/CNPJ) — dados de contato/endereço, nascimento/fundação, familiares e pessoas vinculadas já cadastrados.
- `public_complete_add_family_member`/`public_complete_add_related_person`: inserção imediata (mesmas tabelas/regras de `complementacao-actions.ts`, só trocando `is_active_staff()` pela verificação do token) — publicação de familiar nunca presumida (`publish_in_print` só `true` quando o próprio titular marca consentimento explícito no formulário).
- `consume_client_completion_token` alterada (`create or replace`, mesma função — nenhum caller existia ainda em código, mudança segura): allow-list ampliada com `birth_date`/`founding_date`/`family_members_confirmed_empty`, mais o parâmetro especial `titular_consent` (não é coluna de `clients`) e um novo parâmetro `p_finalize boolean default true` — `false` grava autosave intermediário (link continua verificável e usável), `true` também conclui (`status -> completed`, uso único). Quando o titular grava nascimento/fundação completo, a função agora **cria automaticamente** a linha `birthday_entries` `origin='cadastro'` se ainda não existir (satisfaz "titular aproveitado automaticamente na lista de Aniversariantes") — mas só quando o próprio titular preenche a data pelo link; nunca presume `publish_in_print=true` sem `titular_consent` explícito. O trigger `sync_birthday_entry_from_client` (Bloco B) continua intocado — só atualiza linha já existente, nunca cria.

**Formulário único** (`apps/sistema/src/features/clientes/ClientCompletionWizard.tsx`), pensado pra caber no celular sem passos "avançar/voltar" separados: seção de código de verificação primeiro (nada de dados é exibido antes disso); depois, seções de contato/endereço, nascimento completo (PF) ou fundação (PJ), consentimento de publicação do próprio titular, familiares (PF, com consentimento por familiar, nunca presumido) ou pessoas vinculadas (PJ); confirmação discreta de "sem familiares a cadastrar" aparece **uma única vez**, só ao tentar concluir com a lista vazia e sem confirmação anterior, com opção de voltar e adicionar ou continuar sem cadastrar; tela final de "Cadastro concluído".

TESTES: `tsc --noEmit` limpo em `apps/sistema` e `apps/site`; `packages/core` → 194/194 (sem mudança); `apps/sistema` → 162/162 (sem mudança — nenhum teste automatizado novo escrito para a página pública/Server Actions, mesmo padrão já registrado no Bloco C: wrappers finos sobre Supabase, validação real nas constraints SQL, sem Postgres real neste ambiente para exercitá-las). `next build` com `IR_LOCAL_ONEDRIVE_BUILD=1` → sucesso, com a rota `/complementar-cadastro/[token]` confirmada na listagem de saída do build.

ARQUIVOS: `supabase/migrations/20261120310000_client_completion_public_flow.sql` (novo, **não aplicada**); `apps/sistema/src/app/complementar-cadastro/{[token]/page.tsx,actions.ts}` (novos); `apps/sistema/src/features/clientes/ClientCompletionWizard.tsx` (novo); `apps/sistema/src/lib/clientes/clientCompletionTokens.ts` (novo); `apps/sistema/next.config.mjs` (editado, novo bloco de headers).

FALTA/BLOQUEIOS: nenhum link real foi enviado (a ação da equipe que gera o link, do Bloco B, continua só copiando o caminho); a verificação por OTP via Supabase Auth depende de SMTP/SMS configurados no projeto Supabase (mesma dependência já documentada pro assinador comercial) — não exercitada de ponta a ponta sem um Supabase real acessível. Migration não aplicada em produção. Sem push/merge/Preview/deploy.

## 02/11/2026 — Bloco E (Assinatura "pendente de formalização")

Continuação da mesma branch/sessão, a partir do commit `39a6dbeb`. Resolve a decisão que ficou explicitamente pendente de aprovação desde o Bloco C: hoje toda assinatura nasce "pendente de formalização" (nunca `active` direto), com ativação e geração de cobrança como ações separadas e expressas.

**`packages/types/src/assinaturas/index.ts`**: novo status `pending_formalization` em `SubscriptionStatus`/`SUBSCRIPTION_STATUSES`/`SUBSCRIPTION_STATUS_LABELS` ("Pendente de formalização"); `SUBSCRIPTION_STATUS_TRANSITIONS.pending_formalization = ["active", "cancelled"]` — é sempre origem, nunca destino de uma transição (nenhum outro estado volta pra ele).

**`packages/core/src/assinaturas/subscription-service.ts`**: `register()` agora usa `pending_formalization` como default quando `status` não é informado explicitamente (antes era `active`); novo método `activate()` (transição dedicada pra `active`, mesmo mecanismo de `reactivate()` mas semanticamente e, principalmente, por PERMISSÃO separada — ver abaixo).

**Server Actions/UI de Assinaturas**:
- `apps/sistema/src/app/sistema/assinaturas/actions.ts`: nova `activateSubscriptionAction(id)`, gated por `assinaturas_ativar` (permissão NOVA, separada de `assinaturas_criar` — `staffPermissionsCatalog.ts`).
- `apps/sistema/src/features/assinaturas/SubscriptionStatusActions.tsx`: botão "Ativar assinatura" só quando `status === "pending_formalization"`, mesmo padrão visual de Suspender/Reativar/Cancelar já existente.
- `apps/sistema/src/features/assinaturas/SubscriptionForm.tsx`: criação agora trava o seletor de status em `pending_formalization` (`allowedStatuses = ["pending_formalization"]` em vez de `["active"]`), com texto explicativo; botão de criar renomeado para "Gerar assinatura" (mesmo verbo do fluxo aprovado pelo usuário).

**Geração de cobrança passa a recusar assinatura ainda pendente**: `generateReceivableFromSubscriptionAction` e `generateReceivablesForSubscriptionPeriodAction` (`apps/sistema/src/app/sistema/financeiro/contas-a-receber/actions.ts`) agora consultam o status da assinatura e devolvem erro amigável ("Ative a assinatura antes de gerar cobrança...") em vez de criar o título, quando `status === "pending_formalization"`.

**Revisão de TODOS os caminhos de conversão existentes** (pedido explícito do usuário): `ensureSubscriptionAndReceivable` (`apps/sistema/src/app/sistema/publicidade/solicitacoes/actions.ts`, usada por `convertSubscriptionInterestAction` e `convertAdvertisingInterestAction`/pacote misto, Bloco C) foi alterada para criar a assinatura só como `pending_formalization` e **parou de criar o primeiro título financeiro automaticamente** (antes criava os dois juntos, numa única função) — a função/interface `EnsuredSubscription` perdeu os campos `receivableId`/`receivableReference`; `ConvertSubscriptionInterestResult` também perdeu `receivableId`. `converted_receivable_id` em `site_interest_requests` passa a ser sempre gravado como `null` nessas duas conversões (a cobrança, quando existir, passa a ser criada depois, manualmente, já ligada à assinatura). Trava de concorrência (`claimConversion`/`releaseConversionClaim`, Bloco 2) e idempotência por `originTag` nas notas **não foram alteradas** — continuam protegendo contra duas conversões simultâneas da mesma solicitação, agora só criando a assinatura (não mais o título). Textos de confirmação/sucesso dos dois botões (`ConvertSubscriptionInterestButton.tsx`/`ConvertAdvertisingInterestButton.tsx`) atualizados pra não prometer mais "financeiro gerado automaticamente".

Nova migration `supabase/migrations/20261120320000_subscription_pending_formalization.sql` (**não aplicada**): só amplia o CHECK de `public.subscriptions.status` para aceitar `pending_formalization` — nenhum UPDATE em linha existente, nenhum default alterado no banco (o default remoto `'active'` continua existindo pra qualquer INSERT que não informe status; a aplicação é que agora sempre informa explicitamente). Nenhuma assinatura `active`, título recebido, contrato ou histórico foi tocado.

TESTES: `tsc --noEmit` limpo em `apps/site` e `apps/sistema`. `packages/core` → 194/194 (sem regressão — nenhum teste existente fixava `status === "active"` como default implícito da criação). `apps/sistema` → 162/162 (sem regressão). `next build` com `IR_LOCAL_ONEDRIVE_BUILD=1` → sucesso (~1m23s). **Nenhum teste automatizado novo foi escrito** para `activateSubscriptionAction`/o novo bloqueio de cobrança — mesmo padrão já registrado nos lotes anteriores (wrappers finos sobre Supabase; a transição de status em si já é coberta indiretamente pela lógica pura de `canTransitionSubscriptionStatus`, que não mudou de forma — só ganhou uma linha na tabela de transições).

ARQUIVOS: `packages/types/src/assinaturas/index.ts`; `packages/core/src/assinaturas/subscription-service.ts`; `apps/sistema/src/lib/permissions/staffPermissionsCatalog.ts`; `apps/sistema/src/app/sistema/assinaturas/actions.ts`; `apps/sistema/src/features/assinaturas/{SubscriptionStatusActions,SubscriptionForm}.tsx`; `apps/sistema/src/app/sistema/financeiro/contas-a-receber/actions.ts`; `apps/sistema/src/app/sistema/publicidade/solicitacoes/actions.ts`; `apps/sistema/src/features/publicidade/{ConvertSubscriptionInterestButton,ConvertAdvertisingInterestButton}.tsx`; `supabase/migrations/20261120320000_subscription_pending_formalization.sql` (novo, **não aplicada**).

FALTA/BLOQUEIOS: nenhum. Decisão do Bloco C formalizada e implementada. Migration não aplicada em produção — permissão `assinaturas_ativar` precisa ser concedida explicitamente a cada operador que deva poder ativar (nenhum operador ganha automaticamente, mesmo princípio de todas as outras permissões granulares do catálogo). Sem push/merge/Preview/deploy.

## 02/11/2026 — Pré-homologação dos Blocos D/E: testes direcionados, achado de colisão de migrations e achado maior sobre o estado remoto real

Continuação da mesma branch/sessão, a partir do commit `a84ffd79`. Pedido do usuário: só pré-homologação (testes + auditoria de migrations), sem abrir módulo novo. Nenhuma migration foi aplicada; `supabase migration list --linked` foi usado estritamente como LEITURA (compara o ledger remoto com os arquivos locais, não grava nada).

**ACHADO MAIOR — vários lotes "preparados, não aplicados" já estão, na verdade, no ar em produção.** `supabase migration list --linked` (rede confirmada, mesma referência de produção `iqnzrpdccecgalqboeyf` do `supabase/config.toml`) mostra que TODAS as migrations de `20261120100000` até `20261120260000` (atomic_manual_receivables, atomic_composition_receipts, atomic_manual_adjustments, atomic_reversal_guards, restrict_ledger_writes, protect_receivable_updates, rental_in_hand_integrity, birthday_entry_duplicate_guard, site_ad_publication_guard, site_ads_mutation_permissions, site_ads_manual_only, newspaper_edition_permissions, pdf_import_permissions_and_duplicate_lock, agenda_event_invitees, client_digital_export_approval) **já estão aplicadas remotamente**, apesar de várias terem sido documentadas como "não aplicada" em lotes anteriores. Isso confirma a memória já registrada ("Supabase migration state not local") — provavelmente aplicadas por outro agente/sessão (ver alternância de agentes no CLAUDE.md) sem atualização retroativa destes documentos. **Boa notícia para os Blocos A-E**: todas as suas dependências (ex.: `birthday_entries` base, `client_digital_export_approval`) já estão satisfeitas remotamente. Nenhuma ação foi tomada sobre essa descoberta (fora de escopo corrigir retroativamente 15 entradas históricas de documentação); fica registrada aqui para a próxima sessão não assumir "não aplicada" sem conferir de novo.

**Confirmado, por leitura, que NENHUMA migration de `20261120270000` em diante (Blocos A/B/C/D/E completos) foi aplicada** — exatamente como esperado, nada desta sessão foi tocado no banco remoto.

**Colisão de nome corrigida (pedido explícito do usuário)**: `20261101100000_commercial_equipment_rental_channel.sql` (de outro agente, 22/10) e `20261101100000_contract_templates_seed_minutas.sql` (Bloco 3 desta sessão, 01/11) compartilhavam o MESMO prefixo de versão. `supabase migration list --linked` confirmou que a versão `20261101100000` já está aplicada remotamente — ligada ao arquivo `commercial_equipment_rental_channel.sql` (preservado, nunca tocado). O outro arquivo (`contract_templates_seed_minutas.sql`, nunca aplicado) foi **renomeado** para `20261101110000_contract_templates_seed_minutas.sql` (git mv, sem mudança de conteúdo) — a única correção segura possível, já que jamais se deve renomear uma migration já aplicada. Dois testes de integração (`bloco4-proposal-sale-document-signers-integration.test.ts`, `bloco4-subscription-contract-financeiro-integration.test.ts`) e um teste dedicado (`contract-templates-seed-minutas.test.ts`) liam esse caminho por nome literal — todos os três atualizados para o novo nome; suíte completa voltou a 199/199 depois do ajuste (tinha caído para 197/199 só por isso, nenhum bug de lógica).

**Segunda colisão encontrada, identificação pendente de confirmação externa no momento em que este parágrafo foi escrito** — ver a seção seguinte ("Lote seguro de publicação") para a resolução definitiva, feita depois, na mesma sessão, a partir de uma verificação independente do usuário direto no Supabase: `20261026100000_nfse_transmission_attempts_dps_id.sql` e `20261026100000_subscription_assinante_role.sql` compartilhavam o mesmo prefixo de versão; o ledger remoto confirma que a versão `20261026100000` já foi aplicada, mas o `supabase migration list` por si só não informava qual dos dois arquivos era o que estava realmente no ar.

**Migrations `20261120310000`/`20261120320000` (Bloco D/E) — ordem e dependências revisadas, sem achado**: `310000` depende de `client_completion_tokens` (300000, mesmo lote, ordem correta), `birthday_entries`+consentimento (20261025100100 base, já aplicada remotamente, e 290000, do mesmo lote), `client_related_persons` (280000, mesmo lote) e `clients.family_members_confirmed_empty` (290000) — todas ordenadas corretamente antes dela. `320000` só altera o CHECK de `public.subscriptions.status` (tabela de 20261015100000, já aplicada remotamente) — sem dependência nova. Nenhuma colisão, nenhuma referência a objeto que não exista no momento em que cada uma rodaria.

**Testes direcionados novos** (pedido explícito — Server Actions e acesso por token/OTP do Bloco D; criação/bloqueio/permissão/idempotência do Bloco E). Metodologia honesta: Server Actions `"use server"` que só chamam Supabase (admin/server client hardcoded, sem injeção de dependência) continuam seguindo o padrão já aceito no projeto (não testáveis por unidade sem Postgres real) — o que MUDOU aqui foi extrair pequenas peças de lógica pura hoje só inline, exatamente como já tinha sido feito em `siteInterestConversionHelpers.ts`/`commercialSaleBillingGuard.ts`, pra ganharem teste real; e, pra funções 100% SQL sem equivalente em TypeScript, ler o SQL de verdade e afirmar contra ele (mesmo princípio de `contract-templates-seed-minutas.test.ts`) em vez de reescrever a lógica numa cópia.
- `apps/sistema/src/lib/clientes/clientCompletionTokens.ts` (sem mudança de comportamento) → `client-completion-tokens.test.ts`: `clientCompletionTokenUsable` nunca considera usável um token `completed`/`expired`/`revoked`, nem um `pending`/`verified` com `expires_at` no passado.
- `client-completion-public-flow-security.test.ts` (14 testes): lê as migrations REAIS 300000/310000/290000 e confirma — `require_verified_client_completion` exige `service_role` + `status='verified'` + mesmo `verified_user_id` + não expirado (token expirado, revogado, concluído ou de outra pessoa nunca passa); as três funções de leitura/escrita do fluxo público sempre chamam esse helper antes de tocar o cadastro; `consume_client_completion_token` exige a mesma tripla; nenhuma função aceita CPF/CNPJ/kind como entrada nem na allow-list (identidade nunca muda por este link — CPF/CNPJ nunca é autenticação); `publish_in_print` de familiar e o consentimento do próprio titular nunca ficam `true` sem o consentimento explícito correspondente; `reserve_client_completion_otp`/`verify_client_completion_channel` restritas a `service_role`; `generate_client_completion_token` exige `is_active_staff()`; índice único garante só um link ativo por cliente; `birthday_entries_publish_requires_consent` (Bloco B) continua intacta.
- `client-completion-actions-structure.test.ts` (11 testes): lê o código real das Server Actions e confirma — as quatro ações que leem/gravam dados do cadastro sempre checam a sessão verificada ANTES de qualquer chamada ao banco; nenhuma delas aceita `clientId`/`authUserId` como parâmetro do chamador (identidade só vem da sessão real do Supabase Auth); `sendClientCompletionOtpAction` só afirma `sent: true` DEPOIS de checar o erro do envio — nunca afirma envio quando o canal OTP falha ou não está configurado; `verifyClientCompletionOtpAction` confere o usuário retornado pelo Supabase Auth antes de marcar o canal como verificado.
- `packages/core/test/subscription-pending-formalization.test.ts` (7 testes, adicionado ao script `test` de `packages/core/package.json`): `register()` sem status explícito cria `pending_formalization` (nunca `active` direto); `activate()` só transiciona pra `active` e nunca toca nada financeiro (confirmado estruturalmente: `SubscriptionService` não tem nenhuma dependência de `ReceivableRepository`); `pending_formalization` nunca pode ir direto para `suspended` (só `active`/`cancelled`); cancelamento direto de `pending_formalization` funciona; uma assinatura `active` pré-existente nunca é afetada ao criar uma nova `pending_formalization` (preserva histórico); cancelada continua sendo estado final mesmo partindo de `pending_formalization`.
- `apps/sistema/src/lib/financeiro/subscriptionBillingGuard.ts` (novo, extraído de `contas-a-receber/actions.ts`, mesmo padrão de `commercialSaleBillingGuard.ts`) → `subscription-billing-guard.test.ts`: confirma que gerar cobrança é bloqueado só e exatamente quando `status === "pending_formalization"`.
- `assinaturas-activation-permission.test.ts` (4 testes): confirma que `assinaturas_ativar` existe no catálogo, é distinta de `assinaturas_criar` e não é `isDefault` (nenhum operador ganha automaticamente); e que `activateSubscriptionAction` checa essa permissão especificamente ANTES de chamar o serviço — ou seja, acesso direto à Server Action (sem passar pela UI) não pula a checagem — e nunca importa nada do módulo Financeiro (ativar não pode gerar cobrança).
- `siteInterestConversionOriginTag` (extraída de `publicidade/solicitacoes/actions.ts` pro já existente `siteInterestConversionHelpers.ts`, usada nos dois pontos que antes montavam a marca inline) → 4 novos casos em `site-interest-conversion-helpers.test.ts`: a marca é determinística por `requestId` e nunca colide entre solicitações diferentes (inclusive quando um id é prefixo textual do outro).

**O que permanece verificado só por leitura de código, não por teste executável (limitação honesta, mesma already aceita nos lotes anteriores para este tipo de mecanismo)**: a trava de concorrência real contra duas conversões simultâneas (`claimConversion`, UPDATE condicional direto no Postgres) e a idempotência de `ensureSubscriptionAndReceivable` por busca de `originTag` — ambas **não foram alteradas** nesta sessão (reconfirmado por leitura completa, byte a byte, contra o que já existia desde o Bloco 2) e continuam dependendo de um Postgres real pra serem exercitadas de ponta a ponta; o fluxo de confirmação "avançar sem familiares" do `ClientCompletionWizard.tsx` é lógica de estado de um Client Component React — o projeto não tem (e esta sessão não adicionou) infraestrutura de teste de componente (jsdom/Testing Library), então foi reverificado por leitura cuidadosa da lógica (`askingNoFamily`/`confirmedNoFamily`), não por um teste automatizado.

TESTES: `tsc --noEmit` limpo em `apps/site`/`apps/sistema`. `packages/core` → **201/201** (194 + 7 novos). `apps/sistema` → **199/199** (191 + 8 novos, contando as correções de caminho). `next build` com `IR_LOCAL_ONEDRIVE_BUILD=1` → sucesso (~1m23s).

ARQUIVOS: `supabase/migrations/20261101110000_contract_templates_seed_minutas.sql` (renomeado de `20261101100000...`, git mv, conteúdo intacto); `apps/sistema/test/{bloco4-proposal-sale-document-signers-integration,bloco4-subscription-contract-financeiro-integration,contract-templates-seed-minutas}.test.ts` (caminho corrigido); `docs/MODELOS-DE-CONTRATO-MINUTAS-{BLOCO3-20261101,DRAFT-20261031}.md` (referência de nome corrigida); `apps/sistema/src/lib/financeiro/subscriptionBillingGuard.ts` (novo); `apps/sistema/src/app/sistema/publicidade/solicitacoes/{actions.ts,siteInterestConversionHelpers.ts}` (nova função pura, sem mudança de comportamento); `apps/sistema/src/app/sistema/financeiro/contas-a-receber/actions.ts` (guard extraído, mesmo comportamento); `packages/core/package.json` (script `test` ampliado); 6 arquivos de teste novos (`client-completion-tokens`, `client-completion-public-flow-security`, `client-completion-actions-structure`, `subscription-billing-guard`, `assinaturas-activation-permission` em `apps/sistema/test/`, `subscription-pending-formalization` em `packages/core/test/`).

**PLANO DE EXECUÇÃO SEGURO PARA HOMOLOGAÇÃO/PUBLICAÇÃO (quando autorizado — nada disto foi executado)**:
1. Resolver primeiro a colisão `20261026100000` (NFS-e/assinante) — identificar qual dos dois arquivos está realmente aplicado (inspeção direta do schema remoto, fora desta sessão por tocar NFS-e) e renomear o outro, do mesmo jeito que `20261101100000` foi resolvido aqui. Sem isso, um `db push` comum simplesmente nunca aplica o arquivo "perdedor" — silenciosamente.
2. Com (1) resolvido, aplicar em ordem de versão os genuinamente pendentes: `20261026100000`/`20261026100100` (o que sobrar da colisão) → `20261101110000_contract_templates_seed_minutas` → `20261120270000` → `280000` → `290000` → `300000` → `310000` → `320000`. Todos sem UPDATE em linha existente, sem migração retroativa de estado.
3. Antes de aplicar `300000`/`310000`, confirmar que a equipe já concorda em NÃO enviar nenhum link real até a página pública (`/complementar-cadastro/[token]`) ser revisada em homologação (infra fica pronta, mas inerte, até a equipe gerar e testar um link real).
4. Depois de aplicar `320000`, conceder `assinaturas_ativar` explicitamente aos operadores que devem poder ativar assinaturas — nenhum ganha automaticamente.
5. Testar em homologação, nesta ordem: gerar um link de teste → verificar OTP (precisa SMTP/SMS configurado no Supabase Auth do projeto de homologação) → completar cadastro → conferir Aniversariantes; gerar uma assinatura de teste → confirmar que fica `pending_formalization` sem título → ativar → gerar cobrança manualmente → confirmar que títulos/assinaturas antigos não foram tocados.

FALTA/BLOQUEIOS: colisão `20261026100000` (NFS-e) não resolvida — bloqueia uma homologação/push seguro dessa faixa até identificada; decisão ainda pendente sobre quando reconciliar as ~15 entradas de documentação que diziam "não aplicada" pra migrations que já estão no ar (não é um risco de dado, só desatualização de registro). Nenhuma migration aplicada, nenhum OTP real enviado, nenhuma cobrança real gerada, nenhum dado de produção alterado, sem push/merge/Preview/deploy.

## 02/11/2026 — Lote seguro de publicação: colisão de 26/10 identificada externamente, dry-run confirmado, nada aplicado

Continuação da mesma sessão. O usuário fez uma verificação independente, só leitura, direto no Supabase de produção (`iqnzrpdccecgalqboeyf`) e confirmou: a versão `20261026100000` aplicada corresponde a `subscription_assinante_role` (função `ensure_subscriber_role` + trigger presentes); as colunas `nfse_transmission_attempts.dps_id`/`signed_dps_xml` **não existem** remotamente — ou seja, o arquivo "perdedor" da colisão é `20261026100000_nfse_transmission_attempts_dps_id.sql` (nunca aplicado), não `subscription_assinante_role.sql` (já aplicado, preservado). `20261026100100_nfse_transmission_attempts_signed_xml.sql` (depende de `dps_id`) também está pendente. Nenhuma nova investigação nem `supabase migration repair` foi necessária.

**Preparação do lote seguro (sem aplicar nada)**: os dois arquivos de NFS-e foram **movidos** (git mv, conteúdo e nomes de arquivo intactos, nenhuma linha de SQL alterada) de `supabase/migrations/` para `supabase/migrations-postponed-nfse/` — uma pasta de espera, fora do diretório que a CLI/`db push` escaneia, exatamente para "manter as duas migrations de NFS-e adiadas, sem excluir seu conteúdo" enquanto se prepara um conjunto aplicável que não as inclua (pedido explícito do usuário). Nenhuma lógica, flag ou código de NFS-e foi tocado — é só reorganização de diretório, reversível com um `git mv` de volta. Nenhum outro arquivo referencia esses dois migrations por caminho (conferido por busca em `apps/`/`docs/`/`supabase/config.toml`), então a movimentação não quebra nada.

**Confirmação por `supabase db push --linked --dry-run` (read-only, contra produção, nada aplicado)**:
- **Antes** de mover os dois arquivos de NFS-e: a CLI recusou (`DbPushMissingRemoteError`) por eles estarem "antes" do último migration aplicado (`20261120260000`) sem `--include-all` — comportamento normal da CLI quando há migrations mais antigas ainda não aplicadas depois de um lote mais novo já ter subido fora de ordem (achado já registrado na seção anterior).
- **Depois** de mover os dois arquivos: o mesmo dry-run (sem `--include-all`) ainda recusou, agora só por causa de `20261101110000_contract_templates_seed_minutas.sql` (também "antes" de `20261120260000`) — esperado, mesmo motivo.
- Rodando com a flag compatível com a CLI instalada (v2.121.0) para esse cenário, `supabase db push --linked --dry-run --include-all`, a lista exata devolvida foi:
  1. `20261101110000_contract_templates_seed_minutas.sql`
  2. `20261120270000_site_interest_request_identification.sql`
  3. `20261120280000_client_related_persons.sql`
  4. `20261120290000_birthday_entries_consent_and_sync.sql`
  5. `20261120300000_client_completion_tokens.sql`
  6. `20261120310000_client_completion_public_flow.sql`
  7. `20261120320000_subscription_pending_formalization.sql`

  **Exatamente as 7 migrations esperadas pelo usuário — nenhuma migration de NFS-e, nenhuma outra surpresa.** Nada foi aplicado (`--dry-run` mantido em toda a sessão).

**Dependências conferidas (reconfirmação, sem achado novo)**: todas as 7 dependem só de objetos já aplicados remotamente (`clients`, `birthday_entries` base, `subscriptions`, `client_related_persons` do próprio lote) ou de outra migration do mesmo lote, em ordem correta. Nenhuma depende de nada em `supabase/migrations-postponed-nfse/`.

**Roteiro de publicação e homologação (preparado, nada executado)**:
1. **Publicar** (quando autorizado): com as duas migrations de NFS-e fora de `supabase/migrations/` (já feito), `supabase db push --linked --include-all` aplicaria exatamente as 7 migrations listadas acima, na mesma ordem. Confirmar o dry-run mais uma vez imediatamente antes, por segurança (o ledger remoto pode mudar entre sessões).
2. **Conceder permissão**: depois do push, conceder `assinaturas_ativar` explicitamente a cada operador que deva poder ativar assinaturas (ninguém ganha automaticamente).
3. **Homologar Cadastro público** (`/complementar-cadastro/[token]`):
   a. Gerar um link de teste em IR Controle (ação já existente, cópia manual).
   b. Abrir o link; solicitar o código — exige SMTP (e-mail) ou provedor SMS (WhatsApp/telefone) configurado no Supabase Auth do projeto; sem isso, a ação retorna erro claro, nunca afirma envio.
   c. Confirmar o código, completar nascimento/fundação, familiares ou pessoas vinculadas, consentimento de publicação.
   d. Concluir e verificar: titular aparece em Aniversariantes (DD/MM) só se consentimento marcado; dado salvo sem duplicar cliente nem aniversariante.
4. **Homologar Assinaturas**:
   a. Gerar uma assinatura de teste (conversão de solicitação OU criação manual) — confirmar que nasce `pending_formalization`, sem título financeiro.
   b. Tentar gerar cobrança antes de ativar — confirmar que é recusado.
   c. Ativar (operador com `assinaturas_ativar`) — confirmar que nenhum título é criado pela própria ativação.
   d. Gerar cobrança manualmente, já ativada — confirmar valores/vencimento revisados antes de confirmar.
   e. Confirmar que assinaturas/títulos antigos (antes deste lote) permanecem inalterados.
5. Só depois de 3 e 4 homologados, decidir se/quando enviar um link real a um cliente de verdade (fora do escopo de qualquer ação automática desta sessão).

TESTES: nenhum teste novo nesta etapa (só confirmação via CLI real, read-only, contra produção) — reaproveita a suíte já validada na etapa anterior (`packages/core` 201/201, `apps/sistema` 199/199, `tsc` limpo, `next build` ok).

ARQUIVOS: `supabase/migrations-postponed-nfse/{20261026100000_nfse_transmission_attempts_dps_id,20261026100100_nfse_transmission_attempts_signed_xml}.sql` (movidos de `supabase/migrations/`, git mv, conteúdo intacto).

FALTA/BLOQUEIOS: nenhum para o lote de 7 migrations — dry-run confirmou exatamente o esperado. Pendências que seguem fora de qualquer execução automática: autorização explícita para o push de verdade; SMTP/SMS configurado no Supabase Auth antes de homologar o OTP; decisão de quando um futuro lote dedicado de NFS-e vai resolver o nome de `dps_id.sql` (hoje só isolado, ainda não renomeado) e retomar aquele módulo. Nenhuma migration aplicada, nenhum push/deploy/mensagem real, nenhum dado de produção alterado.

## 02/11/2026 — Sincronização e push da branch de desenvolvimento ao GitHub (sem Preview/produção, nada no banco)

**Pedido do usuário**: sincronizar e enviar a branch de trabalho ao GitHub e preparar terreno para uma eventual Preview, sem alterar o banco nem promover nada à produção.

**Sequência executada**:
1. `git fetch origin` (HEAD local antes: `e4cf3a20`, working tree limpa). Criada referência de segurança `refs/heads/safety-e4cf3a20-20261102` apontando para `e4cf3a20`, sem descartar nada.
2. `docs/INTEGRACAO-CADASTROS-ALTNIX-JORNALIR.md` só existe em `origin/main` (não em `origin/frontend-integracao-20261008`) como commit `9a2ae7b0` (26/09/2026, texto original do plano de integração Altnix↔JornalIR). Esse commit não estava na branch atual. Cherry-pick gerou conflito **add/add** (arquivo "adicionado" de forma independente nos dois lados: na branch atual, o arquivo já existia reescrito em 24/10/2026 como aviso de "SUPERADO — NÃO IMPLEMENTAR", referenciando um "plano antigo abaixo" que na verdade não estava mais no arquivo). Resolução: manter o aviso de superação como cabeçalho autoritativo e anexar o texto original de 26/09 por completo abaixo dele, sob um título "Plano antigo (substituído)" — sem perder nenhum dos dois lados, sem contradizer a decisão de 24/10. Commit resultante: `4d2c7056`.
3. Confirmados presentes na branch, por `merge-base --is-ancestor`: `e99d8c09`, `dfddec21`, `39a6dbeb`, `a84ffd79`, `db3b6cb2`, `e4cf3a20`. Working tree limpa após o cherry-pick.
4. **Risco de deploy automático**: `apps/sistema/vercel.json` e `apps/site/vercel.json` têm `git.deploymentEnabled: false`, já presentes no HEAD remoto anterior desta mesma branch (`7c061ddf`, push de sessão anterior) — ou seja, este push não é "o primeiro push que introduz o arquivo" (ressalva registrada em 17/10/2026 no `ACORDOS-E-FONTE-DA-VERDADE.md`). Prosseguiu-se com o push.
5. `git push origin solicitacoes-financeiro-contratos-irc-20261031` — push normal, sem `--force`, sem tocar em `main`. Resultado: `7c061ddf..4d2c7056 solicitacoes-financeiro-contratos-irc-20261031 -> solicitacoes-financeiro-contratos-irc-20261031`.
6. Confirmação pós-push via `vercel ls jornalir-sistema` e `vercel ls jornalir`: nenhuma implantação nova apareceu (a mais recente de cada projeto continua com ~22h, anterior ao push) — `deploymentEnabled: false` funcionou como esperado, nenhuma Preview/produção foi disparada.
7. **Hospedagem de `/complementar-cadastro/[token]`**: `vercel project inspect jornalir-sistema` confirma Root Directory `apps/sistema`; a URL de produção mais recente desse projeto é `controle.altnix.com.br`. Ou seja, quando este código for implantado em produção, a rota ficará em `https://controle.altnix.com.br/complementar-cadastro/<token>`.
8. **Variáveis de ambiente (nomes, sem valores)**: `vercel env ls production` em `apps/sistema` e `apps/site` mostra que `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (sistema) só existem no ambiente **Production** — nenhuma está marcada para **Preview**. Achado: se alguém gerar uma Preview manual desses projetos, ela quebraria ao tentar falar com o Supabase, por falta dessas variáveis no ambiente Preview. Isso não bloqueia nada desta etapa (nenhuma Preview foi solicitada), mas é um impedimento real para testar uma Preview funcional sem antes copiar essas variáveis também para o ambiente Preview.
9. **Compatibilidade das migrations com o código publicado — risco real identificado**: a migration `20261120270000_site_interest_request_identification.sql` faz `create or replace function public.submit_site_interest_request_v4(...)` tornando CPF/CNPJ **sempre obrigatório** (antes só era obrigatório quando havia assinatura no carrinho). O componente que chama essa função (`apps/site/src/components/site/public/AssineConfigurator.tsx`) só foi alterado para coletar documento sempre dentro do commit `e99d8c09` (02/11/2026) — que **não está em `origin/main`** e não foi a origem da última implantação de produção do portal (`dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc`, 01/11/2026 22:31, ~22h antes desta checagem, portanto necessariamente de um estado anterior a `e99d8c09`). **Conclusão:** se a migration `20261120270000` for aplicada ao banco de produção antes do código correspondente (deste lote) ser implantado no portal, qualquer solicitação de **publicidade pura** (sem assinatura) feita pelo frontend atualmente em produção passará a ser rejeitada pela função (`"Informe se é pessoa física ou empresa."` / `"Informe um CPF válido."`), porque o frontend antigo não envia `customer_kind`/`document_number` nesse caso. **Migration e deploy do código têm que ser aplicados juntos, nessa ordem: código primeiro (ou simultâneo), nunca migration isolada primeiro, para esta migration especificamente.** As outras 6 migrations do lote não têm esse tipo de dependência de sincronismo frontend↔banco identificada (são aditivas/novas tabelas/colunas não usadas por código já em produção).
10. **Backup recuperável do Supabase**: confirmado via `supabase backups list --project-ref iqnzrpdccecgalqboeyf` (read-only) — backups físicos diários, `COMPLETED`, o mais recente em `2026-11-02T07:05:58Z` (mesmo dia). **Atenção:** `pitr_enabled: false` — não há recuperação ponto-a-ponto; a granularidade de restauração é a dos snapshots diários listados, não um instante arbitrário entre eles.

TESTES: nenhum teste de código novo nesta etapa (ação de infraestrutura/git/verificação). Suíte permanece a validada nas etapas anteriores.

ARQUIVOS: `docs/INTEGRACAO-CADASTROS-ALTNIX-JORNALIR.md` (mesclado via cherry-pick, conflito resolvido preservando os dois lados).

FALTA/BLOQUEIOS: (a) decidir a ordem exata de implantação código↔migration para o lote, dado o achado do item 9 — recomenda-se implantar o código do portal/sistema deste lote ANTES ou imediatamente junto com `20261120270000`, nunca a migration isolada primeiro; (b) copiar as variáveis de ambiente do Supabase também para o ambiente Preview nos dois projetos Vercel, se uma Preview de fato for necessária para homologação visual; (c) configurar SMTP/SMS no Supabase Auth antes de homologar OTP real; (d) autorização explícita, em etapa futura, para o push real das migrations e para qualquer promoção a produção. Nenhuma migration aplicada, nenhum deploy/Preview disparado, nenhuma mensagem real enviada, nenhum dado de produção alterado nesta etapa.

## 03/11/2026 — Regressão real encontrada e corrigida: checagem de `assine_enabled` removida por engano na migration `20261120270000`

**Achado do usuário (revisão independente)**: a reescrita (`create or replace`) de `public.submit_site_interest_request_v4` na migration `20261120270000_site_interest_request_identification.sql` removeu, sem intenção, a checagem `if not exists (select 1 from public.site_offer_settings where id = 1 and assine_enabled = true) then raise exception ...` que já está instalada em produção desde `20261022072614_site_assine_visibility_toggle.sql` (aplicada em 22/10/2026). Sem essa checagem, o botão administrativo de desativar o "Assine" ficaria sem efeito contra uma chamada direta à RPC.

**Correção aplicada** (commit `047f9082`): restaurada a checagem, como a **primeira validação do corpo da função**, antes de qualquer outra regra ou gravação — na mesma posição e com o mesmo texto da versão de produção. Comentários da migration e da função atualizados para registrar a correção.

**Comparação de controles (produção vs. nova definição)**: revisados item a item todos os `raise exception` e o `revoke`/`grant` da versão instalada contra a nova — nenhuma outra proteção foi omitida. As diferenças restantes são intencionais e já aprovadas: CPF/CNPJ sempre obrigatório (antes só para assinatura) e o novo bookkeeping silencioso `matched_client_id`/`matched_client_ambiguous`. As outras 6 migrations do lote (`20261120280000` a `20261120320000`, `20261101110000`) só criam funções **novas** — nenhuma delas substitui algo já instalado em produção, então não têm esse tipo de risco.

**Teste de regressão novo** (`apps/sistema/test/site-interest-request-assine-toggle-regression.test.ts`, 4 testes): lê o SQL real das duas migrations (produção e nova) e confirma que a checagem de `assine_enabled` continua presente e na primeira posição do corpo da função, e que `revoke`/`grant` permanecem restritos a `anon, authenticated`. Confirmado que o teste de fato detecta a regressão: rodado contra a versão sem a correção (via `git stash` temporário), 2 dos 4 testes falharam exatamente como esperado; com a correção, 4/4 passam.

**Compatibilidade do formulário novo do portal com a função atual (produção, sem a migration aplicada)**: confirmada por leitura do código real. `AssineConfigurator.tsx` sempre coleta e envia `p_customer_kind` (padrão `"individual"`) e `p_document_number` já validado (CPF/CNPJ) no cliente, para **qualquer** tipo de solicitação — inclusive publicidade pura. A função hoje em produção só **exige** esses campos para `subscription`/`mixed`, mas **aceita e valida** o formato quando enviados em `advertising` (ramo `elsif v_customer_kind is not null`). Como a assinatura da função (nomes/ordem dos 20 parâmetros) é idêntica entre a versão instalada e a nova, o formulário novo funciona sem alteração contra a função atual — não há dependência de ordem entre "portal novo" e a migration `20261120270000` nesse sentido específico (a dependência que existe é a inversa, já registrada: a migration pode ir primeiro ou junto, nunca depois de um portal MAIS ANTIGO que ainda não validava documento sempre).

**IR Controle (sistema) atual tolera o schema atualizado**: confirmado por leitura — todas as consultas a `site_interest_requests` em `apps/sistema/src/app/sistema/publicidade/solicitacoes/actions.ts` usam listas explícitas de colunas (nunca `select *`) e não há nenhum `insert()` direto nessa tabela fora da RPC (que já nomeia colunas explicitamente). Novas colunas nulas/com default (`matched_client_id`, `matched_client_ambiguous`) não quebram nenhuma leitura/escrita do sistema hoje em produção.

**Roteiro definitivo de implantação coordenada (preparado, nada executado)**:
1. **Portal novo primeiro** — implantar o código deste lote em `apps/site` (inclui `AssineConfigurator.tsx` com documento sempre coletado). Compatível com a função ainda instalada em produção (confirmado acima); nenhuma migration precisa ter sido aplicada ainda para este passo.
2. **Sete migrations aprovadas depois** — com o portal novo já em produção, aplicar `supabase db push --linked --include-all` (lista confirmada: `20261101110000`, `20261120270000`–`20261120320000`). A partir daqui a checagem de `assine_enabled` continua ativa (corrigida) e CPF/CNPJ passa a ser exigido no banco também para publicidade pura — já coerente com o portal novo que acabou de subir.
3. **IR Controle (sistema) novo por último** — implanta as telas que leem/usam as novas colunas e funções (complementar-cadastro, assinatura pendente de formalização, etc.). Pode ir depois com segurança porque o sistema atual já tolera o schema novo (passo 2) sem quebrar, e as novas telas só fazem sentido com o schema já presente.
4. Rollback: os deployments atuais de produção (`dpl_68cqZyrLAJwCewn6ZpwnDam2yzgG` sistema, `dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc` portal) continuam preservados como alternativa de retorno em cada etapa.

TESTES: `apps/sistema` 203/203 (199 anteriores + 4 novos do teste de regressão), `packages/core` 201/201 (inalterado, não tocado nesta etapa), `tsc --noEmit` limpo em `apps/sistema` e `apps/site`, `supabase db push --linked --dry-run --include-all` reconfirmado com a lista idêntica de 7 migrations após a correção.

ARQUIVOS: `supabase/migrations/20261120270000_site_interest_request_identification.sql` (checagem de `assine_enabled` restaurada), `apps/sistema/test/site-interest-request-assine-toggle-regression.test.ts` (novo).

FALTA/BLOQUEIOS: nenhum impedimento técnico novo encontrado nesta etapa. Seguem pendentes de autorização explícita, em etapa futura: implantação real do portal (passo 1 do roteiro), push real das migrations (passo 2), implantação do IR Controle novo (passo 3), SMTP/SMS no Supabase Auth, cópia das variáveis de ambiente para Preview se necessário. Nenhuma migration aplicada, nenhum deploy/Preview real disparado, nenhuma solicitação/OTP/assinatura/cobrança real gerada, nenhum dado de produção alterado nesta etapa.

## 03/11/2026 — ETAPA 1 da publicação: deployment de produção do portal preparado, SEM promoção de domínio

**Pedido do usuário**: criar um deployment de produção real do projeto Vercel `jornalir` (portal), explicitamente SEM associá-lo ao domínio público, como primeiro passo do roteiro de implantação coordenada (portal novo → migrations → IR Controle novo) aprovado na etapa anterior.

**Verificações antes do deploy**: working tree limpa, branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD `0df90b45`. `.vercel/project.json` (raiz e `apps/site`) confirma vínculo com `projectName: "jornalir"`, Root Directory `apps/site` (conferido também via `vercel project inspect` em etapa anterior), domínio atual `jornalir.vercel.app`.

**Execução**: `vercel deploy --prod --skip-domain --yes`, rodado a partir da **raiz do monorepo** (uma primeira tentativa dentro de `apps/site` falhou com `"The specified Root Directory \"apps/site\" does not exist"`, porque o CLI, chamado de dentro do subdiretório, já envia aquele subdiretório como raiz do upload — a configuração do projeto espera receber o monorepo completo e resolver `apps/site` internamente; corrigido rodando da raiz).

**Resultado do build**: sucesso. Next.js 14.2.33, `✓ Compiled successfully`, 19/19 páginas estáticas geradas, build completo em 1m48s, sem erros (só avisos esperados de `npm` e timeout intermitente de fonte do Google Fonts, sem impacto). `readyState: "READY"`, `target: "production"`, **`productionUrl: null`** — confirma que o domínio NÃO foi promovido/aliasado, conforme pedido.

- **Deployment ID**: `dpl_CC46f5W12kysqex65B5mXuKT4a2L`
- **URL própria do deployment**: `https://jornalir-pxg5xnpf1-cristians-projects-34074cc3.vercel.app`
- **Inspector**: `https://vercel.com/cristians-projects-34074cc3/jornalir/CC46f5W12kysqex65B5mXuKT4a2L`
- Deployment Protection ativa (`vercel_authentication`) — não acessível publicamente sem token, por padrão do projeto.

**Confirmação de que o deployment usa o código/commit corretos**: `git status -sb` limpo e `HEAD = 0df90b45` no momento exato do deploy — o CLI envia o conteúdo real dos arquivos locais (sem uso de `vercel.json`/git integration, já que `deploymentEnabled: false`), então o upload corresponde exatamente a este commit. Confirmado por leitura de `git show 0df90b45:apps/site/src/components/site/public/AssineConfigurator.tsx` que o texto "CPF \*"/"CNPJ \*"/"Informe um CPF válido." está presente no código committed que foi enviado.

**Verificação funcional (sem dados reais, sem submissão)**: usando `vercel curl` (gera um bypass token de Deployment Protection automaticamente) contra a página `/assine` do novo deployment, o resultado foi HTTP 200 servindo a página 404 do Next.js (`notFound()`), porque `apps/site/src/app/(public)/assine/page.tsx` consulta `getSiteAssineEnabled()` em tempo de requisição contra o Supabase de produção real e **hoje esse valor está `false`** (comportamento "falha-fechado" já existente desde 18/10/2026). Para confirmar que isso não é uma quebra introduzida por este deployment, a mesma verificação foi repetida contra o domínio de produção atualmente promovido (`https://jornalir.vercel.app/assine`) e devolveu **exatamente o mesmo 404** — ou seja, o novo deployment se comporta de forma idêntica à produção atual neste ponto, lendo corretamente a configuração real. A página inicial (`/`) do novo deployment respondeu HTTP 200 com conteúdo normal, confirmando que o build não está genericamente quebrado.

**Compatibilidade da função RPC confirmada por leitura de código** (não por chamada real, conforme proibido nesta etapa): já verificado na etapa anterior e reconfirmado aqui — `AssineConfigurator.tsx` no commit `0df90b45` sempre envia `p_customer_kind`/`p_document_number` válidos para `submit_site_interest_request_v4`, e essa assinatura de parâmetros é idêntica entre a versão hoje instalada em produção e a nova (ainda não aplicada). Nenhuma chamada real à RPC foi feita nesta etapa.

**Preservação do retorno**: o deployment de produção atualmente promovido (`dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc`, alias `jornalir.vercel.app`) não foi tocado — nenhum alias foi alterado, nenhuma promoção foi executada.

TESTES: nenhum teste de código novo nesta etapa (ação de infraestrutura/deploy). Build de produção real na Vercel é, em si, a validação desta etapa.

ARQUIVOS: nenhum arquivo de código alterado nesta etapa — só a preparação do deployment.

FALTA/BLOQUEIOS: nenhum impedimento técnico encontrado. Pendente de autorização explícita: promoção deste deployment ao domínio público (`vercel promote` ou `vercel deploy --prod` sem `--skip-domain`), que é o próximo passo do roteiro antes das 7 migrations. `site_offer_settings.assine_enabled` continua `false` em produção — isso é esperado e independente desta etapa (controla a visibilidade da página /assine tanto na produção atual quanto neste novo deployment).

## 03/11/2026 — ETAPA 2 da publicação: deployment de produção do IR Controle preparado, SEM promoção de domínio (com correção de um erro de direcionamento no meio do caminho)

**Pedido do usuário**: criar deployment de produção preparado (`--skip-domain`) exclusivamente do projeto `jornalir-sistema`, repetindo o procedimento validado na ETAPA 1.

**Verificações antes do deploy**: working tree limpa, branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD `31b254c5`. `apps/sistema/.vercel/project.json` confirma `projectName: "jornalir-sistema"`; `vercel project inspect jornalir-sistema` reconfirma Root Directory `apps/sistema`. `apps/sistema/vercel.json` só tem `git.deploymentEnabled: false` — sem `crons` nem qualquer hook; `package.json` do app roda só `next build`; nenhum script do monorepo executa migration ou chamada externa no build.

**Erro cometido e corrigido nesta etapa**: seguindo literalmente o procedimento validado na ETAPA 1 (`vercel deploy --prod --skip-domain --yes` a partir da raiz do monorepo), o primeiro comando criou um deployment de produção — mas no projeto **errado**: `jornalir` (portal), não `jornalir-sistema`. Causa: a raiz do monorepo tem seu próprio `.vercel/project.json` vinculado a `jornalir` (o mesmo projeto de `apps/site`, por isso a ETAPA 1 funcionou "por coincidência" ao rodar da raiz); `apps/sistema` tem um vínculo PRÓPRIO e diferente (`jornalir-sistema`), que não é usado quando o comando roda a partir da raiz sem indicar o projeto explicitamente. Resultado: um deployment de produção extra e indesejado foi criado no projeto `jornalir` — **id `dpl_32SxxibP2toksm7wGG4YLRCESX69`**, build de `apps/site` (rotas do portal, nada do sistema), `productionUrl: null` (nenhum domínio foi afetado, nenhum alias alterado, nada promovido — o erro foi só de destino do deployment, não de segurança/produção). Ele não foi excluído nesta etapa (exclusão de deployment não foi autorizada); fica registrado aqui para decisão do usuário (manter como lixo inofensivo ou remover depois).

**Correção**: repetido o comando com `--project jornalir-sistema` explícito, ainda a partir da raiz do monorepo (necessário para que o Root Directory `apps/sistema` resolva corretamente dentro do upload). Resultado: `Deploying cristians-projects-34074cc3/jornalir-sistema` confirmado na saída, build real de `@ir/sistema@0.1.0`.

**Resultado do build**: sucesso. Next.js 14.2.33, `✓ Compiled successfully`, "Linting and checking validity of types..." sem erros, 78/78 páginas geradas, build completo em ~1min. `readyState: "READY"`, `target: "production"`, **`productionUrl: null`**.

- **Deployment ID**: `dpl_BYBipGsefkSocZUb4RiuWEqpvkUc`
- **URL própria do deployment**: `https://jornalir-sistema-e09o2gef5-cristians-projects-34074cc3.vercel.app`
- **Inspector**: `https://vercel.com/cristians-projects-34074cc3/jornalir-sistema/BYBipGsefkSocZUb4RiuWEqpvkUc`
- **Commit**: `31b254c5` (working tree limpa confirmada antes do deploy).
- Deployment Protection ativa (`vercel_authentication`).

**Confirmação dos Blocos A–E, Aniversariantes e `/complementar-cadastro/[token]`** — pela lista de rotas do próprio build: `/complementar-cadastro/[token]` (3.63 kB), `/sistema/assinaturas`, `/sistema/assinaturas/[id]`, `/sistema/assinaturas/[id]/editar`, `/sistema/assinaturas/nova` (Bloco E), `/sistema/clientes`, `/sistema/clientes/[id]`, `/sistema/clientes/[id]/editar`, `/sistema/clientes/novo` (Blocos A/B/C/D), `/sistema/aniversariantes` (21.7 kB — patch do repertório/modal), `/assinar-contrato-comercial/[token]`, `/assinar-contrato/[token]`, `/pagamento/[token]` — todas presentes no manifesto de rotas do build.

**Verificação não destrutiva, sem tokens/dados reais**: `vercel curl` em `/login` do novo deployment → HTTP 200, título "JornalIR | Sistema interno" confirmado. **Deliberadamente não** foi acessado `/complementar-cadastro/[token]` com nenhum token (nem fake) nem qualquer tela que dependa das tabelas/colunas das 7 migrations ainda não aplicadas (`client_completion_tokens`, `client_related_persons`, etc. não existem ainda no banco) — exatamente a restrição pedida ("não executar fluxos que dependam das migrations ainda pendentes").

**Domínios confirmados intactos**:
- `vercel inspect https://controle.altnix.com.br` → ainda resolve para `dpl_68cqZyrLAJwCewn6ZpwnDam2yzgG` (deployment antigo, intocado).
- `vercel inspect https://jornalir.vercel.app` → ainda resolve para `dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc` (deployment antigo do portal, preparado na ETAPA 1, intocado).
- `curl https://controle.altnix.com.br/login` → HTTP 200 (domínio público respondendo normalmente, sem qualquer interrupção).

TESTES: nenhum teste de código novo nesta etapa (ação de infraestrutura/deploy). TypeScript/lint já validados pelo próprio build da Vercel (etapa "Linting and checking validity of types", sem erros).

ARQUIVOS: nenhum arquivo de código alterado nesta etapa.

FALTA/BLOQUEIOS: nenhum impedimento técnico no deployment correto. Pendência registrada (não é bloqueio): decidir o que fazer com o deployment extra indesejado `dpl_32SxxibP2toksm7wGG4YLRCESX69` no projeto `jornalir` (não promovido, não aliasado, sem efeito em produção — só ocupa espaço na lista de deployments). Pendente de autorização explícita para os próximos passos do roteiro: aplicação das 7 migrations e, depois, promoção coordenada dos dois domínios. Nenhuma migration aplicada, nenhum domínio alterado, nenhuma permissão concedida, nenhum OTP/cobrança real, nenhum dado de produção alterado nesta etapa.

## 03/11/2026 — ETAPA 3.1/3.2: auditoria das 7 migrations pendentes, bloqueio real encontrado em `20261120290000` e correção implementada LOCALMENTE (sem aplicar nada)

**ETAPA 3.1 (auditoria, somente leitura)**: reconferidas as 7 migrations pendentes (`20261101110000`, `20261120270000`–`20261120320000`) via `supabase migration list --linked`/`db push --linked --dry-run --include-all` — lista idêntica à já registrada no lote anterior, nenhuma surpresa, nenhuma de NFS-e. Dependências, RLS, GRANTs e SECURITY DEFINER de cada uma conferidos contra o schema já aplicado (tudo compatível). Achado de risco real: a consulta de leitura em produção (pedida pelo usuário) encontrou **1 linha em `public.birthday_entries` com `publish_in_print = true`**; como `consent_status` nasce `'pending'`, a nova constraint `birthday_entries_publish_requires_consent` da migration `20261120290000` rejeitaria essa linha legada e a migration falharia ao aplicar.

**ETAPA 3.2 (correção local, aprovada pelo usuário)**:

1. **Migration** `supabase/migrations/20261120290000_birthday_entries_consent_and_sync.sql`: inserido, entre a criação das colunas de consentimento e a `ADD CONSTRAINT`, o `UPDATE public.birthday_entries SET publish_in_print = false WHERE publish_in_print = true AND consent_status IS DISTINCT FROM 'granted'` exatamente como aprovado — despublica a linha legada sem apagar nenhum dado e sem nunca atribuir `consent_status = 'granted'` automaticamente (não presume consentimento).

2. **Módulo Aniversariantes — consentimento explícito e auditável** (`apps/sistema/src/app/sistema/aniversariantes/actions.ts`):
   - `setBirthdayPublication`: habilitar publicação (`allowed=true`) agora exige `consent_status = 'granted'` já registrado (origem "editorial" e "cliente"); nunca presume, nunca forja. Desabilitar continua sempre permitido. Erro claro ao operador quando falta consentimento.
   - `saveEditorialBirthday`: nunca cria um aniversariante já publicado (não há consentimento possível antes de o registro existir); update só aceita `publishInPrint=true` se `consent_status` já for `'granted'`.
   - Nova action `recordBirthdayConsent(source,id,{status,isMinor,guardianName})`: único ponto do código que pode gravar `consent_status='granted'`, sempre por confirmação explícita do operador; exige nome do responsável quando `isMinor=true`; `status='denied'` despublica imediatamente (`publish_in_print=false`) no mesmo passo — nunca mantém publicação sem consentimento concedido. Campos `consent_recorded_by`/`consent_recorded_at` preenchidos automaticamente (quem e quando).
   - `linkBirthdayEntryToClient`: migra `consent_status`/`consent_recorded_by`/`consent_recorded_at`/`is_minor`/`guardian_name` do registro legado para o novo vínculo — nunca reinicia como `'pending'`.
   - Tipos (`birthdayTypes.ts`, `editorialBirthdayTypes.ts`) e leitura (`page.tsx`, select SQL) atualizados para carregar os novos campos.
   - UI (`BirthdaysList.tsx`): novo botão "Registrar consentimento" (todas as origens: cadastro/familiar/manual) abrindo painel com resultado (Concedido/Negado), checkbox "menor de idade" + nome do responsável (obrigatório se menor); novo selo de status (Pendente/Concedido/Negado) ao lado do selo de publicação existente. Nenhuma tela de módulo alheio tocada.

**TESTES** (executados localmente, `npx tsx --test`):
- Novos: `apps/sistema/test/birthday-entries-legacy-consent-regression.test.ts` (4 testes — confirma que o `UPDATE` de correção existe, nunca forja `'granted'`, roda depois da coluna existir e antes da constraint) e `apps/sistema/test/birthday-consent-actions-structure.test.ts` (9 testes — confirma estruturalmente, lendo o código real, que nenhuma função além de `recordBirthdayConsent` grava `'granted'`, que `setBirthdayPublication`/`saveEditorialBirthday` checam consentimento antes de publicar, que `denied` despublica, e que o vínculo com o cadastro mestre preserva o consentimento). **13/13 passam.**
- Suíte completa de `apps/sistema/test` (41 arquivos, `tsx --test`): **204/206 passam**; as 2 falhas (`client-completion-tokens.test.ts`, `danfse-pdf.test.ts`) são de ambiente, pré-existentes e não relacionadas a este lote — `server-only` importado fora de um Server Component real, e módulo nativo `canvas` ausente para `pdfjs-dist` — confirmado pelo stack trace, nenhuma delas toca Aniversariantes/consentimento.
- `tsc --noEmit` (`npm run typecheck --workspace @ir/sistema`): limpo, sem erros.
- **Limitação explícita**: não há stack Postgres/Docker local disponível nesta máquina (`supabase status`/`docker ps` falham por falta do engine) — não foi possível aplicar de fato a migration corrigida contra uma cópia isolada do banco para confirmar a ausência do erro de constraint na prática. A confirmação é só estrutural/estática (leitura do SQL real), igual ao padrão já aceito no projeto para este tipo de teste; a validação definitiva só ocorre no dry-run/apply real contra o Supabase, quando autorizado.
- Reconfirmado após a correção: `supabase db push --linked --dry-run --include-all` continua devolvendo exatamente as mesmas 7 migrations, nenhuma nova, nenhuma aplicada.

**ARQUIVOS MODIFICADOS** (nenhum commit, nenhum push): `supabase/migrations/20261120290000_birthday_entries_consent_and_sync.sql`, `apps/sistema/src/app/sistema/aniversariantes/actions.ts`, `apps/sistema/src/app/sistema/aniversariantes/page.tsx`, `apps/sistema/src/features/aniversariantes/BirthdaysList.tsx`, `apps/sistema/src/features/aniversariantes/birthdayTypes.ts`, `apps/sistema/src/features/aniversariantes/editorialBirthdayTypes.ts`, `apps/sistema/src/app/globals.css` (novas classes `status-pill--consent-*`/`aniv-consent-minor`). Novos: `apps/sistema/test/birthday-entries-legacy-consent-regression.test.ts`, `apps/sistema/test/birthday-consent-actions-structure.test.ts`.

**FALTA/BLOQUEIOS**: nenhuma migration aplicada, nenhum dado de produção alterado, nenhum commit/push/deploy. O deployment do IR Controle já preparado (`dpl_BYBipGsefkSocZUb4RiuWEqpvkUc`, commit `31b254c5`) **não contém** estas alterações — precisa de novo build/deployment, só mediante nova autorização, antes de ser considerado pronto para promoção. GO/NO-GO desta correção específica: **GO** (a migration volta a ser aplicável sem quebrar sobre o dado legado, sem perda de dados, sem presumir consentimento); o GO/NO-GO do lote completo de 7 migrations continua pendente da autorização de aplicação em si.

## 03/11/2026 — ETAPA 4: pré-aplicação das 7 migrations, checklist final e achado operacional (nada aplicado)

**1. Git**: branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD ainda `65675aa0`, working tree com exatamente os mesmos arquivos locais da ETAPA 3.2 modificados/novos, nada commitado, nada perdido.

**2. Dry-run reconfirmado**: `supabase db push --linked --dry-run --include-all` devolve as mesmas 7 migrations (`20261101110000`, `20261120270000`–`20261120320000`), nenhuma nova, nada aplicado.

**3. Revisão da migration corrigida**: `20261120290000` reconferida linha a linha — ordem certa (colunas → `UPDATE` de correção do dado legado → constraints), comentário inicial do arquivo também corrigido (estava desatualizado, dizia "nenhuma linha em produção"; agora reflete o achado real de 1 linha). As outras 6 migrations não foram alteradas nesta sessão; dependências já conferidas na ETAPA 3.1 continuam válidas (nenhuma referencia schema ainda inexistente).

**4. Novas divergências**: `supabase migration list --linked` reconferido por completo (204 migrations locais) — só as mesmas 7 têm `remote` vazio; nenhuma das 197 já aplicadas mudou de estado.

**5. Backup/recuperação**: `supabase backups list` — backup físico diário mais recente de **03/11/2026 07:07 UTC** (hoje), `walg_enabled: true`, `pitr_enabled: false`. Recuperação possível só para o início do dia, sem granularidade de ponto-no-tempo — qualquer escrita de hoje após 07:07 UTC não seria recuperável por este backup isoladamente.

**Achado operacional (novo, relevante para a sequência de publicação)**: o módulo Aniversariantes já está em produção desde outubro (bem antes do conceito de consentimento existir), incluindo o botão "Autorizar publicação" que grava `publish_in_print=true` diretamente, sem nenhuma checagem de consentimento. O deployment atualmente publicado em `controle.altnix.com.br` (`dpl_68cqZyrLAJwCewn6ZpwnDam2yzgG`, criado 01/11) roda esse código antigo. **Se as migrations forem aplicadas antes da promoção do novo deployment (com o fluxo de consentimento), qualquer tentativa de um operador clicar em "Autorizar publicação" no site/sistema AINDA EM PRODUÇÃO (código antigo) falhará com um erro de banco (violação da nova constraint `birthday_entries_publish_requires_consent`), em vez da mensagem clara já implementada no código novo.** A própria linha legada (1 registro) é corrigida pela migration e não quebra; o risco é sobre NOVAS tentativas de publicação pelo operador durante a janela entre aplicar as migrations e promover o novo IR Controle. Recomendação: aplicar as migrations o mais próximo possível (mesma janela/sessão) da promoção do novo IR Controle, e avisar a equipe editorial para evitar usar "Autorizar publicação" em Aniversariantes nessa janela intermediária.

**6. Coerência do fluxo de consentimento com as regras do banco**: conferido explicitamente — `recordBirthdayConsent` nunca grava `guardian_name` nulo quando `is_minor=true` (bate com `birthday_entries_guardian_required_for_minor`); `setBirthdayPublication`/`saveEditorialBirthday` só permitem `publish_in_print=true` quando `consent_status` já é `'granted'` (bate com `birthday_entries_publish_requires_consent`); `recordBirthdayConsent` só grava `'granted'` ou `'denied'`, nunca um valor fora de `birthday_entries_consent_status_valid`. Nenhuma divergência encontrada entre a aplicação e as constraints da migration corrigida.

**7. Falhas ambientais da suíte** (`client-completion-tokens.test.ts`, `danfse-pdf.test.ts`): reconfirmadas — `server-only` lançando erro ao ser importado fora de um Server Component real do Next.js dentro do runner `tsx --test`, e módulo nativo `canvas` ausente para `pdfjs-dist`. Ambas são falhas de AMBIENTE de teste local (não existem no build real da Vercel, que já validou tipos/lint sem erro nas ETAPAs 1/2), não tocam nenhum arquivo deste lote, e não afetam a publicação nem a aplicação das migrations.

**WhatsApp (registro para planejamento futuro, não implementado)**: módulo de atendimento compartilhado com número diferente da Cloud API de mensagens automáticas, registrado em `docs/ACORDOS-E-FONTE-DA-VERDADE.md` (seção 03/11/2026). Nenhum código alterado.

### CHECKLIST FINAL DE APLICAÇÃO E VALIDAÇÃO PÓS-MIGRATION (preparado, aguardando autorização)
1. Confirmar mais uma vez `supabase db push --linked --dry-run --include-all` imediatamente antes de aplicar (ledger pode mudar entre sessões).
2. Aplicar com `supabase db push --linked --include-all` (ordem do próprio ledger, já validada).
3. Verificar pós-apply: `select count(*) from public.birthday_entries where publish_in_print and consent_status is distinct from 'granted'` deve retornar **0** (confirma que a correção da linha legada funcionou).
4. Rodar a suíte local novamente contra o schema real (quando possível) e os testes de regressão já criados.
5. Build/deploy do novo IR Controle com o código desta correção (ainda não gerado) o mais próximo possível da aplicação das migrations, para minimizar a janela operacional descrita acima.
6. Avisar a equipe editorial para evitar usar "Autorizar publicação" em Aniversariantes enquanto o IR Controle novo não estiver promovido.
7. Só então seguir o roteiro já registrado: promoção coordenada dos dois domínios.

**GO/NO-GO desta etapa**: **GO para aplicar as 7 migrations**, condicionado a (a) aceitar a janela operacional descrita acima (ou aplicar migrations e promover o IR Controle na mesma sessão/curto intervalo) e (b) nova autorização explícita do usuário para a aplicação em si — esta etapa foi só conferência, nenhuma migration foi aplicada, nenhum dado de produção foi alterado, nenhum commit/push/deploy foi feito.

## 03/11/2026 — ETAPA 5: preparação da publicação coordenada (Portal + IR Controle), nada aplicado/promovido

**1. Git**: branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD ainda `65675aa0`, todas as alterações locais da ETAPA 3.2 preservadas (9 arquivos modificados + 2 testes novos), nada commitado.

**2. Diff revisado por completo**: confirmado que as 9 mudanças pertencem estritamente ao módulo de consentimento de Aniversariantes (`globals.css`, `actions.ts`, `page.tsx`, `BirthdaysList.tsx`, `birthdayTypes.ts`, `editorialBirthdayTypes.ts`, a migration corrigida, e os dois docs). Nenhuma mudança fora de escopo.

**3. Build e testes**: `tsc --noEmit` limpo; os 13 testes de regressão de consentimento passam (13/13). `next build` local trava na fase "Collect build traces" com `Error: UNKNOWN: unknown error, read` — reproduzido 2x, mesmo índice de dependência — causa é o OneDrive (Files On-Demand) interferindo na leitura de arquivos durante o trace collection do Next.js nesta pasta sincronizada; **compilação, lint e geração das 78/78 páginas estáticas passam antes desse ponto** ("✓ Compiled successfully", "✓ Generating static pages (78/78)"), só a etapa final de empacotamento de funções serverless falha localmente. Isso é limitação de AMBIENTE local (mesma classe do Docker/Postgres já registrado), não do código — a build que importa de fato é a da Vercel (infraestrutura sem OneDrive), já validada com sucesso nas ETAPAs 1 e 2 para o commit anterior; será revalidada pela própria Vercel no momento do novo deployment.

**4/5. Vercel — projeto e Root Directory confirmados sem expor segredos**: `apps/sistema/.vercel/project.json` aponta para `projectName: "jornalir-sistema"` (`prj_5fwCT7UK5I1Jc9BO4pZWLoa4jD4h`). Confirmado também via `vercel project ls` (jornalir-sistema → controle.altnix.com.br; jornalir → jornalir.vercel.app) e via `vercel inspect` do deployment preparado na ETAPA 2 (`dpl_BYBipGsefkSocZUb4RiuWEqpvkUc`, build concluído com as rotas certas, incluindo `agenda`), confirmando que o Root Directory efetivo usado foi `apps/sistema` (não a raiz do monorepo). `vercel env ls production` (apps/sistema) confirma que todas as variáveis necessárias já existem em Production (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_*`, `ASAAS_*`, `CRON_SECRET` etc.) — nenhum valor exposto (mostrados como "Hidden" ou blob encriptado pela própria Vercel). Ambos os domínios de produção reconfirmados intactos e apontando para os MESMOS deployments de antes desta sessão: `controle.altnix.com.br` → `dpl_68cqZyrLAJwCewn6ZpwnDam2yzgG` (criado 01/11); `jornalir.vercel.app` → `dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc` (criado 01/11). Nada foi promovido.

**6. Comandos exatos para o novo deployment (preparados, NÃO executados)**:
```
cd apps/sistema
npx vercel deploy --prod --skip-domain --yes --scope team_ZeE622FeA1dvTu7aFLQwxpLF
```
`--skip-domain` evita qualquer alias/promoção automática de domínio — gera só um novo deployment com target production, sem tocar `controle.altnix.com.br`. O ID retornado deve ser conferido com `vercel inspect <novo-id>` antes de qualquer promoção. Para o portal, mesmo padrão a partir de `apps/site`.

**7. Roteiro coordenado (preparado, aguardando autorização)**:
1. Confirmar novamente, imediatamente antes de iniciar, `supabase db push --linked --dry-run --include-all` (ledger pode mudar entre sessões) e `supabase backups list` (idade do último backup).
2. Avisar a equipe editorial: suspender temporariamente o uso de "Autorizar publicação" em Aniversariantes (único ponto de incompatibilidade identificado) até o aviso de liberação.
3. Aplicar as 7 migrations: `supabase db push --linked --include-all`.
4. Validar imediatamente: `select count(*) from public.birthday_entries where publish_in_print and consent_status is distinct from 'granted';` deve retornar 0.
5. Gerar o novo deployment do IR Controle (comando acima) com o código desta correção; conferir `vercel inspect` (rotas, commit, status Ready).
6. Gerar o novo deployment do Portal (mesmo padrão, `apps/site`), se também houver mudanças pendentes de promoção.
7. Promover (alias) o IR Controle primeiro para `controle.altnix.com.br` — este é o lado que depende das migrations recém-aplicadas.
8. Smoke test imediato no domínio promovido: abrir Aniversariantes, tentar "Registrar consentimento" (conceder e negar), confirmar que "Autorizar publicação" sem consentimento mostra a mensagem amigável (não erro de banco), conferir Blocos A-E e `/complementar-cadastro/[token]`.
9. Só então promover o Portal, se aplicável, e repetir smoke test básico do lado do site.
10. Avisar a equipe que a restrição temporária do passo 2 foi encerrada.

**8. Rollback operacional e critérios de interrupção**: rollback de código (reverter alias para o deployment anterior) NÃO desfaz as migrations já aplicadas — schema e dados alterados pelas 7 migrations permanecem, mesmo que o alias volte ao deployment antigo. Interromper imediatamente e não prosseguir para a promoção se: (a) o `count(*)` de verificação pós-migration no passo 4 não retornar 0; (b) qualquer migration falhar a aplicar (erro de SQL); (c) o novo build falhar na Vercel (não no ambiente local, que já tem a limitação de OneDrive registrada); (d) o smoke test do passo 8 encontrar qualquer comportamento inesperado no fluxo de consentimento ou nos Blocos A-E. Se a interrupção ocorrer DEPOIS das migrations já aplicadas, a opção segura é seguir adiante com a promoção do novo deployment (que já é compatível com o schema novo) em vez de tentar reverter o schema — reverter o schema via nova migration corretiva, nunca via rollback de deployment.

**9. Portal**: deployment do Portal já preparado anteriormente (ETAPA 1, `apps/site`), não promovido, domínio `jornalir.vercel.app` intacto apontando para `dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc` (01/11). O Portal não depende de nenhuma das 7 migrations pendentes (nenhuma delas altera tabelas usadas pelo fluxo público do site além de `clients`/`birthday_entries`, já cobertas pela sequência acima) — pode ser promovido antes, junto ou depois do IR Controle sem risco de schema; a sequência recomendada (passo 7 antes do passo 9) é só para priorizar a validação do lado que tem a mudança de banco.

**GO/NO-GO desta etapa**: **GO para seguir ao roteiro de aplicação+promoção coordenada**, condicionado a nova autorização explícita do usuário para cada ação de escrita (aplicar migrations, criar novo deployment, promover domínio). Nesta etapa: nenhuma migration foi aplicada, nenhum deployment novo foi criado, nenhum domínio foi promovido, nenhum commit/push foi feito — só build/testes locais e consultas de leitura à Vercel/Supabase.

## 03/11/2026 — ETAPA 6: correção do método de deploy do monorepo e preparação final (nada aplicado/implantado)

**1. Git**: branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD ainda `65675aa0`, mesmos 9 arquivos modificados + 2 testes novos da ETAPA 3.2, nada commitado.

**2/3. CORREÇÃO IMPORTANTE ao comando proposto na ETAPA 5**: o comando então sugerido (`cd apps/sistema && vercel deploy --prod --skip-domain --yes`) estava ERRADO e teria falhado. Releitura do próprio histórico desta sessão (ETAPAs 1 e 2, acima) confirma o mecanismo exato: quando o CLI é chamado de DENTRO de `apps/sistema`/`apps/site`, aquele subdiretório já é enviado como a raiz do upload — e a configuração "Root Directory" do projeto na Vercel (`apps/sistema` para `jornalir-sistema`, `apps/site` para `jornalir`) tentaria resolver `apps/sistema/apps/sistema`, que não existe, e falharia com o erro "Root Directory apps/sistema does not exist" (já reproduzido e documentado nas ETAPAs 1/2). O método correto, já validado nas duas etapas anteriores: executar da RAIZ do monorepo, nunca de dentro do subdiretório. Além disso, o `.vercel/project.json` da RAIZ (e de `apps/site`) aponta para `projectName: "jornalir"` — por isso rodar da raiz SEM especificar o projeto explicitamente repete exatamente o erro de direcionamento da ETAPA 2. A flag `--project jornalir-sistema` explícita é obrigatória, não opcional.

Tentativa de confirmar isso com um `vercel deploy --dry` (que só inspeciona, não cria deployment) a partir da raiz foi bloqueada pelo classificador de permissão do ambiente como "Production Deploy" — então a confirmação ficou só na análise do histórico documentado (ETAPAs 1/2) e na leitura dos arquivos de vínculo (`.vercel/project.json`), não em uma nova execução real.

**4/5. Comando corrigido para o novo deployment do IR Controle** (contém as alterações locais de consentimento, NÃO reutiliza o deployment antigo):
```
npx vercel deploy --prod --skip-domain --yes --project jornalir-sistema --scope team_ZeE622FeA1dvTu7aFLQwxpLF
```
(executado a partir da RAIZ do monorepo — obrigatório). Isso faz o CLI enviar o working tree local atual (incluindo as mudanças de consentimento ainda não commitadas) e compilar do zero NA infraestrutura da Vercel — sem relação com a limitação de OneDrive do build local (ETAPA 5). A limitação local não é e não substitui prova de que o build remoto funciona; só o resultado real desse deployment (`readyState: "READY"`) prova isso, e ainda não foi gerado.

**6. Verificação de rotas/artefatos planejada (sem executar funcionalidades dependentes das migrations)**: `vercel inspect <novo-id>` para confirmar `readyState: "READY"`, `target: "production"`, `productionUrl: null` (não promovido), e a lista de `Builds` com as rotas esperadas (`aniversariantes`, `complementar-cadastro/[token]`, `agenda`, Blocos A-E, 78 páginas). NÃO abrir a URL própria do deployment para usar "Registrar consentimento"/"Autorizar publicação" nele — o banco de produção ainda não tem as colunas/constraint novas, então qualquer leitura/escrita real nessas rotas falharia por causa do schema antigo, não por bug do código. Validação funcional real só depois da aplicação das migrations.

**7. Backup/preservação de dados**: reconfirmado — `walg_enabled: true`, `pitr_enabled: false`, backup mais recente 03/11 07:07 UTC. Não existe comando de backup físico sob demanda no CLI (`supabase backups` só lista; um backup manual extra é ação do dashboard da Supabase, fora do alcance read-only desta auditoria). Como as 7 migrations são só aditivas e a única escrita de dado existente é o `UPDATE` de 1 linha já revisado (reversível, valor atual já documentado), a mitigação recomendada é: antes de aplicar, capturar localmente (read-only) um `select *` da linha afetada em `birthday_entries` e das tabelas tocadas pelas outras 6 migrations, como registro independente do backup diário.

**8. Portal — não precisa recompilar**: confirmado via `git diff`/`git log` que `apps/site` não tem NENHUMA alteração (commitada ou local) desde o commit `0df90b45`, exatamente o commit do deployment já preparado na ETAPA 1 (domínio `jornalir.vercel.app` intacto). Esse deployment continua válido e pode ser promovido diretamente, sem novo build.

**9. Comandos exatos consolidados**:
```
# 1) Novo deployment do IR Controle (com a correção de consentimento) — da RAIZ do monorepo:
npx vercel deploy --prod --skip-domain --yes --project jornalir-sistema --scope team_ZeE622FeA1dvTu7aFLQwxpLF

# 2) Verificação (sem promover):
npx vercel inspect <novo-deployment-id> --scope team_ZeE622FeA1dvTu7aFLQwxpLF

# 3) Portal: nenhum comando novo — reutilizar o deployment já preparado na ETAPA 1.
```

**10. Plano de operação em sequência** (preparado, aguardando autorização específica por passo): (a) criar e validar o novo deployment do IR Controle [autorização: criar deployment sem promoção]; (b) comunicar pausa operacional à equipe (suspender "Autorizar publicação"); (c) reconferir dry-run + backup e capturar o snapshot read-only do item 7; (d) aplicar as 7 migrations [autorização: aplicação real]; (e) validar schema (`count(*)=0`, constraints presentes); (f) promover o IR Controle [autorização: promoção de domínio]; (g) testes reais no domínio promovido (consentimento, Blocos A-E, `/complementar-cadastro/[token]`); (h) promover o Portal reutilizando o deployment da ETAPA 1 [autorização: promoção de domínio]; (i) liberar a equipe editorial.

**GO/NO-GO desta etapa**: GO para seguir ao passo (a) — criar o novo deployment do IR Controle SEM promoção — mediante autorização explícita e específica para esse passo isolado; os demais passos continuam condicionados a autorizações próprias, uma a uma. Nesta etapa: nenhum deploy foi executado (tentativa de `--dry` bloqueada pelo classificador de permissão do ambiente), nenhuma migration aplicada, nenhum domínio alterado, nenhum commit/push, nenhuma configuração remota alterada.

## 03/11/2026 — ETAPA 7: novo deployment do IR Controle criado e validado (com a correção de consentimento), SEM promoção

**Autorização**: limitada e explícita só para criar+inspecionar este deployment; migrations e alias permanecem não autorizados.

**1. Git**: branch `solicitacoes-financeiro-contratos-irc-20261031`, HEAD `65675aa0`, mesmas alterações locais da ETAPA 3.2 preservadas e não commitadas no momento do deploy.

**2/3. Local de execução e projeto de destino**: comando executado da RAIZ do monorepo (não de dentro de `apps/sistema`). `.vercel/project.json` da raiz confirma `projectName: "jornalir"` (vínculo errado, por isso o `--project jornalir-sistema` explícito era obrigatório); `apps/sistema/.vercel/project.json` confirma `jornalir-sistema`. CLI `62.2.0` aceitou todas as flags do comando sem erro.

**4. Comando executado**:
```
npx vercel deploy --prod --skip-domain --yes --project jornalir-sistema --scope team_ZeE622FeA1dvTu7aFLQwxpLF
```

**5. Destino confirmado na saída**: `Deploying cristians-projects-34074cc3/jornalir-sistema` — projeto correto, NÃO `jornalir`.

**Resultado do build**: sucesso. Next.js 14.2.33, `✓ Compiled successfully`, 78/78 páginas estáticas geradas, rota `/sistema/aniversariantes` presente (22.7 kB — maior que antes por conter o novo código de consentimento), `/complementar-cadastro/[token]` presente, `agenda`/Blocos A-E presentes. Build completo em 55s (cache restaurado do deployment anterior `BYBipGsefkSocZUb4RiuWEqpvkUc`).

**6. Inspeção confirmada**:
- `readyState`: **READY**
- `target`: **production**
- `productionUrl`: **null** (não promovido)
- Build sem erros
- Rotas esperadas presentes (lista completa de ~90 rotas, incluindo as do módulo Aniversariantes e `complementar-cadastro/[token]`)
- Código de consentimento incluído: o deploy via CLI envia o working tree local no momento da execução (não o HEAD do Git), portanto inclui as alterações não commitadas de `actions.ts`/`BirthdaysList.tsx`/`page.tsx`/tipos/`globals.css` da ETAPA 3.2. **Nota**: por isso este deployment não corresponde a um único commit SHA — a base foi HEAD `65675aa0` + working tree local no momento do upload.

**Deployment criado**:
- **ID**: `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb`
- **URL própria**: `https://jornalir-sistema-ll5scmex4-cristians-projects-34074cc3.vercel.app`
- **Inspector**: `https://vercel.com/cristians-projects-34074cc3/jornalir-sistema/CoCiC7XxuCT3dYNA8KGMyPUfL8tb`
- **Target**: production / **productionUrl**: null / **readyState**: READY

**7/8. Domínios de produção reconfirmados intactos**: `controle.altnix.com.br` → ainda `dpl_68cqZyrLAJwCewn6ZpwnDam2yzgG`; `jornalir.vercel.app` → ainda `dpl_EMhVZcZR52GNhL87PEASL5Rk3iNc`. Nenhum alias alterado.

**9**: nenhum fluxo de cadastro complementar, consentimento ou assinatura foi executado na URL própria deste deployment (schema de produção ainda não tem as colunas/constraint novas).

ARQUIVOS: nenhum arquivo de código alterado nesta etapa — só a criação e inspeção do deployment.

FALTA/BLOQUEIOS: nenhum impedimento técnico. Pendente de autorização para a ETAPA 8 (aplicação das migrations e/ou promoção).

## 03/11/2026 — ETAPA 8: AS 7 MIGRATIONS FORAM APLICADAS NO SUPABASE DE PRODUÇÃO (site-system-ir, iqnzrpdccecgalqboeyf)

**Autorização**: explícita do usuário, condicionada à confirmação da janela operacional (confirmada pelo usuário antes de aplicar) e à disponibilidade de backup. Deployment `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb` (ETAPA 7) **NÃO foi promovido**.

**1. Pré-checagem rápida**: dry-run reconfirmou as mesmas 7 migrations pendentes, nenhuma nova; arquivos corrigidos da ETAPA 3.2 intactos.

**2. Janela operacional**: confirmada pelo usuário antes da aplicação (equipe editorial avisada para não usar "Autorizar publicação" em Aniversariantes).

**3. Backup**: reconfirmado — `walg_enabled: true`, `pitr_enabled: false`, backup mais recente 03/11 07:07 UTC. Sem bloqueio adicional identificado.

**4. Aplicação**: `supabase db push --linked --include-all` — as 7 migrations foram aplicadas em sequência sem erro: `20261101110000_contract_templates_seed_minutas`, `20261120270000_site_interest_request_identification`, `20261120280000_client_related_persons`, `20261120290000_birthday_entries_consent_and_sync`, `20261120300000_client_completion_tokens`, `20261120310000_client_completion_public_flow`, `20261120320000_subscription_pending_formalization`.

**5. Divergências**: `supabase migration list --linked` reconferido por completo — todas as 204 migrations locais agora têm `remote` preenchido igual ao `local`; nenhuma mismatch restante.

**6. Verificação read-only da correção de consentimento** (via `supabase db query --linked`, só leitura): `select count(*) from public.birthday_entries where publish_in_print and consent_status is distinct from 'granted'` → **0**. A correção da linha legada funcionou exatamente como projetado.

**7. Verificação objetiva de schema/RPCs** (via `supabase db query --linked`, só leitura):
- Colunas novas confirmadas: `birthday_entries.{consent_status,consent_recorded_by,consent_recorded_at,is_minor,guardian_name}`; `clients.family_members_confirmed_empty`; tabela `client_completion_tokens` completa (`id, client_id, token_sha256, channel, channel_value, status, expires_at, verified_at, verified_user_id, completed_at, revoked_at, otp_requests_count, otp_window_started_at, last_otp_requested_at, created_at, created_by`).
- Constraints novas confirmadas: `birthday_entries_consent_status_valid`, `birthday_entries_guardian_required_for_minor`, `birthday_entries_publish_requires_consent`.
- Funções confirmadas: `sync_birthday_entry_from_client()`; `consume_client_completion_token` com as DUAS assinaturas coexistindo (`(text,uuid,jsonb)` da migration anterior e `(text,uuid,jsonb,boolean)` da nova) — sem ambiguidade de runtime, conforme já analisado na ETAPA 3.
- Trigger confirmado: `clients_sync_birthday_entry` em `public.clients`.

**8. Resultado**: TODAS as verificações passaram, nenhum problema encontrado. Nenhuma migration falhou, nenhuma correção improvisada foi necessária, nenhum SQL manual fora das 7 migrations foi executado.

**9/10/11**: IR Controle e Portal **não foram promovidos**; nenhum alias/domínio/Git alterado; nenhuma funcionalidade nova implementada; nenhuma operação financeira realizada.

ARQUIVOS: nenhum arquivo de código alterado nesta etapa — só a aplicação das migrations já revisadas e consultas de leitura ao banco.

FALTA/BLOQUEIOS: nenhum. Schema de produção agora compatível com o deployment `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb` (ETAPA 7). Pendente de autorização para a ETAPA 9 (promoção coordenada do IR Controle e, depois, do Portal).

## 03/11/2026 — ETAPA 9: PROMOÇÃO COORDENADA — IR CONTROLE E PORTAL PUBLICADOS

**Autorização**: explícita do usuário, só para promover os deployments já preparados e validados (sem criar nenhum novo).

**1. IR Controle**: deployment `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb` reconfirmado (projeto `jornalir-sistema`, Ready) antes de promover. Promovido via `vercel promote dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb --scope ... --yes` (executado dentro de `apps/sistema`, já que `vercel promote` resolve o projeto pelo `.vercel/project.json` do diretório atual — raiz apontaria para o projeto errado). Resultado: `Success! jornalir-sistema was promoted ... (dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb)`. Confirmado por `vercel inspect controle.altnix.com.br`: domínio agora aponta para `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb`. Smoke test HTTP objetivo (sem sessão autenticada real — nenhuma credencial de produção foi usada ou criada): `/login`, `/sistema`, `/sistema/clientes`, `/sistema/assinaturas`, `/sistema/aniversariantes` → todos **200**, nenhum erro 5xx. **Limitação explícita**: isto confirma que a aplicação está no ar e as rotas resolvem sem erro de servidor — NÃO é um teste funcional autenticado (login real, navegação dentro do painel); isso requer uma sessão de usuário real, que não foi executada por este agente.

**2. Portal**: ID correto recuperado do registro da ETAPA 1 — `dpl_CC46f5W12kysqex65B5mXuKT4a2L` (projeto `jornalir`, Ready) — **não** o deployment acidental `dpl_32SxxibP2toksm7wGG4YLRCESX69` (criado por engano no projeto `jornalir` durante a ETAPA 2 do IR Controle), que permanece intacto e não utilizado. Promovido via `vercel promote dpl_CC46f5W12kysqex65B5mXuKT4a2L --scope ... --yes` (dentro de `apps/site`). Resultado: `Success! jornalir was promoted ... (dpl_CC46f5W12kysqex65B5mXuKT4a2L)`. Confirmado por `vercel inspect jornalir.vercel.app`. `vercel domains ls` confirma que o único domínio customizado do time é `altnix.com.br` (controle.altnix.com.br é um subdomínio dele, usado pelo IR Controle) — o projeto `jornalir` não tem domínio customizado próprio vinculado, só `jornalir.vercel.app`; nenhum vínculo foi alterado. Smoke test HTTP: `/`, `/noticias`, `/assine`, `/anuncios`, `/contato` → todos **200**.

**3. Cuidados**: nenhum deployment novo criado, nenhuma migration adicional aplicada, nenhum dado do Supabase alterado, nenhum commit/push, nenhuma mudança no módulo Aniversariantes, WhatsApp compartilhado não implementado, nenhum outro projeto/domínio tocado.

**4. Falhas**: nenhuma falha crítica encontrada em nenhum dos dois smoke tests — promoção do Portal não foi interrompida.

**5. Resumo final**:
| Deployment | ID | Domínio | Resultado |
|---|---|---|---|
| IR Controle | `dpl_CoCiC7XxuCT3dYNA8KGMyPUfL8tb` | `controle.altnix.com.br` | Promovido, smoke test HTTP 200 em todas as rotas testadas |
| Portal | `dpl_CC46f5W12kysqex65B5mXuKT4a2L` | `jornalir.vercel.app` | Promovido, smoke test HTTP 200 em todas as rotas testadas |

PENDÊNCIAS: teste funcional autenticado real (login de operador, navegação completa no painel) não foi executado por este agente — recomenda-se verificação manual pela equipe. Deployment acidental antigo `dpl_32SxxibP2toksm7wGG4YLRCESX69` (projeto `jornalir`) continua existindo, não excluído (decisão do usuário pendente). Pendência registrada (não executada nesta etapa): simplificação do módulo Aniversariantes (remoção do fluxo de consentimento) e módulo futuro de WhatsApp compartilhado.

## 03/11/2026 — PENDÊNCIA PÓS-PUBLICAÇÃO: simplificação do módulo Aniversariantes, retirada do fluxo de consentimento (LOCAL, nada aplicado/deploy/commit/push)

**Decisão do usuário**: o módulo Aniversariantes só organiza homenagens no JORNAL IMPRESSO (nome, dia, mês — sem ano, sem publicação automática em site/redes). O fluxo dedicado de consentimento (telas, selos, classificação de menor) criado na ETAPA 3.2 foi retirado do lado EDITORIAL do módulo; controle volta a ser simples: "Incluir no jornal impresso / Retirar do jornal impresso", sempre uma decisão direta da equipe.

**Achado-chave antes de alterar qualquer coisa**: as colunas `consent_status`/`is_minor`/`guardian_name`/a CHECK `birthday_entries_publish_requires_consent` (migration `20261120290000`, já aplicada em produção) são **compartilhadas** com o fluxo PÚBLICO de cadastro complementar (migration `20261120310000`, também já aplicada — funções `public_complete_add_family_member` e `consume_client_completion_token`), que grava o consentimento do próprio titular/família de forma independente, sempre a partir de uma escolha explícita (`p_consent`/`titular_consent`), nunca presumida. Essas funções decidem `publish_in_print` sozinhas no próprio corpo — nunca dependeram da CHECK para a própria correção.

**Alterações feitas (todas locais)**:
- **Migration corretiva nova** (NÃO edita nenhuma migration já aplicada): `supabase/migrations/20261120330000_birthday_entries_simplify_editorial_flow.sql` — só `alter table public.birthday_entries drop constraint if exists birthday_entries_publish_requires_consent;`. Não remove colunas, não toca `birthday_entries_guardian_required_for_minor` nem `birthday_entries_consent_status_valid` (continuam protegendo o fluxo público, intocado), não altera dados — nenhum registro é republicado automaticamente (a linha legada despublicada na ETAPA 8 continua despublicada).
- `apps/sistema/src/app/sistema/aniversariantes/actions.ts`: removida a função `recordBirthdayConsent` por completo; removida a constante `CONSENT_REQUIRED_ERROR`; removidas as checagens de `consent_status` em `setBirthdayPublication` (ramos "editorial" e "cliente") e em `saveEditorialBirthday` (criação e edição) — voltam a ser toggles diretos de `publish_in_print`. `linkBirthdayEntryToClient` continua migrando os campos legados de consentimento (preservação de dado, nunca os reinicia) — inofensivo, não gatilha mais nada.
- `apps/sistema/src/features/aniversariantes/BirthdaysList.tsx`: removidos o botão "Registrar consentimento", o painel/formulário de consentimento (status, checkbox de menor, nome do responsável), o selo de status de consentimento, o estado `consenting`/`consentDraft`/`consentError`, a função `recordConsent` e todas as passagens de `onRecordConsent` (principal, fundação, membros).
- `apps/sistema/src/features/aniversariantes/birthdayTypes.ts`, `editorialBirthdayTypes.ts`, `apps/sistema/src/app/sistema/aniversariantes/page.tsx`, `apps/sistema/src/app/globals.css`: removidos os campos/seleções/estilos de `consentStatus`/`consentRecordedAt`/`isMinor`/`guardianName` introduzidos na ETAPA 3.2 (não lidos pela UI simplificada).
- Testes: removido `apps/sistema/test/birthday-consent-actions-structure.test.ts` (testava exclusivamente o fluxo removido); criado `apps/sistema/test/birthday-entries-simplify-editorial-flow.test.ts` (8 testes: confirma a remoção completa do fluxo editorial, confirma que a migration corretiva só remove a CHECK certa sem tocar colunas/outras CHECKs/dados, confirma que a migration já aplicada `20261120290000` permanece intacta, confirma que o fluxo público `20261120310000` continua decidindo consentimento sozinho). Reconfirmado também `birthday-entries-legacy-consent-regression.test.ts` (migration já aplicada, inalterada) e `client-completion-public-flow-security.test.ts` (fluxo público, inalterado) — **26/26 testes direcionados passam**.
- `tsc --noEmit`: limpo, sem erros.

**Preservação confirmada**: nenhuma coluna removida, nenhum dado alterado, fotos/mensagens/vínculos com clientes/sincronização intactos (nenhum desses caminhos foi tocado), fluxo público de cadastro complementar intocado e verificado por teste direcionado.

**WhatsApp compartilhado**: continua só registrado como pendência futura em `docs/ACORDOS-E-FONTE-DA-VERDADE.md` (03/11/2026) — não implementado.

ARQUIVOS: `supabase/migrations/20261120330000_birthday_entries_simplify_editorial_flow.sql` (novo), `apps/sistema/src/app/sistema/aniversariantes/actions.ts`, `apps/sistema/src/app/sistema/aniversariantes/page.tsx`, `apps/sistema/src/features/aniversariantes/BirthdaysList.tsx`, `apps/sistema/src/features/aniversariantes/birthdayTypes.ts`, `apps/sistema/src/features/aniversariantes/editorialBirthdayTypes.ts`, `apps/sistema/src/app/globals.css`, `apps/sistema/test/birthday-entries-simplify-editorial-flow.test.ts` (novo), `apps/sistema/test/birthday-consent-actions-structure.test.ts` (removido).

FALTA/BLOQUEIOS: nada aplicado em produção, nenhum deploy, commit ou push — tudo local, aguardando autorização para os próximos passos (aplicar a migration corretiva, gerar novo deployment do IR Controle com esta simplificação, promover). Nenhum teste local de banco real executado (mesma limitação de ambiente já registrada — sem Docker/Postgres local); validação é só estrutural (leitura de código/SQL real), consistente com o padrão já usado neste projeto.

## 03/11/2026 — MÓDULO WHATSAPP, REFORMULADO: aproveita o WhatsApp já em uso, sem Cloud API própria (nada aplicado/deploy/commit/push)

**Decisão revisada do usuário**: a primeira versão deste módulo (registrada acima, mesma data) presumia migrar o número de atendimento para a Cloud API, com provedor de envio, webhook próprio e parser de mensagens. O usuário decidiu usar o número de atendimento que **já existe e já funciona no WhatsApp normal**, sem essa migração. Toda a parte dependente da Cloud API de atendimento foi **removida** antes de qualquer commit/push (nada daquilo chegou a ser enviado ao GitHub).

**Removido** (nunca chegou a ser commitado): `apps/sistema/src/lib/whatsapp/attendanceProvider.ts`, `incomingMessageParser.ts`, `apps/sistema/src/app/api/integrations/whatsapp-atendimento/webhook/` (rota completa), `apps/sistema/src/features/whatsapp/WhatsappInbox.tsx`, o teste exclusivo dessas peças, e a migration antiga (tabelas `whatsapp_attendance_conversations`/`whatsapp_attendance_messages`, trigger, Realtime) — nenhuma dessas estruturas chegou a ser aplicada em produção.

**Preservado, confirmado sem diff**: `apps/sistema/src/lib/financeiro/whatsappCloudProvider.ts` (número automático de cobrança/assinatura/OTP), webhook Asaas, `supabase/functions/` — a integração automática existente continua 100% intocada.

**Implementado agora (versão simplificada)**:
- **Migration** `supabase/migrations/20261120340000_whatsapp_attendance_module.sql` (mesmo arquivo, conteúdo reescrito — nunca foi aplicada, sem risco de recriar algo já existente): cria só `whatsapp_attendance_cases` (contact_name, contact_phone opcional, status pending/in_progress/done, `assigned_to` e `created_by` referenciando `profiles` — nunca um segundo cadastro de funcionários, notes). Sem tabela de mensagens, sem webhook, sem Realtime. RLS: leitura por visibilidade do módulo, escrita por `atendimento_gerenciar`. CHECKs de `staff_module_visibility`/`staff_module_action_permissions` ampliadas para `'whatsapp'`/`'atendimento_gerenciar'` — reaproveita 100% o sistema de permissões existente, sem login/senha separados.
- **Server Actions** `apps/sistema/src/app/sistema/whatsapp/actions.ts`: `createAttendanceCase`, `setAttendanceCaseStatus`, `assignAttendanceCase`, `saveAttendanceCaseNotes` — todas com `checkModuleAction("whatsapp","atendimento_gerenciar")`, nenhuma delas envia, recebe ou lê mensagens do WhatsApp.
- **UI** `apps/sistema/src/app/sistema/whatsapp/page.tsx` + `apps/sistema/src/features/whatsapp/WhatsappCaseBoard.tsx`: botão **"Abrir WhatsApp de Atendimento ↗"** para `https://web.whatsapp.com/` em nova aba (aproveita a sessão já conectada no navegador; se não estiver conectado, o vínculo normal por QR Code continua funcionando pelo próprio WhatsApp); abaixo, um quadro simples com abas (Pendentes/Em atendimento/Concluídos/Todos), criação de registro (nome/telefone opcional/observações), troca de responsável (lista de staff ativo, mesma tabela `profiles`) e de situação, e campo de observações — deixa explícito na própria tela que não sincroniza mensagens automaticamente.
- **Navegação/permissões** (`navigation.ts`, `AdminHeader.tsx`, `MobileNav.tsx`, `staffPermissionsCatalog.ts`): mantidos como na primeira versão — módulo "WhatsApp" acessível com login/permissões do IR Controle já existentes, sem exigir nova senha.

**Integração futura tipo WaSeller**: avaliada apenas como observação, não implementada. Se um dia o usuário quiser ligar o painel a uma ferramenta de histórico/automação para WhatsApp Web (WaSeller ou similar), isso é um projeto separado — normalmente depende de uma extensão de navegador ou automação não-oficial, o que entra em conflito direto com a restrição "não instalar extensões de terceiros e não usar automação não-oficial do WhatsApp Web" desta mesma decisão. Registrado como pendência a avaliar separadamente, nunca implementada agora.

**Testes direcionados** (`apps/sistema/test/whatsapp-attendance-module.test.ts`, reescrito — 7 testes): confirma que nenhum arquivo do módulo referencia mais credenciais/provedor/webhook/parser da Cloud API de atendimento; confirma que o provedor automático existente continua sem nenhuma referência ao módulo novo; confirma o botão apontando para `web.whatsapp.com` em nova aba; confirma que todas as ações exigem a permissão já existente, sem cadastro paralelo; confirma que a migration cria só a tabela de controle interno, sem mensagens/webhook/Realtime, e que o comentário da migration deixa explícito que não sincroniza mensagens reais. **7/7 passam.** `tsc --noEmit` limpo.

**Confirmação de preservação (ponto 11 do pedido)**: `git status` mostra só os 5 arquivos genéricos de registro de módulo (`navigation.ts`, `staffPermissionsCatalog.ts`, `AdminHeader.tsx`, `MobileNav.tsx`, `globals.css` — diffs pequenos e aditivos, ver `git diff --stat`), as pastas novas do módulo WhatsApp, e este documento. Nenhum arquivo de Portal, Financeiro, Aniversariantes, Altnix Informativo ou Altnix Platform foi tocado.

ARQUIVOS FINAIS (mantidos): `supabase/migrations/20261120340000_whatsapp_attendance_module.sql`; `apps/sistema/src/app/sistema/whatsapp/actions.ts`, `page.tsx`; `apps/sistema/src/features/whatsapp/whatsappTypes.ts`, `WhatsappCaseBoard.tsx`; `apps/sistema/test/whatsapp-attendance-module.test.ts`; `apps/sistema/src/lib/navigation.ts`, `staffPermissionsCatalog.ts`, `components/admin/AdminHeader.tsx`, `components/admin/MobileNav.tsx`, `app/globals.css` (modificados, aditivos).
ARQUIVOS REMOVIDOS (nunca chegaram a ser commitados): `apps/sistema/src/lib/whatsapp/attendanceProvider.ts`, `incomingMessageParser.ts`; `apps/sistema/src/app/api/integrations/whatsapp-atendimento/` (pasta inteira); `apps/sistema/src/features/whatsapp/WhatsappInbox.tsx`; a versão anterior do teste e da migration (mesmo nome de arquivo da migration, conteúdo totalmente reescrito).

FALTA/BLOQUEIOS: nenhuma migration aplicada, nenhum deploy, nenhum commit/push — tudo local, aguardando confirmação final do usuário antes de subir a branch.

## 04/11/2026 — LIMPEZA APÓS AUDITORIA DE DEPLOY, SELEÇÃO ISOLADA

- Portal: sem diff funcional entre o deployment ligado ao domínio e o build mais novo, somente documentação; não republicar.
- IR Controle: revisão por hash encontrou apenas a preservação dos campos legados de consentimento ao vincular aniversariante a cliente, além de código WhatsApp não aprovado e prévia pura de integração Altnix (não operacional).
- Aniversariantes: as migrations `20261120290000` e `20261120330000` constam aplicadas no Supabase; a CHECK `birthday_entries_publish_requires_consent` não existe mais no banco. NÃO reaplicar migrations, mexer em dados nem alterar esse schema sem necessidade.
- Publicação isolada preparada em `release/aniversariantes-isolado-20261104`, baseada no commit publicado `65675aa035555d4f3b99509ade9699664de4a140`, com apenas actions.ts de Aniversariantes, teste e migration já aplicada. Build/deploy/alias ainda requerem validação e registro específico.
- O código experimental de WhatsApp foi removido da branch de desenvolvimento; sem migration aplicada e sem publicação. Assunto pendente, trazer no próximo levantamento de tarefas.
- A estrutura de correspondência com Altnix Informativo permanece em desenvolvimento e **não** deve ser promovida como integração real, nem ser descartada.

## 04/11/2026 — RESULTADO FINAL DA PUBLICAÇÃO CONTROLADA

- **Portal** `jornalir.vercel.app`: nenhum arquivo funcional novo para promover; alias mantido no deployment `dpl_CC46f5W12kysqex65B5mXuKT4a2L`.
- **IR Controle** `controle.altnix.com.br`: atualização **PUBLICADA E CONFIRMADA** no deployment `dpl_DVvqeVMxy5uWbGKHjxs6oZymrW3y`, com commit isolado `f17b7c4569a8ccff0cf47440d077503d5ea60f50`, branch `release/aniversariantes-isolado-20261104`. Deploy READY, build e typecheck passaram; alias confirmado por consulta da Vercel. Nenhum erro de runtime encontrado no intervalo consultado de 30 min (isso não substitui homologação funcional autenticada).
- Comparação Git exata do commit de produção anterior `65675aa...` com `f17b7c...`: **somente 3 arquivos** (actions.ts de Aniversariantes, teste estrutural e migration de simplificação já presente no banco). Nenhuma escrita SQL feita nesta publicação; não reaplicar a migration.
- Branch de trabalho limpa no commit `cc0ede24...`, removendo todo o código experimental WhatsApp não publicado e suas alterações de navegação/permissões. Código de integração Altnix Informativo e testes de Aniversariantes preservados no desenvolvimento, mas NÃO promovidos.
- **WhatsApp fica PENDENTE DE DECISÃO:** quando o usuário pedir tarefas faltantes, incluir a definição da solução de atendimento para sete pessoas no mesmo número, idealmente coexistente com o WhatsApp Business no celular, sem começar nova implementação nem infraestrutura sem autorização.
- Confirmações posteriores necessárias somente para fluxo funcional autenticado: vinculação de aniversariante a cadastro mestre com preservação do histórico, e eventual checagem manual no módulo. Não alterar registros reais para testar sem dados de homologação.
