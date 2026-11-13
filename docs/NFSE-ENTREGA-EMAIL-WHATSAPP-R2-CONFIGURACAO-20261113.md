# NFS-e: arquivamento R2, envio automático e histórico de entrega
Revisão de 13/11/2026. **Código em branch/PR, não publicado.** Nenhuma chave, e-mail, nota fiscal ou arquivo real foi transmitido por esta etapa.

## Decisão de arquitetura (sem projeto Supabase paralelo)
- Manter o **mesmo Supabase** do Jornal IR, com tabelas separadas `nfse_*` e RLS (somente service_role para os dados de entrega/documentos; leitura por API server-side com confirmação de owner/admin).
- Aproveitar **o cadastro único**: `clients.fiscal_email` quando informado; caso contrário `clients.email`. **Snapshot do destinatário na data de cada tentativa**, sem reescrever histórico após o cadastro mudar. Campo WhatsApp já existe no cadastro.
- Uma **conta Cloudflare** que já abriga mídias e jornais online, mas um **bucket NOVO e PRIVADO** `jornal-ir-nfse`, separado do bucket de edições, com token específico de acesso somente ao bucket fiscal. Não habilitar domínio público, R2.dev, CORS público ou enlaces permanentes.
- XML da NFS-e autorizada e XML da DPS **originais**, DANFSe PDF gerado pelo servidor, cada objeto no R2 com SHA-256; só guardar bucket key/hash/tamanho/tipo no PostgreSQL. Durante transição, XML em `nfse_issued_notes` ainda é fallback para leitura — NUNCA apagar antes de validar backup/integridade.
- A autorização é independente do e-mail: a nota continua autorizada mesmo se R2/SMTP falharem. A migração tem trigger **somente na inclusão de nota de produção**, para enfileirar a entrega sem enviar e-mails no banco. Em homologação NÃO existe enfileiramento automático.
- Worker privado com `CRON_SECRET`, limitado a 3 filas por chamada, só ativa após **release fiscal explícito em código** (`NFSE_AVAILABLE_IN_THIS_RELEASE`) + `VERCEL_ENV=production` + `NFSE_DELIVERY_ENABLED=true` + R2 + Resend configurados. **Nenhuma destas ativações foi feita.**
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
1. Revisar e aprovar a migration `20261122340700_nfse_documents_delivery_history.sql` (novas tabelas RLS e trigger, serviço privado) **apenas depois** de confirmar a ordem das migrations anteriores e fazer backup. **Não aplicada nesta PR**.
2. Configurar um agendamento via pg_cron/pg_net ou mecanismo equivalente para `GET /api/cron/nfse-delivery` com header `Authorization: Bearer <CRON_SECRET>`. Frequência inicial proposta: cada 2 a 5 minutos, após homologar recebimento. Não habilitado nesta etapa.
3. Habilitar `NFSE_DELIVERY_ENABLED=true` **somente depois** de finalizar a homologação fiscal/A1, segurança, domínio do e-mail, R2 e aceitação expressa do responsável. A constante de release fiscal continua **false**.
4. Testar cenário de emissão autorizada, arquivo R2 e e-mail automático, e-mail fiscal/fallback, sem e-mail, erros, duplo clique, reenvio, devolução e consulta no desktop/celular. O DANFSe precisa de revisão visual contra o leiaute vigente, já registrada no projeto.

## Situação do momento
- O cadastro e as rotas de PDF já existem; a PR acrescenta as peças fiscais de entrega e o modal.
- Cloudflare e Resend **não estão conectados ao ChatGPT como plugins**; não criar bucket sem login/acesso do proprietário.
- Sem A1 e sem homologação, NÃO se envia NFS-e, e-mail real ou WhatsApp automaticamente.
- **NÃO** mesclar, publicar, aplicar migrations no Supabase real, agendar cron, habilitar `NFSE_DELIVERY_ENABLED` nem criar bucket nesta conversa sem as configurações e revisão necessárias.
