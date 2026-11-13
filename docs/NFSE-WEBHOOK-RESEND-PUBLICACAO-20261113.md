# Webhook de confirmação de entrega (Resend) — PR mínima e plano de publicação (13/11/2026)

Branch: `fix/nfse-resend-webhook-minimo-20261113`, derivada de `solicitacoes-financeiro-contratos-irc-20261031` no commit `0123a3d8`, o código publicado em `controle.altnix.com.br` (deployment `dpl_Gnw8sLv8SXd695hNkPVX8ndJw4up`). **Não contém** as PRs #60/#61, não libera a emissão fiscal e não envia e-mail.

## Conteúdo
- `apps/sistema/src/app/api/webhooks/nfse-email/route.ts` — rota POST fina.
- `apps/sistema/src/lib/nfse/resendWebhookHandler.ts` — regras do webhook (assinatura, estados, duplicados, reclamação única, tabela ausente).
- `apps/sistema/src/lib/nfse/verifyResendWebhook.ts` — verificação Svix (HMAC-SHA256, janela de 5 min, comparação em tempo constante).
- `apps/sistema/test/nfse-resend-webhook.test.ts` — 14 testes (sem rede e sem banco real).
- `supabase/migrations/20261122340650_nfse_delivery_history_tables.sql` — **migration A**: tabelas `nfse_document_assets` e `nfse_delivery_attempts` (sem trigger, sem função, sem tocar em `nfse_issued_notes`). **Não aplicada.**
- este documento.

## Comportamento
- Exige só `RESEND_WEBHOOK_SECRET` e assinatura válida. Não depende de `NFSE_DELIVERY_ENABLED`, `VERCEL_ENV` nem da liberação da NFS-e (`NFSE_AVAILABLE_IN_THIS_RELEASE` continua `false`).
- Sem segredo → 503. Assinatura ausente/inválida/expirada → 401, sem tocar no banco.
- Só atualiza tentativas existentes (`channel=email`, `provider=resend`, `provider_message_id`) por UPDATE condicional atômico; nunca insere, apaga nem lê documentos.
- Estados só avançam: `accepted→delivered|bounced|failed`; `delivered→bounced`. Duplicado/antigo → 200 sem alteração. Identificador desconhecido → 200 `updated: 0`.
- **Reclamação (`email.complained`)**: marca `bounced` e grava `complained_at` **uma única vez** (`UPDATE … WHERE complained_at IS NULL`). Reenvio do mesmo evento, ou outro idêntico mais novo, não reescreve horário nem resumo; `delivered`/`bounced`/`failed` atrasados não a sobrescrevem. A reclamação não altera `failed_at`.
- Tabela `nfse_delivery_attempts` inexistente (migration A pendente) → 503 (o Resend repete depois); outro erro de banco → 500.
- A rota é pública por desenho (o middleware só cobre `/sistema`, `/agenda`, `/tv`, `/login`); a proteção é a assinatura.

