# NFS-e: arquivamento R2, envio automático e histórico de entrega
Revisão iniciada em 13/11/2026; atualização técnica de 14/11/2026. **Webhook da PR #62 já publicado e validado**, enquanto arquivamento R2 e envio automático permanecem em PR, desativados. Houve um teste real de e-mail com XML/PDF fictícios, sem emissão de nota fiscal.

## Decisão de arquitetura (sem projeto Supabase paralelo)
- Manter o **mesmo Supabase** do Jornal IR, com tabelas separadas `nfse_*` e RLS (somente service_role para os dados de entrega/documentos; leitura por API server-side com confirmação de owner/admin).
- Aproveitar **o cadastro único**: `clients.fiscal_email` quando informado; caso contrário `clients.email`. **Snapshot do destinatário na data de cada tentativa**, sem reescrever histórico após o cadastro mudar. Campo WhatsApp já existe no cadastro.
- Uma **conta Cloudflare** que já abriga mídias e jornais online, mas um **bucket NOVO e PRIVADO** `jornal-ir-nfse`, separado do bucket de edições, com token específico de acesso somente ao bucket fiscal. Não habilitar domínio público, R2.dev, CORS público ou enlaces permanentes.
- XML da NFS-e autorizada e XML da DPS **originais**, DANFSe PDF gerado pelo servidor, cada objeto no R2 com SHA-256; só guardar bucket key/hash/tamanho/tipo no PostgreSQL. Durante transição, XML em `nfse_issued_notes` ainda é fallback para leitura — NUNCA apagar antes de validar backup/integridade.
- A autorização é independente do e-mail: a nota continua autorizada mesmo se R2/SMTP falharem. A migração tem trigger **somente na inclusão de nota de produção**, para enfileirar a entrega sem enviar e-mails no banco. Em homologação NÃO existe enfileiramento automático.
- Worker privado com `CRON_SECRET`, limitado a 3 filas por chamada. **Arquivamento**: release fiscal explícito em código (`NFSE_AVAILABLE_IN_THIS_RELEASE`) + produção + `NFSE_ARCHIVE_ENABLED=true` + R2; **e-mail**: exige tudo isso + `NFSE_DELIVERY_ENABLED=true` + Resend. As duas flags ficam desligadas por padrão e nenhuma foi ativada.
- O envio via Resend usa PDF e XML **anexados**, `Idempotency-Key` por tentativa, com estados `queued/processing/accepted/delivered/bounced/failed/uncertain/missing_recipient`. Confirmar e-mail entregue exige webhook **autenticado Svix**. HTTP 2xx apenas significa que o provedor aceitou.
- Reenvio manual cria uma **nova** linha com destinatário atual, mantendo tentativas anteriores. `queued/processing` não são repetidos; timeout após início de POST é **incerto**, exige confirmação humana antes de outro envio.
- Compartilhamento via WhatsApp: modal abre o seletor de conversa do aplicativo/web, **sem divulgar links R2 privados**. No desktop o operador baixa o PDF e anexa manualmente. Registramos horário de abertura e eventual confirmação manual, mas **não fingimos prova de entrega do WhatsApp**.

