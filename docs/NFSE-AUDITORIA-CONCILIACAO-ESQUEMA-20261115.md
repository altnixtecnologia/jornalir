# NFS-e — conciliação de esquema e publicação controlada
Data da leitura: 15/11/2026 (Supabase oficial `site-system-ir`); consulta exclusivamente de leitura.

## Resultado que bloqueia o uso do código mais recente

A PR #89 passou a selecionar três campos obrigatórios mesmo com listas vazias, mas nenhum deles constava em `information_schema.columns` do banco oficial consultado:

| Tabela | Coluna requerida |
|---|---|
| `public.nfse_issuer_configs` | `default_fiscal_observation` |
| `public.nfse_drafts` | `fiscal_observation` |
| `public.nfse_drafts` | `purchase_order_number` |

A migration aditiva `20261122341000_nfse_fiscal_observations.sql` está no GitHub, mas não constava no ledger aplicado. Sem ela, um deploy do código recente poderia quebrar páginas e Server Actions. A PR #98 implementa um preflight de consulta (SELECT LIMIT 0) que **bloqueia a preparação com aviso** em vez de ignorar silenciosamente os campos.

## Histórico de versões: não aplicar migrations anteriores novamente

O ledger remoto continha versões já executadas **com numeração diferente** dos arquivos originais do GitHub. O nome/sentido da migration remota corresponde, mas **não foi feita comparação byte a byte**. É obrigatório conferir definição efetiva (função/índice/trigger) e histórico antes de alterar o banco.

| Arquivo no GitHub | Registro encontrado no ledger remoto | Assunto |
|---|---|---|
| `20261122340400_nfse_certificate_atomic_rotation.sql` | `20261114195153_nfse_certificate_atomic_rotation` | Troca A1 atômica |
| `20261122340500_nfse_draft_fiscal_edit_guard.sql` | `20261114195159_nfse_draft_fiscal_edit_guard` | Bloqueio de edição após claim |
| `20261122340600_nfse_cancellation_uncertain_uniqueness.sql` | `20261114195206_nfse_cancellation_uncertain_uniqueness` | Impede cancelamento concorrente/incerto |
| `20261122340700_nfse_delivery_enqueue_trigger.sql` | `20261114195227_nfse_delivery_enqueue_trigger` | Fila e-mail após emissão em produção |
| `20261122340800_nfse_document_permissions.sql` | `20261114195233_nfse_document_permissions` | Permissões de documentos |
| `20261122340900_nfse_archive_retry_claim.sql` | `20261114195240_nfse_archive_retry_claim` | Claim e backoff R2 |
| `20261122341000_nfse_fiscal_observations.sql` | **Não encontrado** | Observações fiscais/pedido |

Também existe o hardening remoto `20261114200547_nfse_trigger_rpc_execute_lockdown`: preservar permissões reais ao programar migrations futuras.

Foram observados no banco: índices de cancelamento incluindo `uncertain`; trigger `nfse_draft_fiscal_edit_guard`; trigger de enfileiramento em `nfse_issued_notes`; funções RPC sensíveis sem EXECUTE público; RLS habilitado nas tabelas NFS-e.

## Estado operacional verificado

- Banco oficial `site-system-ir` ativo; contagem de registros das 11 tabelas NFS-e verificadas: **0 em todas** no instante da consulta. Isso não equivale a um teste de inserção/edição.
- Último deployment de produção encontrado para `jornalir-sistema`: commit `c18200925fb5650a8fe169d06e41b89392133f79` (preparação PR #66), diferente do código avançado GitHub. Não houve deploy na PR #98.
- Travas: `NFSE_AVAILABLE_IN_THIS_RELEASE=false` e `DANFSE_OFFICIAL_LAYOUT_APPROVED=false`.
- DPS/XML/assinatura/mTLS/clientes HTTP e DANFSe possuem testes sintéticos, **sem confirmação de emissão real com SEFIN**.
- Arquivos originais Arial e Microsoft Sans Serif não foram fornecidos/licenciados para execução no servidor; a prévia fallback não pode ser aprovada como DANFSe fiscal.

## Plano seguro de conciliação antes de usar o código novo

1. Obter snapshot/backups e confirmar a sequência real das migrations existentes, incluindo as que foram aplicadas sob outros números.
2. No ambiente de testes controlado, validar a migration **já existente** `20261122341000_nfse_fiscal_observations.sql` contra cópia mínima do esquema atual, sem replicar dados pessoais reais.
3. Provar colunas, constraints `nfse_issuer_observation_2000`, `nfse_draft_observation_2000`, `nfse_draft_order_60` e trigger `nfse_draft_additional_info_guard`.
4. Validar as permissões reais de owner/admin, RLS e fluxos criar/salvar/editar/abrir rascunhos; confirmar que campos de nota interna não são exportados no XML.
5. Só então programar aplicação controlada no banco oficial, com backup, janela de mudança e autorização específica. Verificar novamente que o preflight retorna pronto.
6. Somente depois escolher o commit de deploy Vercel; não usar deploy para testar migrações pendentes.
7. Emissão SEFIN Produção Restrita requer configuração independente, A1 e autorização expressa. Emissão nacional real continua bloqueada até homologação.

**Esta PR não aplica migrations, não cria projetos Supabase, não altera dados, não consulta a SEFIN e não publica Vercel.**
