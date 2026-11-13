# Webhook de confirmação de entrega (Resend) — PR mínima e plano de publicação (13/11/2026)

Branch: `fix/nfse-resend-webhook-minimo-20261113`, derivada de `solicitacoes-financeiro-contratos-irc-20261031` no commit `0123a3d8`, o código publicado em `controle.altnix.com.br` (deployment `dpl_Gnw8sLv8SXd695hNkPVX8ndJw4up`). **Não contém** as PRs #60/#61, não libera a emissão fiscal e não envia e-mail.

## Conteúdo
- `apps/sistema/src/app/api/webhooks/nfse-email/route.ts` — rota POST fina.
- `apps/sistema/src/lib/nfse/resendWebhookHandler.ts` — regras do webhook (assinatura, estados, duplicados, tabela ausente).
- `apps/sistema/src/lib/nfse/verifyResendWebhook.ts` — verificação Svix (HMAC-SHA256, janela de 5 min, comparação em tempo constante).
- `apps/sistema/test/nfse-resend-webhook.test.ts` — 11 testes (sem rede e sem banco real).

## Comportamento
- Exige só `RESEND_WEBHOOK_SECRET` e assinatura válida. Não depende de `NFSE_DELIVERY_ENABLED`, `VERCEL_ENV` nem da liberação da NFS-e (`NFSE_AVAILABLE_IN_THIS_RELEASE` continua `false`).
- Sem segredo → 503. Assinatura ausente/inválida/expirada → 401, sem tocar no banco.
- Só atualiza tentativas existentes (`channel=email`, `provider=resend`, `provider_message_id`) por UPDATE condicional atômico; nunca insere, apaga nem lê documentos.
- Estados só avançam: `accepted→delivered|bounced|failed`, `delivered→bounced`; `complained` marca `bounced` com resumo próprio. Duplicado/antigo → 200 sem alteração. Identificador desconhecido → 200 `updated: 0`.
- Tabela `nfse_delivery_attempts` inexistente (migration pendente) → 503 (o Resend repete depois); outro erro de banco → 500.
- A rota é pública por desenho (o middleware só cobre `/sistema`, `/agenda`, `/tv`, `/login`); a proteção é a assinatura.

## Dependências para publicar
1. Código desta branch no deployment de produção (base oficial + 4 arquivos).
2. Migration `20261122340700_nfse_documents_delivery_history.sql` (está na PR #61, **não** incluída aqui). Sem ela a rota responde 503 e nenhum evento é gravado.
3. `RESEND_WEBHOOK_SECRET` (segredo `whsec_…` do webhook criado no Resend) em Production na Vercel.

## Plano de aplicação da migration (sem executar; cada passo exige autorização)
A migration só **cria** objetos novos (`nfse_internal`, `nfse_document_assets`, `nfse_delivery_attempts`, índices, função e trigger). Não altera dados nem tabelas existentes.
1. Pré-checagem (somente leitura): versão `20261122340700` ausente no ledger; as duas tabelas ausentes; `nfse_issued_notes` com `id`, `client_id`, `environment`; schema `nfse_internal` inexistente; triggers atuais de `nfse_issued_notes` (esperado: `nfse_issued_notes_set_actor`); contagem de notas.
2. Ensaio em transação com `ROLLBACK`: executar o arquivo, conferir tabelas, índices, RLS ativo, `anon`/`authenticated` sem privilégios, `service_role` com select/insert(/update), função sem EXECUTE para público e trigger presente; reverter.
3. Aplicar o SQL exato do arquivo, na janela de menor uso (o `CREATE TRIGGER` toma um lock curto em `nfse_issued_notes`, tabela pequena e sem emissão ativa).
4. Registrar a versão real do ledger e renomear o arquivo SQL no GitHub para ela (aprendizado da Agenda: nunca reaplicar pelo nome antigo).
5. Pós-checagem: tabelas existem com 0 linhas; trigger ativo; POST sem assinatura continua 401; evento assinado de id desconhecido → 200 `updated: 0`.
- Impacto: nenhuma emissão existe e a NFS-e está bloqueada em código; o trigger só age em `INSERT` de nota de **produção** e nunca desfaz a nota (em erro apenas emite WARNING). Cada INSERT passa a custar um SELECT e um INSERT pequenos.
- Observação de ordem: as migrations `20261122340400`–`340600` (PR #60) não estão aplicadas. Aplicar a 340700 antes delas não gera dependência, mas o ledger ficará fora de ordem; aplicar pelo SQL/MCP, não por `supabase db push` sem `--include-all`.

## Reversão da migration (enquanto as tabelas estiverem vazias)
```sql
drop trigger if exists nfse_queue_delivery_on_authorization on public.nfse_issued_notes;
drop function if exists nfse_internal.enqueue_automatic_note_delivery();
drop table if exists public.nfse_delivery_attempts;
drop table if exists public.nfse_document_assets;
drop schema if exists nfse_internal;
```
Conferir antes que as tabelas têm 0 linhas. Se já houver dados, não apagar: `alter table public.nfse_issued_notes disable trigger nfse_queue_delivery_on_authorization;` e corrigir com migration compensatória.

## Configuração do segredo e ativação (sequência)
1. (autorizado) Migration aplicada e validada.
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
