# Jornal IR — Status atual e passagem de contexto (HANDOFF)

> **Registro em 17/10/2026, a partir dos relatórios fornecidos pelo usuário do Claude Code local.** Não representa verificação independente dos arquivos locais por ChatGPT. Atualizar após cada lote; nunca tratar este snapshot como estado definitivo.

## Onde desenvolver

- Repositório `altnixtecnologia/jornalir`, monorepo (`apps/site`, `apps/sistema`, `packages`, `supabase`).
- Pasta **oficial**: `C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\Site-sistema`.
- Branch local oficial: `consolidacao-local-20261016`.
- Último HEAD **confirmado em 17/10/2026 (verificação direta, não só relato)**: `7ee1ee2` (preparação de `vercel.json` para desativar deploy automático).
- Sequência completa de commits locais confirmados: `ba3955f` (cliente/contratos) → `f8a3783` (certificado NFS-e) → `36e3276` (parametrização municipal) → `1c32734` (404/loading público) → `c4c02d5` (lote 2) → `61c944d` (lote 3) → `31798c8` (instalação da memória permanente de governança) → `7ee1ee2` (vercel.json).
- **Confirmado por `git fetch origin` (17/10/2026, leitura apenas — sem pull/merge/rebase):** `consolidacao-local-20261016` está **7 commits à frente de `origin/consolidacao-local-20261016`, em fast-forward limpo, sem divergência** (o remoto é ancestral direto do local). `origin/release/contratos-nfse-integracao-20261016` e `origin/frontend-integracao-20261008` (branch padrão do repo) já estão totalmente contidos no local. **Ainda não sincronizado com o GitHub** — ver seção "Sincronização com GitHub" abaixo antes de fazer push.
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
