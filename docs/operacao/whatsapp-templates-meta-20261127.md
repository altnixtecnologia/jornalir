# Templates de WhatsApp (Meta) — notificações ao cliente — 27/11/2026

Documento de **proposta**. Nenhum template foi submetido à Meta e nenhuma configuração do provedor foi alterada.
Regra do sistema: **template não configurado = despacho desligado** (nada é enfileirado nem enviado) e nunca se envia
texto livre como substituto. O nome APROVADO de cada template é informado em variável de ambiente.

Categoria sugerida na Meta: **UTILITY** · idioma: **pt_BR** · parâmetros do corpo, sem quebra de linha, tabulação ou 5+ espaços,
sem parâmetro no início/fim do texto.

## Já aprovados e reaproveitados (finalidade e parâmetros coincidem)

| Template | Variável | Uso | Parâmetros |
|---|---|---|---|
| `fatura_disponivel` | `WHATSAPP_BILLING_TEMPLATE` (padrão) | Cobrança **manual** com Pix vigente já existente | 1 nome · 2 referência · 3 valor · 4 vencimento · 5 link seguro do Pix |
| `confirmacao_pagamento_ir` | `WHATSAPP_PAYMENT_CONFIRMED_TEMPLATE` (padrão) | Confirmação de pagamento (webhook Asaas e envio manual) | 1 nome · 2 referência · 3 valor · 4 forma · 5 transação |

## A aprovar (propostas)

| Evento (fonte) | Nome proposto | Variável de ambiente | Texto |
|---|---|---|---|
| Nova obrigação financeira (Jornal) | `nova_cobranca_ir` | `WHATSAPP_TEMPLATE_NEW_OBLIGATION` | Olá, {{1}}. Há uma nova cobrança referente a {{2}}, no valor de {{3}}, com vencimento em {{4}}. Você pode consultar e pagar pelo portal do cliente. Jornal Informativo Regional. |
| Vencimento próximo (Jornal) | `lembrete_vencimento_ir` | `WHATSAPP_TEMPLATE_DUE_SOON` | Olá, {{1}}. Lembrete: a cobrança referente a {{2}}, no valor de {{3}}, vence em {{4}}. Consulte e pague pelo portal do cliente. Jornal Informativo Regional. |
| Pagamento em atraso (Jornal) | `cobranca_em_atraso_ir` | `WHATSAPP_TEMPLATE_OVERDUE` | Olá, {{1}}. Não identificamos o pagamento da cobrança referente a {{2}}, no valor de {{3}}, vencida em {{4}}. Se já pagou, desconsidere esta mensagem. Para regularizar, acesse o portal do cliente. Jornal Informativo Regional. |
| Recibo disponível (Jornal; também aviso manual de recibo) | `recibo_disponivel_ir` | `WHATSAPP_TEMPLATE_RECEIPT_AVAILABLE` | Olá, {{1}}. O recibo do pagamento de {{3}} referente a {{2}} já está disponível no portal do cliente: {{4}}. Jornal Informativo Regional. |
| Suspensão financeira **efetiva** (Jornal) | `servico_suspenso_ir` | `WHATSAPP_TEMPLATE_SERVICE_SUSPENDED` | Olá, {{1}}. Por pendência financeira, a exibição da sua campanha nas telas do Informativo Regional foi suspensa. Regularize o pagamento pelo portal do cliente para restabelecer o serviço. Jornal Informativo Regional. |
| Restabelecimento **efetivo** (Jornal) | `servico_restabelecido_ir` | `WHATSAPP_TEMPLATE_SERVICE_RESTORED` | Olá, {{1}}. Recebemos a regularização e a exibição da sua campanha nas telas do Informativo Regional foi restabelecida. Obrigado! Jornal Informativo Regional. |

Mapeamento dos parâmetros: `{{1}}` primeiro nome do cliente; `{{2}}` referência/descrição do título; `{{3}}` valor em R$; `{{4}}` vencimento
(dd/mm/aaaa) — no recibo, `{{4}}` é o endereço do portal do cliente (`WHATSAPP_PORTAL_URL`, padrão `https://cliente.altnix.com.br`).
Suspensão e restabelecimento usam apenas `{{1}}`. Nenhum identificador interno, link administrativo ou dado de pagamento do Asaas vai nos parâmetros.

## Eventos do Informativo (não duplicar)

Equipamento, campanha e mídia continuam com o Informativo (por exemplo o aviso `brinde_finalizando` e o link de acesso ao portal).
Qualquer aviso **financeiro** de cliente vinculado ao cadastro mestre é do Jornal: a fila legada do Informativo o marca como `skipped`.

## Condições para o despacho AUTOMÁTICO (todas, desligado por padrão)

1. Produção (`VERCEL_ENV=production`).
2. `WHATSAPP_AUTOMATIC_FINANCE_ENABLED=true` (chave mestra).
3. `JORNALIR_NOTIFICATION_TEST_CLASSIFICATION_DONE=true` — somente depois de aplicar a migration `20261127150000` e **marcar os títulos de teste**.
4. `WHATSAPP_FINANCE_NOTIFICATIONS_SINCE=aaaa-mm-dd` — eventos anteriores nunca disparam (evita enviar o histórico).
5. Ao menos um template do quadro acima configurado. Aviso de recibo exige também `WHATSAPP_RECEIPT_PORTAL_READY=true` (portal já oferece "Visualizar recibo").
6. Credenciais da WhatsApp Cloud API (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).

Agenda (opcional, com limites): `WHATSAPP_DUE_SOON_DAYS` (1–15, padrão 3) e `WHATSAPP_OVERDUE_REMINDER_DAYS` (até 3 marcos, padrão `1`).
Cada marco é um dia exato e uma ocorrência própria no registro: não há lembrete recorrente a cada ciclo. O ciclo roda dentro da rotina diária já existente
(`/api/cron/altnix-service-finance`); não há cron novo.

## Status de entrega (callback da Meta)

Rota `/api/integrations/whatsapp/webhook` (desligada: `WHATSAPP_WEBHOOK_ENABLED`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`).
Assina-se `messages`/status no painel da Meta **somente após autorização**; nada foi configurado. "Entregue" e "Lido" aparecem apenas com esses eventos autênticos.
