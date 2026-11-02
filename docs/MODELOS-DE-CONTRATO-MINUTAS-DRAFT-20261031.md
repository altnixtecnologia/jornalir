# Minutas de modelos de contrato — rascunho pendente de revisão (31/10/2026)

**SUPERSEDIDO EM PARTE EM 01/11/2026 (Bloco 3) — ver `docs/MODELOS-DE-CONTRATO-MINUTAS-BLOCO3-20261101.md`.** As categorias usadas abaixo para publicidade/locação/pacotes (`publicidade`, `prestacao_servicos` etc.) eram apenas as 4 categorias *sugeridas* genéricas (`CONTRACT_TEMPLATE_SUGGESTED_CATEGORIES`) — a investigação do Bloco 3 descobriu que o pipeline de **seleção automática de modelo** (`assign_commercial_contract_default_templates`) na verdade exige categorias literais `commercial_<canal>`/`commercial_combined` (ver o novo documento). As minutas publicadas de fato no Bloco 3 (migration `20261101110000_contract_templates_seed_minutas.sql`) usam essas categorias corretas e foram verificadas contra o código real de validação — use aquelas, não as deste arquivo, para publicidade/LED/locação/combinado. A minuta de **assinatura anual** deste arquivo continua válida (categoria `assinaturas`, sem mudança).

**STATUS: MINUTA. NÃO CADASTRADA NO SISTEMA, NÃO APROVADA JURIDICAMENTE.** Nenhuma destas minutas foi inserida em `contract_templates` nem em qualquer banco (local ou remoto) nesta sessão — restrição explícita do usuário ("não cadastrar modelos como juridicamente aprovados sem revisão humana", "não executar migrations remotas"). Este arquivo existe só para revisão humana (idealmente com apoio jurídico) antes de alguém cadastrar os modelos pela tela `/sistema/financeiro/modelos-contrato` (`createContractTemplateAction`).

## Achado de coerência (Bloco 2) que afeta este bloco

O mecanismo de geração de PDF/assinatura (`contract-template-merge.ts`, `resolveTemplateVariables`) hoje só resolve os placeholders automáticos (`contrato.*`) a partir de um registro em `public.contracts` (módulo **"Contratos institucionais"**, `/sistema/financeiro/contratos`) — apesar do nome da tela sugerir só prefeituras/câmaras, o schema (`InstitutionalContract`) não restringe `clientId` a órgão público; é genérico (qualquer cliente, objeto, valor, vigência).

**Implicação real**: a conversão de solicitação em assinatura (`convertSubscriptionInterestAction`) e a nova conversão em proposta de publicidade (`convertAdvertisingInterestAction`, Bloco 1) **não criam automaticamente** um registro em `contracts`. Para gerar e enviar um PDF de contrato assinável a partir destas minutas, hoje é preciso um passo manual adicional: cadastrar um "Contrato institucional" para o mesmo cliente (`/sistema/financeiro/contratos/novo`), com o objeto/valor/vigência correspondentes, e só então gerar o documento a partir do modelo. Isso não foi alterado nesta sessão (instrução explícita: "sem alterar regras comerciais automaticamente") — fica registrado aqui como pendência real de integração para uma decisão futura do usuário (ligar automaticamente, ou manter o passo manual deliberado).

## Placeholders automáticos disponíveis (preenchidos do cadastro/contrato, nunca inventados)

`{{cliente.nome}}`, `{{cliente.cpf_cnpj}}`, `{{cliente.endereco}}`, `{{cliente.representante}}`, `{{cliente.contato}}`, `{{contrato.numero}}`, `{{contrato.referencia}}`, `{{contrato.objeto}}`, `{{contrato.valor}}`, `{{contrato.vigencia_inicio}}`, `{{contrato.vigencia_fim}}`, `{{data.hoje}}`.

Cada minuta abaixo também define variáveis **próprias** (preenchidas manualmente pelo operador ao gerar o documento, nunca um valor presumido) — campo `variables` do modelo.

---

## 1. Assinatura anual do jornal impresso

**Categoria:** `assinaturas`