## Migrations: divisão A / B (evita duplicação com a PR #61)
A migration original `20261122340700_nfse_documents_delivery_history.sql` (PR #61) foi dividida, sem alterar o SQL além do indicado:
- **A — `20261122340650_nfse_delivery_history_tables.sql`** (esta PR): tabelas, índices, RLS e grants. Acrescenta a coluna `complained_at timestamptz` e `set local lock_timeout = '3s'`. Única necessária ao webhook.
- **B — `20261122340700_nfse_delivery_enqueue_trigger.sql`** (fica na PR #61; **não** está nesta PR): schema `nfse_internal`, função e **trigger `AFTER INSERT` em `nfse_issued_notes`** (só notas de produção). Tem trava que aborta se a parte A não existir e `lock_timeout` de 3 s. Aplicar somente quando a emissão for liberada.
- A PR #61 recebe o arquivo A **idêntico** ao desta PR (mesmo caminho e conteúdo, então o merge não conflita nem duplica), o arquivo B no lugar do `340700` antigo, e o workflow e o teste SQL (`nfse-delivery-queue-test.sql`) passam a aplicar A e depois B. Essas mudanças estão só no repositório local; a PR #61 no GitHub não foi alterada.

## Dependências para publicar
1. Código desta branch no deployment de produção (base oficial + os arquivos acima).
2. Migration A aplicada no Supabase oficial. Sem ela a rota responde 503 e nenhum evento é gravado.
3. `RESEND_WEBHOOK_SECRET` (segredo `whsec_…` do webhook criado no Resend) em Production na Vercel.

## Plano de aplicação da migration A (sem executar; cada passo exige autorização)
A migration só **cria** objetos novos (duas tabelas, índices, RLS e grants). Não altera dados nem tabelas existentes e não cria função nem trigger.
1. Pré-checagem (somente leitura): versão ausente no ledger; as duas tabelas ausentes; `nfse_issued_notes` e `profiles` existentes.
2. Ensaio em transação com `ROLLBACK`: executar o arquivo, conferir tabelas, índices, RLS ativo, `anon`/`authenticated` sem privilégios, `service_role` com select/insert(/update), coluna `complained_at`; reverter.
3. Aplicar o SQL exato do arquivo. Os `FOREIGN KEY` tomam um lock muito curto em `nfse_issued_notes` (protegido por `lock_timeout`); não há trigger.
4. Registrar a versão real do ledger e renomear o arquivo SQL (nesta PR e na #61) para ela (aprendizado da Agenda: nunca reaplicar pelo nome antigo).
5. Pós-checagem: tabelas existem com 0 linhas; POST sem assinatura continua 401; evento assinado de id desconhecido → 200 `updated: 0`.
- Ordem no ledger: as migrations `20261122340400`–`340600` (PR #60) não estão aplicadas; a A não depende delas, mas o ledger ficará fora de ordem. Aplicar por SQL/MCP, não por `supabase db push` sem `--include-all`.

## Reversão da migration A (enquanto as tabelas estiverem vazias)
```sql
drop table if exists public.nfse_delivery_attempts;
drop table if exists public.nfse_document_assets;
```
Conferir antes que as tabelas têm 0 linhas. Se já houver dados, não apagar; corrigir com migration compensatória. (A reversão da parte B, quando existir, está no cabeçalho do próprio arquivo.)

## Configuração do segredo e ativação (sequência)
1. (autorizado) Migration A aplicada e validada.
2. (autorizado) Publicar o código **sem** a variável; conferir que POST sem assinatura responde 503.
3. No painel do Resend → Webhooks → criar endpoint `https://controle.altnix.com.br/api/webhooks/nfse-email` com somente `email.delivered`, `email.bounced`, `email.failed`, `email.complained`; copiar o *Signing Secret* (`whsec_…`) sem colar em chat, commit ou log.
4. Gravar o segredo em `apps/sistema/.env.local` (local) e em Vercel → Settings → Environment Variables → `RESEND_WEBHOOK_SECRET`, escopo **somente Production**, marcado como sensível.
5. Variáveis só valem para deployments novos: gerar novo deployment de produção (staging + smoke + promote) com o mesmo código.
6. Verificar: POST sem assinatura → 401; reenvio de um evento real (painel do Resend → Replay) → 200 `updated: 0`.
7. Não definir `NFSE_DELIVERY_ENABLED`, `CRON_SECRET` nem agendar cron nesta etapa.

## Riscos e reversão do webhook
- Segredo errado → todos os eventos 401 (nenhum dano; Resend repete). Corrigir a variável e reimplantar.
- Rota exposta sem segredo configurado → 503, nunca aceita.
- Reversão: excluir o webhook no Resend e/ou remover `RESEND_WEBHOOK_SECRET`; ou `vercel promote` do deployment anterior. O código só responde a eventos; não tem efeito colateral fiscal.
