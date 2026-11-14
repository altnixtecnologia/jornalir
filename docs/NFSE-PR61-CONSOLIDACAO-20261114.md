# PR #61 (NFS-e: entrega por e-mail, WhatsApp e R2) — consolidação técnica (14/11/2026)

Branch local de integração: `feature/nfse-entrega-consolidada-20261114` (worktree `C:/JornalIR-worktrees/nfse-61-consolidado`), construída sobre a `feature/nfse-entrega-email-whatsapp-r2-20261113` (PR #61). **Nada foi enviado ao GitHub; nenhuma migration aplicada; nenhum deploy; nenhuma NFS-e emitida; nenhum e-mail enviado.**

## 1. O que já estava concluído (herdado da #61 e da #62)
- Arquivamento do XML da NFS-e, da DPS assinada e do DANFSe no R2 privado, com SHA-256, sem sobrescrever e com conferência de integridade (`archiveNfseDocuments`).
- Fila de entrega por e-mail com idempotência por tentativa (`Idempotency-Key`), estados `queued/processing/accepted/uncertain/failed/missing_recipient`, destinatário fiscal com alternativa no e-mail principal (snapshot por tentativa), timeouts tratados como incertos e sem repetição automática.
- Histórico de tentativas na consulta da nota; reenvio manual; compartilhamento por WhatsApp sem declarar entrega (`opened` / `operator_confirmed`).
- Webhook de confirmação do Resend (PR #62, **em produção**): assinatura Svix, estados que só avançam, `complained_at` único, 503 sem tabela. Migration A (`20261114000402_nfse_delivery_history_tables`) **aplicada** no Supabase oficial.

## 2. O que precisou ser corrigido
1. **Webhook antigo na #61**: a rota remota ainda era a versão anterior à #62. A base oficial (`468b717a`) foi mesclada na linha da #61; a rota, o handler, o verificador, o teste e a migration A ficaram **idênticos à produção** (uma só implementação; sem restaurar a versão antiga).
2. **Migrations**: o arquivo único `340700` foi dividido. A (`20261114000402`, já aplicada) existe uma só vez; **B** (`20261122340700_nfse_delivery_enqueue_trigger.sql`, trigger de enfileiramento) continua **separada, não aplicada e desativada**, com trava que aborta se a A não existir. O workflow e o teste SQL da #61 (PostgreSQL descartável) aplicam A e depois B só no banco de teste.
3. **`window.confirm` no painel de entrega** (quebrava o teste da base): trocado por `confirmDialog()`.
4. **Permissões**: tudo usava `notas_cancelar`. Agora: `documentos_consultar` (histórico, XML, DANFSe), `documentos_enviar` (reenvio por e-mail e compartilhamento por WhatsApp) e `notas_cancelar` (somente cancelamento). As duas novas são "somente administração". A **migration C** (`20261122340800_nfse_document_permissions.sql`, **não aplicada**) só amplia a CHECK `staff_module_actions_known_pair`; não concede permissão a ninguém. Até ser aplicada, owner/admin já passam (a função SQL os libera) e nenhum operador pode recebê-las.
5. **Arquivamento independente do e-mail**: antes só ocorria dentro do worker de e-mail. Agora `archivePendingNfseNotes` arquiva as notas de produção autorizadas sem os 3 documentos (idempotente, falha de uma nota não interrompe as outras), e o cron arquiva **antes** de tentar o e-mail. `isNfseArchiveEnabled` exige só liberação fiscal, produção, `NFSE_DELIVERY_ENABLED` e R2; o e-mail continua exigindo e-mail + R2. Falha de e-mail nunca impede o arquivamento.
6. **Webhook antes do worker**: se o evento chega antes de o worker gravar o `provider_message_id`, o handler agora responde 503 (o Resend repete) enquanto houver envio `processing` nos últimos 10 min; duplicado de tentativa existente e identificador de outro sistema continuam 200. Antes essa confirmação se perdia em silêncio (200 `updated: 0`).

## 3. Situação das PRs #60 e #61
- **#60** (`fix/nfse-cancelamento-consulta-prehomologacao-20261112`, `b837c0fd`): **inalterada.** A base oficial só tem a mais os 4 commits da #62 (6 arquivos), então a #60 não precisou mudar.
- **#61** remota (`13f0a7a4`): **inalterada.** A branch local consolidada tem a remota como ancestral: enviar seria *fast-forward*, sem force push. Ela traz 12 commits novos sobre a remota, entre eles a mesclagem da oficial.
- O diff da #61 contra a #60 incluirá, até a #60 entrar na oficial, os 6 arquivos da #62 (já em produção); depois disso viram no-op. **Plano antes de qualquer push (decisão do proprietário):**
  1. *(recomendado)* mesclar a oficial na #60 (push fast-forward, sem reescrever histórico) e só então enviar esta branch como atualização da #61; a #61 ficaria limpa, sem arquivos repetidos;
  2. ou enviar esta branch à #61 já, aceitando os 6 arquivos extras temporários no diff.
  Em ambos: sem `reset`, `rebase` ou force push.

## 4. Arquivos modificados nesta etapa
`apps/sistema/src/`: `lib/nfse/archiveNfseDocuments.ts`, `lib/nfse/deliveryWorker.ts`, `lib/nfse/resendWebhookHandler.ts`, `app/api/cron/nfse-delivery/route.ts`, `app/sistema/nfse/notas/[id]/{delivery-actions.ts,xml/route.ts,danfse/route.ts}`, `features/nfse/NfseDeliveryPanel.tsx`, `lib/permissions/staffPermissionsCatalog.ts`.
Testes: `test/nfse-entrega-consolidacao.test.ts` (novo, 20 testes), `test/nfse-resend-webhook.test.ts` (+5), `test/nfse-delivery.test.ts` e `test/nfse-resend-simulated.test.ts` (carregados das alterações locais).
Banco (não aplicados): `supabase/migrations/20261114000402_nfse_delivery_history_tables.sql` (A, já aplicada, só registro), `20261122340700_nfse_delivery_enqueue_trigger.sql` (B), `20261122340800_nfse_document_permissions.sql` (C). CI: `.github/workflows/validate-nfse-delivery-20261113.yml`, `packages/core/test/sql/nfse-delivery-queue-test.sql`.

## 5. Resultados dos testes (14/11/2026)
- TypeScript: sem erros. Suíte completa: **652 de 652** (inclui a paridade catálogo × CHECK do banco e a regra do `window.confirm`). `next build`: compila, com as rotas do webhook, cron, DANFSe e XML.
- Mocks (sem rede e sem banco real): R2 (gravar, ler, SHA, idempotência, corrida entre dois workers, R2 fora do ar, nota sem XML), Resend (envio, idempotência, resultado incerto/rejeitado), worker (envio único com dois workers concorrentes, sem destinatário, homologação ignorada, worker desabilitado), webhook (corrida, duplicados, fora de ordem, `complained` único) e permissões.
- PostgreSQL 18 descartável: teste SQL da #61 (A + B) passou; migration C testada (recusava as chaves novas antes, aceita depois, recusa ações desconhecidas e módulo errado).
- Nenhum e-mail real, nenhuma chamada ao R2 real nesta etapa e nenhuma emissão.

## 6. Pendências para a homologação com certificado A1
1. Decidir o plano de integração das PRs (seção 3) e autorizar o push.
2. Aplicar a migration C (permissões) antes de conceder as novas ações a operadores; revisar quem deve ter `documentos_consultar` e `documentos_enviar`.
3. Aplicar a migration B (trigger) **somente** quando a emissão for liberada; reaplicar a revisão de impacto em `nfse_issued_notes`.
4. Vercel: `RESEND_API_KEY`, `NFSE_EMAIL_FROM`, `R2_NFSE_*`; depois `NFSE_DELIVERY_ENABLED=true` e o agendamento do cron (`CRON_SECRET` já existe). Nada disso foi alterado.
5. Homologação fiscal com A1 em sandbox: emitir uma nota de teste, conferir arquivamento automático, e-mail real a caixa autorizada, webhook confirmando uma tentativa de verdade e o histórico na consulta.
6. Revisão visual do DANFSe contra o leiaute vigente; definir retenção/backup dos XMLs no R2.
7. Limitação conhecida: se uma nota falhar sempre no arquivamento (PDF ou R2), ela é retentada a cada execução e pode ocupar as vagas das mais antigas (limite de 3 por execução); acompanhar o campo `failed` do retorno do cron.