```
CONTRATO DE ASSINATURA DO JORNAL INFORMATIVO REGIONAL

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, com endereço em {{cliente.endereco}}, contato {{cliente.contato}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
A CONTRATADA se obriga a entregar ao CONTRATANTE, semanalmente, {{quantidade_exemplares}} exemplar(es) do jornal impresso Informativo Regional, no endereço indicado no cadastro, durante a vigência deste contrato.

2. VALOR E FORMA DE PAGAMENTO
Valor anual: {{contrato.valor}}, pagável via {{forma_pagamento}}.

3. VIGÊNCIA
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}, renovável automaticamente por igual período, salvo manifestação em contrário de qualquer parte com {{aviso_renovacao_dias}} dias de antecedência.

4. OBRIGAÇÕES DO CONTRATANTE
Manter atualizado o endereço de entrega e efetuar o pagamento nos prazos acordados.

5. OBRIGAÇÕES DA CONTRATADA
Garantir a entrega regular, salvo caso fortuito ou força maior, e comunicar qualquer interrupção programada com antecedência razoável.

6. RESCISÃO
Qualquer parte pode rescindir a qualquer momento, mediante comunicação com {{aviso_rescisao_dias}} dias de antecedência, sem multa, respeitada a devolução proporcional de valores já pagos e não usufruídos.

7. FORO
Fica eleito o foro da comarca de {{comarca_foro}} para dirimir eventuais controvérsias.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA
```

**Variáveis próprias:** `quantidade_exemplares` (obrigatória), `forma_pagamento` (obrigatória), `aviso_renovacao_dias` (obrigatória), `aviso_rescisao_dias` (obrigatória), `comarca_foro` (obrigatória).

---

## 2. Publicidade impressa

**Categoria:** `publicidade`

```
CONTRATO DE VEICULAÇÃO DE PUBLICIDADE IMPRESSA

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, representado por {{cliente.representante}}, contato {{cliente.contato}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
Veiculação de anúncio publicitário no formato "{{formato_anuncio}}" (medida/posição: {{medida_posicao}}), na(s) edição(ões) impressa(s) referente(s) a: {{contrato.objeto}}.

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{contrato.valor}}, pagável via {{forma_pagamento}}.

3. VIGÊNCIA/PERIODICIDADE
{{periodicidade_veiculacao}}, de {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}.

4. MATERIAL PUBLICITÁRIO
O CONTRATANTE é responsável por fornecer a arte final dentro do prazo acordado com a equipe comercial; a CONTRATADA não se responsabiliza por atraso decorrente de material entregue fora do prazo ou em desacordo com as especificações técnicas informadas.

5. CANCELAMENTO
Cancelamentos solicitados com menos de {{prazo_cancelamento_dias}} dias da data de fechamento da edição não geram reembolso proporcional.

6. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA
```

**Variáveis próprias:** `formato_anuncio`, `medida_posicao`, `forma_pagamento`, `periodicidade_veiculacao`, `prazo_cancelamento_dias`, `comarca_foro` (todas obrigatórias).

---

## 3. Publicidade digital

**Categoria:** `publicidade`

```
CONTRATO DE VEICULAÇÃO DE PUBLICIDADE DIGITAL

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, representado por {{cliente.representante}}, contato {{cliente.contato}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
Veiculação de anúncio digital no(s) canal(is) "{{canal_digital}}" (site/app/redes sociais do Jornal IR), conforme especificação: {{contrato.objeto}}.

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{contrato.valor}}, pagável via {{forma_pagamento}}.

3. VIGÊNCIA
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}.

4. MÉTRICAS
{{metricas_acordadas}} (ex.: impressões, cliques, período de exibição) — a CONTRATADA não garante resultado comercial, apenas a exibição conforme especificado.

5. MATERIAL PUBLICITÁRIO
Mesmas condições de responsabilidade por material/arte do modelo de publicidade impressa.

6. CANCELAMENTO
Cancelamentos solicitados com menos de {{prazo_cancelamento_dias}} dias não geram reembolso proporcional do período já veiculado.

7. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA
```

**Variáveis próprias:** `canal_digital`, `forma_pagamento`, `metricas_acordadas`, `prazo_cancelamento_dias`, `comarca_foro` (todas obrigatórias).

---

## 4. Painel LED

**Categoria:** `publicidade`

```
CONTRATO DE VEICULAÇÃO EM PAINEL LED

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, representado por {{cliente.representante}}, contato {{cliente.contato}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
Exibição de conteúdo publicitário no painel LED localizado em {{localizacao_painel}}, com {{tempo_exibicao}} de exposição por ciclo, conforme especificação: {{contrato.objeto}}.

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{contrato.valor}}, pagável via {{forma_pagamento}}.

3. VIGÊNCIA
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}.

4. MATERIAL
O CONTRATANTE fornece a arte/vídeo nas especificações técnicas informadas pela equipe comercial; a CONTRATADA não se responsabiliza por material fora de especificação.

5. INDISPONIBILIDADE DO PAINEL
Em caso de falha técnica do equipamento, a CONTRATADA compensará o período não exibido com exibição adicional equivalente, sem direito a reembolso em dinheiro.

6. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA
```

