# NFS-e — migração de observações fiscais aplicada e verificada (16/11/2026)

## Estado efetivo no Supabase oficial

Projeto: `site-system-ir`, região `sa-east-1`, Postgres 17.11, plano organizacional Pro.

A migration **existente** no GitHub `supabase/migrations/20261122341000_nfse_fiscal_observations.sql` foi aplicada ao banco oficial via Supabase Migration API em **16/11/2026 (UTC)**. O Supabase atribuiu a versão **`20261116011525_nfse_fiscal_observations`**, que é diferente do prefixo temporal do arquivo GitHub. **Não executá-la novamente por rotina de sincronização baseada somente no número do arquivo** sem reconciliar a tabela `supabase_migrations.schema_migrations` e verificar o DDL existente. Não renomear/apagar arquivos de migration já referenciados por workflows sem análise de histórico.

A aplicação utilizou o texto original da migration do repositório, sem recriar tabelas e sem refazer versões anteriores. Antes, foi feita simulação do mesmo SQL em transação `BEGIN; ... ROLLBACK;` com limites de tempo e verificação de tabelas fiscais vazias. Dentro do teste surgiram três colunas; após o rollback, confirmou-se que o banco retornou a zero colunas e zero triggers adicionais. A versão permanente foi aplicada em seguida.

### Verificações executadas após aplicar

| Invariante | Evidência |
|---|---|
| `nfse_issuer_configs.default_fiscal_observation` | Presente, `text` opcional |
| `nfse_drafts.fiscal_observation` | Presente, `text` opcional |
| `nfse_drafts.purchase_order_number` | Presente, `text` opcional |
| `nfse_issuer_observation_2000` | CHECK de `btrim(...)` até 2000 caracteres |
| `nfse_draft_observation_2000` | CHECK de `btrim(...)` até 2000 caracteres |
| `nfse_draft_order_60` | CHECK de `btrim(...)` até 60 caracteres |
| `nfse_draft_additional_info_guard` | Trigger de atualização **habilitado** |
| `nfse_issuer_configs` e `nfse_drafts` | RLS habilitado; políticas SELECT/INSERT/UPDATE apenas para `authenticated`, condicionadas às funções de acesso existentes |
| Contagem final de `nfse_issuer_configs`, `nfse_drafts`, `nfse_issued_notes` | 0, 0, 0; nenhuma nota emitida e nenhum cliente inserido pelo procedimento |

**Backup:** a organização está no plano Pro, que oferece backups diários; a integração disponível **não fornece a data/hora do último backup recuperável**, portanto não foi alegada restauração testada nem backup pontual verificado. Essa limitação deve ser avaliada antes de qualquer alteração de dados ou emissão fiscal.

## Compatibilidade com o GitHub

A PR #98 (`fcc958db068a6c2584286d6e07945ff5dbcc7ef7`) acrescentou `checkNfsePreparationSchema`, que faz consultas `SELECT ... LIMIT 0` e bloqueia telas/gravações quando faltarem campos ou houver erro de acesso. Após esta migration, o esquema verificado satisfaz o preflight, mas **não houve teste com sessão real de usuário no navegador** e o código atualizado **ainda não foi publicado na Vercel**.

O arquivo `docs/NFSE-AUDITORIA-CONCILIACAO-ESQUEMA-20261115.md` descreve a situação histórica anterior à aplicação; consultar **este documento** para status posterior. A ordem temporal diversa das versões originais no GitHub e no histórico remoto deve ser considerada antes de qualquer `db push` em lote.

## Próxima etapa (não executada aqui)

1. Testar com conta administrativa real o acesso às configurações, perfis e rascunhos, sem transmitir notas.
2. Validar visualmente o fluxo web e mobile e a persistência de `default_fiscal_observation`, `fiscal_observation` e `purchase_order_number` quando o código novo for publicado de forma controlada.
3. Provisionar legalmente Arial Bold/Microsoft Sans Serif e revalidar o DANFSe nacional.
4. Somente após homologação e autorização separada, configurar A1 e testar SEFIN Produção Restrita; nunca usar produção real como substituto de teste.

**Travas preservadas:** `NFSE_AVAILABLE_IN_THIS_RELEASE=false` e `DANFSE_OFFICIAL_LAYOUT_APPROVED=false`. Não houve emissão, consulta fiscal, uso de certificado A1, e-mail fiscal, upload R2 nem deploy Vercel nesta etapa.