## Configurações posteriores obrigatórias (não executar até autorização)
### Cloudflare R2 — mesma conta dos jornais online
1. Entrar no painel Cloudflare com proprietário. Confirmar a conta e a existência do bucket de edições `jornal-ir-edicoes`; **não alterar seu CORS/domínio/chaves**.
2. Criar `jornal-ir-nfse` (R2 Standard, privado, sem domínio público), credenciais R2 exclusivas de leitura e escrita somente nesse bucket e limites de acesso. Conferir custos e políticas de retenção/backup, evitando exclusão automática de XMLs fiscais. Versionamento/imutabilidade podem ser avaliados conforme recursos e retenção legal.
3. Configurar **somente no servidor** da Vercel, nunca em `NEXT_PUBLIC_` ou no GitHub:
   - `R2_NFSE_BUCKET=jornal-ir-nfse`
   - `R2_NFSE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
   - `R2_NFSE_ACCESS_KEY_ID`
   - `R2_NFSE_SECRET_ACCESS_KEY`
4. Verificar upload, leitura privada, HEAD, SHA-256 e falha segura com credencial inválida. Testes sempre com arquivos sintéticos até homologação.

### Serviço de envio — Resend (ou outro com adaptador próprio)
1. Criar/autorizar conta do provedor, validar domínio de envio do Jornal IR, SPF, DKIM, DMARC e endereço remetente.
2. Definir `RESEND_API_KEY` (servidor), `NFSE_EMAIL_FROM` (nome e endereço validado), e testar com uma caixa de equipe. **NÃO usar SMTP do Supabase Auth para anexos fiscais**.
3. Criar webhook para `POST /api/webhooks/nfse-email` no domínio final do sistema, com eventos `email.delivered`, `email.bounced`, `email.complained`, `email.failed`. Guardar `RESEND_WEBHOOK_SECRET` (prefixo `whsec_`) em variável confidencial. Testar assinatura inválida, replay, entrega, devolução.
4. Regras de retries: falha antes do POST pode gerar reenvio manual; depois de timeout, checar idempotência e logs do provedor **antes** de reenviar. Não registrar corpos de e-mails, XML ou tokens nos logs.

### Automação e banco
1. Migrations separadas: A (`20261114000402_nfse_delivery_history_tables.sql`) **JÁ APLICADA**, não reaplicar; B (`20261122340700_nfse_delivery_enqueue_trigger.sql`) trigger de entrega **NÃO APLICADA**; C (`20261122340800_nfse_document_permissions.sql`) ações de permissão **NÃO APLICADA**; D (`20261122340900_nfse_archive_retry_claim.sql`) claim e backoff de arquivamento **NÃO APLICADA**. Na futura ativação, conferir ordem, pré-requisitos, backup e aprovações, sem executar migrations automaticamente.
2. Configurar um agendamento via pg_cron/pg_net ou mecanismo equivalente para `GET /api/cron/nfse-delivery` com header `Authorization: Bearer <CRON_SECRET>`. Frequência inicial proposta: cada 2 a 5 minutos, após homologar recebimento. Não habilitado nesta etapa.
3. Habilitar `NFSE_ARCHIVE_ENABLED=true` apenas após testar a migration D, liberação fiscal e R2; ativar `NFSE_DELIVERY_ENABLED=true` **em etapa separada**, após homologação A1, remetente, fila e autorização. A constante de release fiscal continua **false**.
4. Testar cenário de emissão autorizada, arquivo R2 e e-mail automático, e-mail fiscal/fallback, sem e-mail, erros, duplo clique, reenvio, devolução e consulta no desktop/celular. O DANFSe precisa de revisão visual contra o leiaute vigente, já registrada no projeto.

## Situação do momento
- O cadastro e as rotas de PDF já existem; a PR acrescenta as peças fiscais de entrega e o modal.
- Cloudflare e Resend **não estão conectados ao ChatGPT como plugins**; não criar bucket sem login/acesso do proprietário.
- Sem A1 e sem homologação, NÃO se envia NFS-e, e-mail real ou WhatsApp automaticamente.
- **NÃO** mesclar, publicar, aplicar migrations no Supabase real, agendar cron, habilitar `NFSE_DELIVERY_ENABLED` nem criar bucket nesta conversa sem as configurações e revisão necessárias.

## Verificação local do R2 (12/11/2026)
- Credenciais `R2_NFSE_*` preenchidas em `apps/sistema/.env.local` (ignorado pelo Git). Bucket: `jornal-ir-nfse`.
- Teste real com arquivos fictícios pelo adaptador `nfseDocuments.r2.ts`: gravação de XML e PDF, leitura, SHA-256 idêntico, SHA incorreto rejeitado, acesso anônimo negado, exclusão dos dois objetos e bucket sem resíduos.
- O token é negado (HTTP 403) nos buckets dos jornais/mídia.
- O adaptador não tem função de exclusão; o teste apagou os objetos com o cliente S3 direto.
- Pendentes (dependem do proprietário): variáveis na Vercel, Resend (domínio, remetente, webhook), cron da fila e `CRON_SECRET` (o cron não está agendado em `vercel.json`), migration `20261122340700` no Supabase oficial, permissões de acesso aos documentos (hoje `notas_cancelar`) e homologação com A1.

## Webhook de confirmação de entrega — estado e publicação segura (13/11/2026)
Código local (não publicado): `lib/nfse/resendWebhookHandler.ts` + rota `app/api/webhooks/nfse-email/route.ts`. A rota exige **somente** `RESEND_WEBHOOK_SECRET` e assinatura Svix válida; não depende de `NFSE_DELIVERY_ENABLED` nem da liberação da emissão, não envia e-mail, não emite nota e não devolve documento ou dado fiscal. Só atualiza tentativas de e-mail existentes (`provider=resend`, `provider_message_id`), com UPDATE condicional atômico: `accepted→delivered|bounced|failed`; `delivered→bounced`; `complained` marca `bounced` com resumo próprio. Eventos repetidos ou antigos não alteram nada. Sem a tabela (migration pendente) responde 503 para o Resend repetir depois. Sem segredo responde 503; assinatura inválida, 401.

Sequência proposta (cada passo depende de autorização expressa):
1. ✅ Migration A (`20261114000402`) já aplicada e verificada no Supabase oficial; nada a executar. Resta apenas a publicação do código e a configuração do segredo, nas etapas abaixo.
2. Publicar o código com a variável ausente; a rota deve responder 503 a um POST sem assinatura (nunca 200).
3. Criar o webhook no Resend para `https://controle.altnix.com.br/api/webhooks/nfse-email`, somente com `email.delivered`, `email.bounced`, `email.failed`, `email.complained`; copiar o segredo `whsec_…` sem colar em chat/commit.
4. Cadastrar `RESEND_WEBHOOK_SECRET` só em Production na Vercel (e no `.env.local`); gerar novo deployment e promover.
5. Verificar: POST sem assinatura → 401; evento real reenviado pelo Resend para e-mail sem tentativa registrada → 200 com `updated: 0`.
6. Manter `NFSE_DELIVERY_ENABLED` ausente; a emissão e o envio automático seguem bloqueados.
Reversão: apagar o webhook no Resend e/ou a variável, ou promover o deployment anterior.

## Revisão de segurança da PR #61 (14/11/2026; ainda sem deploy)
- A branch isolada `fix/nfse-pr61-archive-safety-20261114` introduz a migration D pendente e muda a seleção do lote de arquivamento para uma RPC de claim transacional. O banco examina todas as notas autorizadas e incompletas, sem truncar nas 50 mais recentes, e prioriza notas com menos falhas. Claim de 3 minutos e backoff exponencial de 5 minutos até 24 horas impedem que notas defeituosas monopolizem a fila.
- A RPC só é executável por `service_role`; todos os dados permanecem privados. Documentos existentes continuam imutáveis e verificados por SHA-256. O retorno do cron informa `claimed` (itens reivindicados nesta execução), não um total enganoso de pendências.
- O arquivamento não depende nem da chave do Resend nem da flag de envio. Sem `NFSE_ARCHIVE_ENABLED`, sem liberação fiscal, ou sem migration D, o sistema **não ativa** esse fluxo.
- Testes adicionados: mais de 50 notas, erro persistente e progresso da fila, guardas de liberação e SQL PostgreSQL descartável para claim e backoff. **Não foram executados em produção**.