**Variáveis próprias:** `localizacao_painel`, `tempo_exibicao`, `forma_pagamento`, `comarca_foro` (todas obrigatórias).

---

## 5. Locação de equipamentos

**Categoria:** `locacao_equipamentos`

```
CONTRATO DE LOCAÇÃO DE EQUIPAMENTOS

LOCATÁRIO: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, representado por {{cliente.representante}}, contato {{cliente.contato}}.
LOCADORA: Informativo Regional (Jornal IR).

1. OBJETO
Locação do(s) equipamento(s): {{especificacao_equipamento}}, quantidade {{quantidade_equipamento}}, para uso em: {{contrato.objeto}}.

2. VALOR E FORMA DE PAGAMENTO
Valor total: {{contrato.valor}}, pagável via {{forma_pagamento}}. Caução (se aplicável): {{valor_caucao}}.

3. PERÍODO DE LOCAÇÃO
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}. Retirada/entrega: {{logistica_retirada_entrega}}.

4. VISTORIA
Entrega e devolução do equipamento serão registradas por vistoria (estado, acessórios, eventuais avarias), conforme módulo de locações do sistema.

5. RESPONSABILIDADE POR DANOS
O LOCATÁRIO responde por danos ou perda do equipamento durante o período de locação, deduzidos do valor da caução quando houver, ou cobrados separadamente quando o dano exceder a caução.

6. ATRASO NA DEVOLUÇÃO
Devolução fora do prazo acordado gera cobrança adicional de {{valor_diaria_atraso}} por dia de atraso.

7. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
LOCATÁRIO                               LOCADORA
```

**Variáveis próprias:** `especificacao_equipamento`, `quantidade_equipamento`, `forma_pagamento`, `valor_caucao` (não obrigatória — pode não haver caução), `logistica_retirada_entrega`, `valor_diaria_atraso`, `comarca_foro` (demais obrigatórias).

---

## 6. Pacotes combinados

**Categoria:** `pacotes_combinados`

```
CONTRATO DE PACOTE COMBINADO DE SERVIÇOS

CONTRATANTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}, representado por {{cliente.representante}}, contato {{cliente.contato}}.
CONTRATADA: Informativo Regional (Jornal IR).

1. OBJETO
O presente contrato formaliza a contratação combinada dos seguintes serviços, detalhados no Anexo I (não substitui a necessidade de contrato específico de cada serviço quando aplicável): {{contrato.objeto}}.
Itens incluídos no pacote: {{itens_pacote}}.

2. VALOR E FORMA DE PAGAMENTO
Valor total do pacote: {{contrato.valor}}, pagável via {{forma_pagamento}}. O valor representa a contratação conjunta e pode incluir condição comercial diferenciada em relação à soma dos itens contratados separadamente.

3. VIGÊNCIA
De {{contrato.vigencia_inicio}} a {{contrato.vigencia_fim}}, observando a vigência específica de cada item quando divergente (detalhar no Anexo I).

4. CONDIÇÕES ESPECÍFICAS
Aplicam-se, para cada item do pacote, as condições específicas do respectivo modelo de contrato (assinatura, publicidade impressa/digital, painel LED, locação), no que não contrariar este instrumento.

5. RESCISÃO PARCIAL
A rescisão de um item isolado do pacote não rescinde automaticamente os demais, salvo quando a oferta combinada depender tecnicamente da manutenção de todos os itens — nesse caso, especificar no Anexo I.

6. FORO
Fica eleito o foro da comarca de {{comarca_foro}}.

Local e data: {{data.hoje}}.

_____________________________          _____________________________
CONTRATANTE                             CONTRATADA
```

**Variáveis próprias:** `itens_pacote`, `forma_pagamento`, `comarca_foro` (todas obrigatórias).

---

## Próximos passos (não executados nesta sessão)

1. Revisão jurídica humana do texto de cada minuta (cláusulas de rescisão, foro, responsabilidade por danos e atraso merecem atenção especial).
2. Depois de aprovadas, cadastro manual pela tela `/sistema/financeiro/modelos-contrato` (cada cadastro cria a versão 1 do respectivo `group_id` — nunca inserido por migration/script).
3. Decisão do usuário sobre o achado de coerência acima: ligar (ou não) a conversão de solicitação/assinatura/proposta à criação automática de um registro em `contracts`, para permitir gerar o PDF assinável sem o passo manual intermediário.
