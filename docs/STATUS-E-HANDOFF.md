# Jornal IR — Status atual e passagem de contexto (HANDOFF)

> **Registro em 17/10/2026, a partir dos relatórios fornecidos pelo usuário do Claude Code local.** Não representa verificação independente dos arquivos locais por ChatGPT. Atualizar após cada lote; nunca tratar este snapshot como estado definitivo.

## Onde desenvolver

- Repositório `altnixtecnologia/jornalir`, monorepo (`apps/site`, `apps/sistema`, `packages`, `supabase`).
- Pasta **oficial**: `C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\Site-sistema`.
- Branch local oficial: `consolidacao-local-20261016`.
- Último HEAD **reportado em 17/10/2026 após lote 3**: `61c944d` (modelos versionados de contratos e geração automática de PDF). O código é local, não presumir no GitHub; confirmar HEAD real antes de agir.
- Outros commits locais reportados na sequência: `ba3955f` (cliente/contratos), `f8a3783` (certificado NFS-e), `36e3276` (parametrização municipal), `1c32734` (404/loading público), `c4c02d5` (lote 2), `61c944d` (lote 3).
- Pastas preservadas **somente referência**: `Site-sistema-ANTIGO-BACKUP`, `Site-sistema-painel`, `jornalir-consolidacao-local`.
- Remoto no GitHub **pode não ter** os últimos commits locais. Não usar `git pull` ou checkout remoto sem inspecionar diferenças.

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
5. Definir estratégia de push/deploy único após validar cota e previews automáticos Vercel (somente sob autorização do usuário).

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
