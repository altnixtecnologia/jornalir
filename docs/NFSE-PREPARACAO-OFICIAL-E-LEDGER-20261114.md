# NFS-e: preparação administrativa no sistema oficial (14/11/2026)

## Escopo autorizado

O módulo funciona dentro do projeto **Jornal IR** existente (Supabase
`iqnzrpdccecgalqboeyf`, Vercel `jornalir-sistema`). Não criar novo projeto.
As tabelas fiscais foram instaladas no Supabase oficial; não existem notas
autorizadas ou tentativas de entrega no início desta fase.

**Preparação liberada apenas para owner/admin ativo:**
- visão geral do módulo, cadastros fiscais do prestador, certificado A1
  (por formulário seguro), perfis de serviço;
- cadastro e edição de rascunhos, com cliente do cadastro mestre existente,
  snapshot do tomador e validações de entrada;
- visualização das listas (a lista de notas autorizadas permanece vazia).
Operadores não são incluídos nas permissões de preparação.

**Não liberado:**
- transmissão DPS ou consulta/cancelamento na SEFIN;
- emissão nacional real ou simulada dentro da produção;
- envio automático/manual de XML/PDF, arquivamento R2 fiscal e cron;
- DANFSe definitivo ou uso de notas fictícias como autorizadas.
`NFSE_AVAILABLE_IN_THIS_RELEASE=false`,
`DANFSE_OFFICIAL_LAYOUT_APPROVED=false`.
`NFSE_DELIVERY_ENABLED` e `NFSE_ARCHIVE_ENABLED` sem habilitação.
O provider oficial continua bloqueado.

**Dado de teste:** usar um cadastro previamente autorizado pelo operador e
indicar nos campos internos que o rascunho é de teste, mas sem criar uma
NFS-e fictícia em `nfse_issued_notes`, enviar e-mails ou fazer testes com
dados de clientes que não autorizaram. O rascunho é um registro **real do
banco** e deverá ser revisado/eliminado pelo responsável antes de liberar
a emissão. Não inserir CNPJ, alíquota, códigos fiscais ou dados inventados
como definitivos.

## Atenção: migrations já aplicadas no banco oficial

O conector registrou versions por data/hora, diferentes dos nomes dos
arquivos versionados originalmente no GitHub. Não executar um
`supabase db push` automático, pois o CLI pode achar que há novas
migrations por causa dos prefixos divergentes.

| Arquivo de código no GitHub | Versão aplicada no ledger do Supabase |
| --- | --- |
| `20261114000402_nfse_delivery_history_tables.sql` | `20261114000402` |
| `20261122340400_nfse_certificate_atomic_rotation.sql` | `20261114195153` |
| `20261122340500_nfse_draft_fiscal_edit_guard.sql` | `20261114195159` |
| `20261122340600_nfse_cancellation_uncertain_uniqueness.sql` | `20261114195206` |
| `20261122340700_nfse_delivery_enqueue_trigger.sql` | `20261114195227` |
| `20261122340800_nfse_document_permissions.sql` | `20261114195233` |
| `20261122340900_nfse_archive_retry_claim.sql` | `20261114195240` |
| `20261114200547_nfse_trigger_rpc_execute_lockdown.sql` | `20261114200547` |

### Procedimento futuro para sincronizar com Claude/CLI

1. Fazer `git fetch` e preservar a worktree original, alterações locais e
   stashes; não forçar reset/rebase nem limpar arquivos não rastreados.
2. Conferir o inventário de migrations no Supabase e a diferença local
   (`supabase migration list --linked`, somente leitura) com atenção aos
   nomes divergentes. **Não rodar `supabase db push` nessa etapa.**
3. Determinar a estratégia de reconciliação: manter migrations antigas
   como histórico e documentar o ledger ou alinhar os arquivos com o ledger
   em alteração revisada de GitHub + testes de CI. Os arquivos são citados
   nominalmente por testes SQL/GitHub Actions; renomear exige atualizar
   todos os caminhos. Nenhuma alteração direta em `schema_migrations`
   sem uma revisão formal de integridade e backup.
4. Reexecutar TypeScript, testes Node e PostgreSQL descartável; preservar
   backups e logs sem segredos. Só então atualizar a worktree original.

A reconciliação **não** requer criar outro Supabase nem refazer a aplicação
das funções que já estão no banco.

## Roteiro de teste visual no projeto oficial

1. Entrar no `https://controle.altnix.com.br/sistema/nfse` usando uma
   conta owner/admin ativa e confirmada.
2. Conferir o cabeçalho de **preparação**, não de emissão.
3. Abrir Configurações e Perfis de serviço, sem conectar certificado ainda.
4. Criar um rascunho com um cadastro de teste autorizado, conferir tomador,
   descrição, datas, valor e snapshot do cliente e testar edição.
5. Conferir que **Emitir NFS-e** permaneça bloqueado, mesmo como owner;
   observar que notas emitidas e histórico de envios seguem vazios.
6. Testar acesso de usuário sem perfil admin (redirecionamento ou negativa),
   especialmente ação server-side de criação, não apenas o menu.
7. Validar versão mobile, permissões, funcionamento do restante do sistema.
8. Não enviar DPS, XML, PDF ou e-mail real.

O teste da interface autenticada depende da sessão do usuário; a CI cobre
as travas e o build, mas não substitui inspeção no navegador autenticado.
