# Webhook de confirmação de entrega (Resend) — PR mínima e plano de publicação (13–14/11/2026)

Branch: `fix/nfse-resend-webhook-minimo-20261113`, derivada de `solicitacoes-financeiro-contratos-irc-20261031` no commit `0123a3d8`, o código publicado em `controle.altnix.com.br` (deployment `dpl_Gnw8sLv8SXd695hNkPVX8ndJw4up`). **Não contém** as PRs #60/#61, não libera a emissão fiscal e não envia e-mail.

## Conteúdo
- `apps/sistema/src/app/api/webhooks/nfse-email/route.ts` — rota POST fina.
- `apps/sistema/src/lib/nfse/resendWebhookHandler.ts` — regras do webhook (assinatura, estados, duplicados, reclamação única, tabela ausente).
- `apps/sistema/src/lib/nfse/verifyResendWebhook.ts` — verificação Svix (HMAC-SHA256, janela de 5 min, comparação em tempo constante).
- `apps/sistema/test/nfse-resend-webhook.test.ts` — 14 testes (sem rede e sem banco real).
- `supabase/migrations/20261114000402_nfse_delivery_history_tables.sql` — **migration A, JÁ APLICADA** (ver abaixo): tabelas `nfse_document_assets` e `nfse_delivery_attempts`, sem trigger, sem função e sem tocar em `nfse_issued_notes`. O arquivo é só o registro versionado.
- este documento.

## Comportamento
- Exige só `RESEND_WEBHOOK_SECRET` e assinatura válida. Não depende de `NFSE_DELIVERY_ENABLED`, `VERCEL_ENV` nem da liberação da NFS-e (`NFSE_AVAILABLE_IN_THIS_RELEASE` continua `false`).
- Sem segredo → 503. Assinatura ausente/inválida/expirada → 401, sem tocar no banco.
- Só atualiza tentativas existentes (`channel=email`, `provider=resend`, `provider_message_id`) por UPDATE condicional atômico; nunca insere, apaga nem lê documentos.
- Estados só avançam: `accepted→delivered|bounced|failed`; `delivered→bounced`. Duplicado/antigo → 200 sem alteração. Identificador desconhecido → 200 `updated: 0`.
- **Reclamação (`email.complained`)**: marca `bounced` e grava `complained_at` **uma única vez** (`UPDATE … WHERE complained_at IS NULL`). Reenvio do mesmo evento, ou outro idêntico mais novo, não reescreve horário nem resumo; `delivered`/`bounced`/`failed` atrasados não a sobrescrevem. A reclamação não altera `failed_at`.
- Tabela `nfse_delivery_attempts` inexistente → 503 (o Resend repete depois); outro erro de banco → 500. Com a migration A já aplicada, o caminho normal passa a ser 200.
- A rota é pública por desenho (o middleware só cobre `/sistema`, `/agenda`, `/tv`, `/login`); a proteção é a assinatura.

## Migrations: divisão A / B (evita duplicação com a PR #61)
A migration original `20261122340700_nfse_documents_delivery_history.sql` (PR #61) foi dividida:
- **A — `20261114000402_nfse_delivery_history_tables`** (esta PR): tabelas, índices, RLS e grants, mais a coluna `complained_at`. Única necessária ao webhook.
- **B — `20261122340700_nfse_delivery_enqueue_trigger.sql`** (fica na PR #61; **não** está nesta PR; **não aplicada**): schema `nfse_internal`, função e **trigger `AFTER INSERT` em `nfse_issued_notes`** (só notas de produção). Tem trava que aborta se a parte A não existir e `lock_timeout` de 3 s. Aplicar somente quando a emissão for liberada.
- A PR #61 usa o arquivo A **idêntico** ao desta PR (mesmo caminho e conteúdo, sem conflito de merge). O workflow e o teste SQL da #61 (PostgreSQL descartável) aplicam A e depois B apenas em banco de teste.

## Resultado real da aplicação da migration A (verificado pelo proprietário, direto no Supabase oficial)
- Aplicada pela integração oficial do Supabase; **ledger: `20261114000402`, nome `nfse_delivery_history_tables`**. O SQL no repositório foi renomeado para essa versão; **não registrar nem aplicar de novo**.
- Tabelas `nfse_document_assets` e `nfse_delivery_attempts` criadas e **vazias**.
- RLS e permissões verificados; índice do identificador Resend (`nfse_delivery_provider_unique`) criado.
- **Trigger de emissão NÃO instalado**; nenhuma NFS-e emitida.
- Ordem do ledger: as migrations `20261122340400`–`340600` (PR #60) seguem não aplicadas; a A não depende delas.
- Reversão, **somente com as tabelas vazias** e com autorização: `drop table if exists public.nfse_delivery_attempts; drop table if exists public.nfse_document_assets;`. Havendo dados, não apagar; corrigir por migration compensatória.

## Dependências restantes para publicar
1. Código desta branch no deployment de produção (base oficial + os arquivos acima). **Depende do merge da PR #62 e de deploy manual, ainda não autorizados.**
2. `RESEND_WEBHOOK_SECRET` (segredo `whsec_…` do webhook criado no Resend) em Production na Vercel.

## Configuração do segredo e ativação (sequência)
1. ✅ Migration A aplicada e validada (ver acima).
2. (autorizar) Merge da PR #62 e publicação do código **sem** a variável; conferir que POST sem assinatura responde 503.
3. No painel do Resend → Webhooks → criar endpoint `https://controle.altnix.com.br/api/webhooks/nfse-email` com somente `email.delivered`, `email.bounced`, `email.failed`, `email.complained`; copiar o *Signing Secret* (`whsec_…`) sem colar em chat, commit ou log.
4. Gravar o segredo em `apps/sistema/.env.local` (local) e em Vercel → Settings → Environment Variables → `RESEND_WEBHOOK_SECRET`, escopo **somente Production**, marcado como sensível.
5. Variáveis só valem para deployments novos: gerar novo deployment de produção (staging + smoke + promote) com o mesmo código.
6. Verificar: POST sem assinatura → 401; reenvio de um evento real (painel do Resend → Replay) → 200 `updated: 0` (agora sem 503, pois a tabela existe).
7. Não definir `NFSE_DELIVERY_ENABLED`, `CRON_SECRET` nem agendar cron nesta etapa.

## Riscos e reversão do webhook
- Segredo errado → todos os eventos 401 (nenhum dano; Resend repete). Corrigir a variável e reimplantar.
- Rota exposta sem segredo configurado → 503, nunca aceita.
- Reversão: excluir o webhook no Resend e/ou remover `RESEND_WEBHOOK_SECRET`; ou `vercel promote` do deployment anterior. O código só responde a eventos; não tem efeito colateral fiscal.
