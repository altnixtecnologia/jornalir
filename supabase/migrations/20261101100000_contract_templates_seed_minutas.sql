-- Bloco 3 (Modelos de Contrato) — minutas-base, 01/11/2026. NÃO
-- aplicada ainda (preparada localmente). 6 modelos pedidos pelo
-- usuário, nas 6 categorias REAIS que o sistema efetivamente reconhece
-- (verificadas no código antes de escrever este arquivo — nenhum
-- identificador aqui foi inventado):
--
-- - "assinaturas": sem mecanismo de seleção/emissão automática hoje —
--   só o motor de merge mais antigo (contract-template-merge.ts,
--   InstitutionalContract) poderia gerar esse documento, e só depois
--   de um "Contrato institucional" ser criado manualmente pra ligar
--   ao cliente (achado já registrado no lote anterior, docs/
--   MODELOS-DE-CONTRATO-MINUTAS-DRAFT-20261031.md). Usa os 12
--   placeholders de CONTRACT_TEMPLATE_AUTO_FIELDS (@ir/types).
-- - "commercial_newspaper" / "commercial_website" / "commercial_led_panel"
--   / "commercial_equipment_rental" / "commercial_combined": categorias
--   literais exigidas por assign_commercial_contract_default_templates
--   (supabase/migrations/20261110100000) — "commercial_" + o
--   service_channel real da venda (newspaper/website/social_media/
--   led_panel/equipment_rental/package/other, ver
--   commercial_products.channel e commercial_contract_services.
--   service_channel) ou "commercial_combined" quando a contratação
--   usa documento único (document_mode='combined'). "Publicidade
--   digital" usa o canal "website" (o mais comum); "social_media" fica
--   documentado como modelo futuro análogo, não inventado aqui sem
--   necessidade confirmada.
--
-- Cada modelo comercial declara em `variables` e usa no `content` os 4
-- campos exigidos por missingCommercialLegalParties
-- (apps/sistema/src/lib/contracts/commercialPartyRequirements.ts):
-- contratada.razao_social/cnpj/endereco/representante — só aceito pela
-- tela de cadastro depois da correção da regex em
-- packages/core/src/financeiro/contract-template-service.ts nesta
-- mesma sessão (achado real: nenhum modelo comercial teria passado
-- por lá antes). Também usa cliente.qualificacao, venda.referencia,
-- venda.valor e servicos.resumo (auto-preenchidos pelo pipeline de
-- emissão comercial, nunca digitados por aqui).
--
-- active = FALSE em todos — nenhum modelo fica juridicamente aprovado
-- nem disponível para seleção automática/emissão só por existir;
-- precisa de um toggle explícito (set_contract_template_active) depois
-- da revisão jurídica E operacional, exatamente como o próprio
-- mecanismo do sistema já prevê (comentário original da tabela).
-- Nenhum dado fiscal real, valor ou condição comercial foi inventado
-- — todo valor concreto (CNPJ real da contratada, por exemplo) seria
-- preenchido depois, como `custom_values` por documento emitido,
-- nunca gravado aqui.

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  'aa5ffd76-06f4-477c-9ee1-1423a5c074fe', 'aa5ffd76-06f4-477c-9ee1-1423a5c074fe', 1,
  'Assinatura anual do jornal impresso (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "assinaturas" — sem seleção/emissão automática hoje; exige um Contrato institucional vinculado ao cliente para gerar o PDF pelo mecanismo atual.',
  'assinaturas',
  $content$CONTRATO DE ASSINATURA DO JORNAL INFORMATIVO REGIONAL — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, com endereço em {{cliente.endereco}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
{{contrato.objeto}}

2. VALOR E FORMA DE PAGAMENTO
Valor anual: {{contrato.valor}}, pagável via {{forma_pagamento}}.

3. VIGÊNCIA
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}, renovável automaticamente por igual período, salvo manifestação em contrário de qualquer parte com {{aviso_renovacao_dias}} dias de antecedência.

4. ENTREGA
{{periodicidade_entrega}}.

5. OBRIGAÇÕES DO CONTRATANTE
Manter atualizado o endereço de entrega e efetuar o pagamento nos prazos acordados.

6. OBRIGAÇÕES DA CONTRATADA
Garantir a entrega regular, salvo caso fortuito ou força maior, e comunicar qualquer interrupção programada com antecedência razoável.

7. RESCISÃO
Qualquer parte pode rescindir a qualquer momento, mediante comunicação com {{aviso_rescisao_dias}} dias de antecedência, sem multa, respeitada a devolução proporcional de valores já pagos e não usufruídos.

8. FORO
Fica eleito o foro da comarca de {{comarca_foro}} para dirimir eventuais controvérsias.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA$content$,
  '[
    {"key": "periodicidade_entrega", "label": "Periodicidade e quantidade de exemplares entregues", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "aviso_renovacao_dias", "label": "Antecedência (dias) para avisar não-renovação", "required": true},
    {"key": "aviso_rescisao_dias", "label": "Antecedência (dias) para rescisão sem multa", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  '90d20f4d-d50f-4bb2-a393-e705b00c0e5e', '90d20f4d-d50f-4bb2-a393-e705b00c0e5e', 1,
  'Publicidade no jornal impresso (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "commercial_newspaper" — selecionável automaticamente pelo pipeline comercial (assign_commercial_contract_default_templates) para vendas com canal "newspaper".',
  'commercial_newspaper',
  $content$CONTRATO DE VEICULAÇÃO DE PUBLICIDADE IMPRESSA — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

CONTRATANTE: {{cliente.qualificacao}}
CONTRATADA: {{contratada.razao_social}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, representada por {{contratada.representante}}.

1. OBJETO
Veiculação de anúncio publicitário em edição(ões) impressa(s) do Jornal Informativo Regional, conforme detalhamento no Anexo Operacional desta venda ({{venda.referencia}}).
{{servicos.resumo}}

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{venda.valor}}, pagável via {{forma_pagamento}}.

3. MATERIAL PUBLICITÁRIO
O CONTRATANTE é responsável por fornecer a arte final dentro do prazo acordado com a equipe comercial; a CONTRATADA não se responsabiliza por atraso decorrente de material entregue fora do prazo ou em desacordo com as especificações técnicas informadas.

4. CANCELAMENTO
Cancelamentos solicitados com menos de {{prazo_cancelamento_dias}} dias da data de fechamento da edição não geram reembolso proporcional.

5. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA$content$,
  '[
    {"key": "contratada.razao_social", "label": "Razão social da contratada", "required": true},
    {"key": "contratada.cnpj", "label": "CNPJ da contratada", "required": true},
    {"key": "contratada.endereco", "label": "Endereço da contratada", "required": true},
    {"key": "contratada.representante", "label": "Representante legal da contratada", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "prazo_cancelamento_dias", "label": "Prazo (dias) para cancelamento sem perda de valor", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  'ef6e4d9f-fc3d-4358-8700-d7986f6bd0b7', 'ef6e4d9f-fc3d-4358-8700-d7986f6bd0b7', 1,
  'Publicidade digital — canal site (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "commercial_website" — selecionável automaticamente para vendas com canal "website". Canal "social_media" (redes sociais) precisaria de um modelo análogo próprio, não criado nesta sessão por falta de pedido confirmado.',
  'commercial_website',
  $content$CONTRATO DE VEICULAÇÃO DE PUBLICIDADE DIGITAL — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

CONTRATANTE: {{cliente.qualificacao}}
CONTRATADA: {{contratada.razao_social}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, representada por {{contratada.representante}}.

1. OBJETO
Veiculação de anúncio digital no site do Jornal Informativo Regional, conforme detalhamento no Anexo Operacional desta venda ({{venda.referencia}}).
{{servicos.resumo}}

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{venda.valor}}, pagável via {{forma_pagamento}}.

3. MÉTRICAS
{{metricas_acordadas}} — a CONTRATADA não garante resultado comercial, apenas a exibição conforme especificado.

4. MATERIAL PUBLICITÁRIO
Mesmas condições de responsabilidade por material/arte do modelo de publicidade impressa.

5. CANCELAMENTO
Cancelamentos solicitados com menos de {{prazo_cancelamento_dias}} dias não geram reembolso proporcional do período já veiculado.

6. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA$content$,
  '[
    {"key": "contratada.razao_social", "label": "Razão social da contratada", "required": true},
    {"key": "contratada.cnpj", "label": "CNPJ da contratada", "required": true},
    {"key": "contratada.endereco", "label": "Endereço da contratada", "required": true},
    {"key": "contratada.representante", "label": "Representante legal da contratada", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "metricas_acordadas", "label": "Métricas acordadas (impressões, cliques, período)", "required": true},
    {"key": "prazo_cancelamento_dias", "label": "Prazo (dias) para cancelamento sem perda de valor", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  '34400bd0-6642-4d02-b79a-263b134ac239', '34400bd0-6642-4d02-b79a-263b134ac239', 1,
  'Publicidade em painel LED (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "commercial_led_panel" — selecionável automaticamente para vendas com canal "led_panel". O local de instalação já é exigido pelo sistema por serviço (service_location) e aparece no Anexo Operacional.',
  'commercial_led_panel',
  $content$CONTRATO DE VEICULAÇÃO EM PAINEL LED — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

CONTRATANTE: {{cliente.qualificacao}}
CONTRATADA: {{contratada.razao_social}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, representada por {{contratada.representante}}.

1. OBJETO
Exibição de conteúdo publicitário em painel LED, conforme local e período detalhados no Anexo Operacional desta venda ({{venda.referencia}}).
{{servicos.resumo}}

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{venda.valor}}, pagável via {{forma_pagamento}}.

3. MATERIAL
O CONTRATANTE fornece a arte/vídeo nas especificações técnicas informadas pela equipe comercial; a CONTRATADA não se responsabiliza por material fora de especificação.

4. INDISPONIBILIDADE DO PAINEL
Em caso de falha técnica do equipamento, a CONTRATADA compensará o período não exibido com exibição adicional equivalente, sem direito a reembolso em dinheiro.

5. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA$content$,
  '[
    {"key": "contratada.razao_social", "label": "Razão social da contratada", "required": true},
    {"key": "contratada.cnpj", "label": "CNPJ da contratada", "required": true},
    {"key": "contratada.endereco", "label": "Endereço da contratada", "required": true},
    {"key": "contratada.representante", "label": "Representante legal da contratada", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  'e1e1ec1a-c2ab-4af0-907a-755e7bbd8a53', 'e1e1ec1a-c2ab-4af0-907a-755e7bbd8a53', 1,
  'Locação de equipamentos (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "commercial_equipment_rental" — selecionável automaticamente para vendas com canal "equipment_rental". Local de retirada/uso já exigido por serviço (service_location) e aparece no Anexo Operacional.',
  'commercial_equipment_rental',
  $content$CONTRATO DE LOCAÇÃO DE EQUIPAMENTOS — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

LOCATÁRIO: {{cliente.qualificacao}}
LOCADORA: {{contratada.razao_social}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, representada por {{contratada.representante}}.

1. OBJETO
Locação de equipamento(s), conforme detalhamento, local e período no Anexo Operacional desta venda ({{venda.referencia}}).
{{servicos.resumo}}

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{venda.valor}}, pagável via {{forma_pagamento}}. Caução (se aplicável): {{valor_caucao}}.

3. LOGÍSTICA
{{logistica_retirada_entrega}}.

4. VISTORIA
Entrega e devolução do equipamento serão registradas por vistoria (estado, acessórios, eventuais avarias), conforme módulo de locações do sistema.

5. RESPONSABILIDADE POR DANOS
O LOCATÁRIO responde por danos ou perda do equipamento durante o período de locação, deduzidos do valor da caução quando houver, ou cobrados separadamente quando o dano exceder a caução.

6. ATRASO NA DEVOLUÇÃO
Devolução fora do prazo acordado gera cobrança adicional de {{valor_diaria_atraso}} por dia de atraso.

7. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

_____________________________          _____________________________
LOCATÁRIO                               LOCADORA$content$,
  '[
    {"key": "contratada.razao_social", "label": "Razão social da contratada", "required": true},
    {"key": "contratada.cnpj", "label": "CNPJ da contratada", "required": true},
    {"key": "contratada.endereco", "label": "Endereço da contratada", "required": true},
    {"key": "contratada.representante", "label": "Representante legal da contratada", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "valor_caucao", "label": "Valor da caução, quando houver", "required": false},
    {"key": "logistica_retirada_entrega", "label": "Logística de retirada e entrega", "required": true},
    {"key": "valor_diaria_atraso", "label": "Valor da diária de atraso na devolução", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);

insert into public.contract_templates (id, group_id, version, title, description, category, content, variables, active)
values (
  'a93bebd6-5275-4ab3-8c61-d094d0231dfc', 'a93bebd6-5275-4ab3-8c61-d094d0231dfc', 1,
  'Contratação combinada de vários serviços (MINUTA)',
  'Minuta pendente de revisão jurídica. Categoria "commercial_combined" — selecionável automaticamente quando a contratação usa documento único para a venda inteira (document_mode=''combined''), independente dos canais individuais dos serviços.',
  'commercial_combined',
  $content$CONTRATO DE PACOTE COMBINADO DE SERVIÇOS — MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO.

CONTRATANTE: {{cliente.qualificacao}}
CONTRATADA: {{contratada.razao_social}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, representada por {{contratada.representante}}.

1. OBJETO
O presente contrato formaliza a contratação combinada dos serviços detalhados no Anexo Operacional desta venda ({{venda.referencia}}), que a integra para todos os efeitos.
{{servicos.resumo}}

2. VALOR E FORMA DE PAGAMENTO
Valor total do pacote: {{venda.valor}}, pagável via {{forma_pagamento}}. O valor representa a contratação conjunta e pode refletir condição comercial diferenciada em relação à soma dos serviços contratados separadamente.

3. CONDIÇÕES ESPECÍFICAS
Aplicam-se, para cada serviço do pacote, as condições técnicas e operacionais detalhadas no Anexo Operacional, no que não contrariar este instrumento.

4. RESCISÃO PARCIAL
A rescisão de um serviço isolado do pacote não rescinde automaticamente os demais, salvo quando a oferta combinada depender tecnicamente da manutenção de todos os serviços.

5. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA$content$,
  '[
    {"key": "contratada.razao_social", "label": "Razão social da contratada", "required": true},
    {"key": "contratada.cnpj", "label": "CNPJ da contratada", "required": true},
    {"key": "contratada.endereco", "label": "Endereço da contratada", "required": true},
    {"key": "contratada.representante", "label": "Representante legal da contratada", "required": true},
    {"key": "forma_pagamento", "label": "Forma de pagamento", "required": true},
    {"key": "comarca_foro", "label": "Comarca do foro eleito", "required": true}
  ]'::jsonb,
  false
);
