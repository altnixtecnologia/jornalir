# NFS-e Nacional — arquitetura do módulo

Status: **Parte 1 + Parte 2A implementadas** (base, configurações fiscais,
perfis de serviço, rascunhos com snapshot, e a arquitetura completa de
emissão — DPS, assinatura, transmissão, autorização/rejeição). **Nenhuma
transmissão real foi feita nem será até o certificado/API Nacional estarem
de fato configurados e confirmados.** Este documento substitui e consolida
`docs/NFSE-REGRA-FUTURA.md` (mantido só como um apontador curto, pra nunca
haver duas fontes conflitantes).

## Parte 2A — emissão nacional (DPS, assinatura, transmissão)

Fluxo real (arquitetura completa, nunca executada contra a API real):
rascunho → validação → reservar DPS (RPC atômica
`reserve_next_dps_number`) → montar XML (`buildDpsXml`) → validar
estruturalmente (`validateDpsXmlStructure` — validação interna de
completude dos campos, **não é validação XSD oficial**; XSD real contra o
pacote `NFSE_SCHEMA_PACKAGE_HOMOLOGATION` ainda não está implementado) →
assinar (`signDpsXml`, algoritmo explícito por configuração — ver
"Ajuste de segurança" abaixo, nunca um default assumido) → transmitir
(`NationalNfseProvider`) → interpretar resposta → registrar tentativa
(`nfse_transmission_attempts`) → se autorizada, criar `nfse_issued_notes`
(nunca a partir de rejeição).

### Ajuste de segurança (revisão pós-implementação inicial)

A primeira versão desta Parte 2A havia assumido RSA-SHA256 e a faixa
1-49999 para a série da DPS como "confirmadas", sem fonte primária oficial
suficiente. Revisão posterior corrigiu isso:

- **Algoritmo de assinatura**: não foi possível confirmar, com uma fonte
  oficial primária atual (Documentação Atual de Produção / Documentação
  Técnica de Produção Restrita / ANEXO_I-SEFIN_ADN-DPS_NFSe / XSD vigentes),
  se o Sistema Nacional exige RSA-SHA1 ou RSA-SHA256 — o ANEXO_I é uma
  planilha de leiaute de campos, não uma especificação de assinatura, e o
  Manual dos Municípios (PDF oficial) não pôde ser lido com as ferramentas
  disponíveis nesta sessão (`pdftoppm`/`poppler-utils` ausente). Fontes
  secundárias do ecossistema divergem entre si (há inclusive uma ferramenta
  de terceiros, "nfse-doctor", feita especificamente para sondar
  empiricamente qual perfil um servidor SEFIN aceita — evidência de que o
  tema é genuinamente contestado). Por instrução explícita, isso NUNCA foi
  resolvido por preferência técnica: `signDpsXml` agora exige o parâmetro
  `signatureAlgorithm: "rsa-sha1" | "rsa-sha256"` explicitamente, sem
  default; `NfseIssuerConfig.signatureAlgorithm` é opcional e, se não
  configurado no momento da transmissão, bloqueia (`TransmissionValidationError`).
  Continua pendente de confirmação por fonte oficial.
- **Série da DPS**: a faixa semântica "1-49999 para aplicativo próprio" não
  pôde ser rastreada a uma fonte primária gov.br confiável nesta sessão (só
  uma fonte secundária/blog). Foi removida; `isValidDpsSeriesFormat` agora
  valida apenas o formato confirmado do campo (1 a 5 dígitos numéricos, a
  largura do campo "Série" no identificador da DPS — ver `buildDpsId`
  abaixo), nunca uma faixa de negócio não confirmada.
- **Guarda de transmissão real**: independentemente da configuração acima,
  `FetchNationalNfseProvider` (única implementação real, baseada em
  `fetch`, de `NationalNfseProvider`) lança `RealTransmissionNotReadyError`
  em todos os seus métodos, sem nunca chegar a fazer uma chamada HTTP real.
  Esse bloqueio é propagado explicitamente por `TransmissionService` (nunca
  tratado como falha "incerta"/`uncertain`). Transmissão real só poderá
  ocorrer depois que assinatura, XSD real e extração de certificado
  estiverem todos confirmados/implementados.

Pontos deliberadamente travados/documentados, não implementados de verdade:

- **Certificado**: `certificate-provider.ts` lê PFX+senha de variável de
  ambiente do servidor (nunca banco/browser), mas `extractKeyMaterialFromPfx`
  lança erro proposital — extrair a chave privada de um PKCS#12 exige uma
  dependência de parsing (ex.: `node-forge`) que ainda não existe no
  projeto. `signDpsXml` já funciona de ponta a ponta (testado com chave de
  teste), só falta essa extração pra usar um certificado real. Fluxo futuro
  já decidido (painel, ainda não implementado): Configurações da empresa →
  Certificado digital A1 (.pfx/.p12) → upload pelo painel → senha digitada
  em campo mascarado → senha usada só para abrir/validar o PFX, nunca
  guardada em texto → material criptográfico armazenado de forma segura no
  servidor → validar CNPJ, validade e chave privada no upload → certificado
  poderá futuramente ser reutilizado por NF-e.
- **Esquema XSD/versão de leiaute**: o pacote adotado para homologação é
  `NFSE_SCHEMA_PACKAGE_HOMOLOGATION = "NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727"`
  (Produção Restrita — primeiro alvo desta fase). Produção usa um pacote
  diferente, ainda não necessário; o código nunca mistura os dois.
- **Canonicalização XML**: `signDpsXml` usa uma canonicalização
  simplificada (só remove espaço insignificante), documentada como
  provisória — há divergência conhecida no ecossistema sobre
  `exc-c14n#WithComments` vs. c14n inclusivo; precisa ser revalidada contra
  o manual oficial vigente antes de qualquer transmissão real.
- **Identificador da DPS** (`buildDpsId`): composição confirmada via
  pesquisa na documentação pública do Portal Nacional (município+tipo de
  inscrição+inscrição federal+série+número), mas ainda precisa ser
  revalidada contra o ANEXO I/manual vigente antes de produção.
- **Série da DPS**: campo configurável (`nfse_issuer_configs.dps_series`),
  nunca um valor fictício; bloqueia a transmissão enquanto vazio ou fora do
  formato confirmado (1 a 5 dígitos numéricos — ver "Ajuste de segurança"
  acima; nenhuma faixa de negócio é assumida).
- **Alíquota do ISSQN**: campo configurável por perfil de serviço
  (`issqnRate`), nunca calculada/presumida; sem ela, a transmissão é
  bloqueada (o XML de valores ficaria incompleto de propósito).
- **Ambiente**: Parte 2A só transmite em homologação
  (`isTransmissionEnvironmentAllowed`), travado na aplicação — mesmo que a
  configuração salva diga "produção".
- **DANFSe**: não recriado — a API específica foi desativada em 2026; só
  guardamos XML/identificadores pra usar o fluxo oficial vigente depois.

Idempotência real: `nfse_issued_notes.draft_id` é `UNIQUE` no banco — nunca
duas NFS-e autorizadas a partir do mesmo rascunho, mesmo com duplo
clique/retry/concorrência. Falha de rede/timeout depois do envio nunca
dispara retransmissão automática — vira tentativa `uncertain`, e é preciso
consultar a DPS (`GET/HEAD /dps/{id}`) antes de qualquer nova tentativa.

Permissão: só owner/admin (confirmado direto no banco, mesma regra da RLS).
Auditoria: `transmission_started`/`transmission_authorized`/
`transmission_rejected`/`transmission_uncertain` em `audit_events`
(ação) + detalhe técnico em `nfse_transmission_attempts` (nunca duplicado
entre os dois).

## Independência do módulo

A NFS-e é um módulo **independente** dentro do Jornal IR — não depende de
contrato institucional, assinatura, conta a receber nem cobrança Pix. Ela
funciona por conta própria: cliente → NFS-e. Os outros módulos poderão
futuramente abrir uma emissão já pré-preenchida (ex.: "gerar NFS-e a partir
deste título"), mas isso é só uma facilidade de atalho, nunca uma dependência
estrutural.

### Fluxo futuro completo (nenhuma etapa depois da primeira está implementada)

```
Cliente
  → NFS-e (rascunho → validação → DPS → transmissão → autorização)
  → opcionalmente gerar Financeiro (conta a receber)
  → opcionalmente gerar cobrança Pix via Asaas
  → opcionalmente enviar cobrança via WhatsApp
  → webhook do Asaas confirma pagamento
  → Financeiro registra recebimento
```

## Prestador inicial

Dados usados como **valor inicial sugerido** na tela de Configurações quando
nenhuma configuração existe ainda (nunca uma constante fiscal imutável — o
usuário pode e deve editar):

- Razão social: INFORMATIVO REGIONAL LTDA
- CNPJ: 23.970.969/0001-90
- Inscrição Municipal: 1000546
- Município: São João do Sul/SC (código IBGE 4216404)

Ver `NFSE_SUGGESTED_ISSUER_DEFAULTS` em `@ir/types`.

## Premissas oficiais (vigência regulatória)

- Para ME/EPP optante do Simples Nacional, o **Emissor Nacional da NFS-e**
  passa a ser obrigatório em **01/11/2026**. Até 31/12/2026 continuam valendo
  as regras atuais do Simples.
- A partir de **01/01/2027**, também existirão informações relacionadas a
  **IBS/CBS** nas hipóteses previstas em regulamentação.
- O layout nacional atual usa, entre outros campos: DPS, NFS-e, `cTribNac`,
  `cTribMun` (quando aplicável), `cNBS` (quando aplicável), `cLocPrestacao`,
  `xDescServ`, `tribISSQN`, `regEspTrib`.
- **Nenhum código fiscal é inventado neste projeto.** `cTribNac`/`cTribMun`/
  `cNBS`/configuração de ISSQN são sempre texto livre informado pelo usuário
  — nunca um enum com valores presumidos pela aplicação. Os valores
  definitivos serão configurados e validados contra o Sistema Nacional só na
  Parte 2 (ou posterior).

## Estrutura de domínio (Parte 1)

Camadas, seguindo o mesmo padrão já usado por Clientes/Financeiro/Contratos:

- `@ir/types` (`packages/types/src/nfse`): entidades (`NfseIssuerConfig`,
  `NfseServiceProfile`, `NfseDraft`), snapshots (`NfseTomadorSnapshot`,
  `NfseFiscalSnapshot`) e funções puras de construção de snapshot
  (`buildTomadorSnapshotFromClient`, `buildFiscalSnapshotFromServiceProfile`),
  mais indicadores derivados (`computeCertificateEffectiveStatus`).
- `@ir/core` (`packages/core/src/nfse`): `IssuerConfigService`,
  `ServiceProfileService`, `DraftService` + `validateNfseDraft` (validação
  interna de pré-emissão).
- Provider Supabase (`apps/sistema/src/providers/supabase/nfse*.supabase.ts`).
- Composição (`apps/sistema/src/composition/nfse.ts`).
- UI em `/sistema/nfse/*`.

### Configurações permanentes (prestador)

Uma única configuração ativa (`nfse_issuer_configs`, sempre a linha mais
recente). Separada em: Prestador (razão social, CNPJ, IM, município, UF,
IBGE), Regime/configuração fiscal (regime tributário, regime especial —
texto livre, exige configuração explícita), Ambiente (homologação/produção —
nenhuma transmissão ocorre em nenhum dos dois nesta fase) e Certificado
digital (só **metadata**: tipo A1/A3, status, validade, referência segura
futura — **nunca o arquivo PFX/P12, senha ou chave privada**; a estratégia
segura de armazenamento será definida só na fase de integração real).

### Perfis de serviço

Evitam preencher toda a configuração fiscal manualmente em cada emissão.
Nenhum perfil nasce com valor fiscal "seed" — todos os campos fiscais
começam vazios. Nunca excluído, só desativado (`active=false`), mesmo
depois de usado em rascunhos.

### Cadastro mestre de clientes / snapshot do tomador

A NFS-e **reutiliza obrigatoriamente** `public.clients` como cadastro mestre
— nunca um cadastro de cliente paralelo. Ao criar/editar um rascunho, os
dados do tomador são copiados do cliente para um **snapshot** independente
(`NfseTomadorSnapshot`, colunas `tomador_*` em `nfse_drafts`). Esse snapshot:

- é sempre um objeto novo, nunca compartilha referência com o `Client`
  original (editar um nunca altera o outro — testado em
  `packages/types/test/nfse.test.ts`);
- é **somente leitura** na tela de NFS-e (ajuste pós-revisão: os dados do
  cliente/tomador NUNCA são editados dentro do módulo NFS-e);
- se algo estiver incorreto/faltando, a tela oferece "Editar cliente"
  (abre o cadastro de Clientes) e, depois de corrigido, "Atualizar dados
  do cliente" (`refreshTomadorSnapshotAction`) recarrega o snapshot do
  rascunho a partir do cadastro mestre — sempre uma ação explícita, nunca
  automática; alterações posteriores em `clients` nunca mudam
  silenciosamente um rascunho já salvo;
- **nunca** escreve de volta em `clients` — não existe (e foi removida)
  qualquer ação de "salvar no cadastro do cliente" a partir da NFS-e.

Mesmo princípio para o snapshot fiscal do perfil de serviço
(`NfseFiscalSnapshot`) — editar o rascunho nunca altera o
`NfseServiceProfile` de origem, e o perfil pode ser desativado ou mudar
depois sem afetar rascunhos já criados. Diferente do tomador, os campos
fiscais do rascunho continuam editáveis (o perfil só sugere o ponto de
partida).

### Descrição do serviço — sempre em branco

Toda nova NFS-e começa com a descrição do serviço vazia. O perfil de
serviço **nunca** preenche a descrição automaticamente — por isso
`NfseServiceProfile` nem tem um campo de "descrição padrão" (removido
ainda na Parte 1, antes de qualquer execução de migration, por ter sido
pensado só pra esse autopreenchimento agora proibido).

### Competência — sem limite fixo nesta fase

A competência do rascunho é livremente editável, inclusive com datas
retroativas — nenhum limite de dias é aplicado na Parte 1. A validação dos
limites efetivamente aceitos pelo Sistema Nacional (quando existirem) fica
pra Parte 2; nenhuma regra fiscal sobre isso foi suposta aqui.

### Rascunhos

Tela única em seções (Tomador/Serviço/Valores/Tributação/Descrição/Revisão)
— nunca um wizard longo. **Não existe botão funcional de "Transmitir"** — a
interface nunca induz o usuário a acreditar que uma NFS-e foi emitida.
Status só tem `"draft"` nesta fase; `authorized`/`rejected`/`cancelled`/
`substituted` só serão acrescentados quando existir integração real de
transmissão (Parte 2+): enquanto não houver transmissão ao Sistema
Nacional, é rascunho — só uma futura ação explícita "Enviar NFS-e"
iniciará a transmissão, e só uma resposta válida/autorização fará deixar
de ser rascunho.

### Numeração — nunca um número fiscal inventado

`nfse_drafts.internal_reference` (ex.: `IR-NFSE-2026-000001`, mesmo padrão
de referência interna já usado por Contratos/Assinaturas/Financeiro) é
**só uma referência de navegação dentro deste sistema** — nunca o número
fiscal da NFS-e, a chave de acesso ou qualquer identificador oficial.
Numeração/chaves oficiais e as regras da DPS serão tratadas só na
integração oficial da Parte 2, em colunas próprias que ainda não existem.

### Permissão

Só **owner/admin** operam o módulo NFS-e nesta fase — reaproveita
`public.is_active_admin_or_owner()` (já existente desde
`20260922100000_owner_admin_operator_roles.sql`, usada por gestão de
usuários e leitura de auditoria) nas policies RLS de
`nfse_issuer_configs`/`nfse_service_profiles`/`nfse_drafts`; nenhuma
infraestrutura de permissão nova foi criada. A navegação (`AdminHeader`/
`MobileNav`) também esconde o menu NFS-e de quem não é owner/admin, mas a
RLS é a barreira real — mesmo padrão já usado por `/sistema/usuarios`.
Futuramente a permissão de emitir NFS-e poderá ser configurável por
perfil (`profiles.role` ganhando granularidade própria pro módulo), mas
isso não existe ainda.

### Auditoria

Reaproveita `public.audit_events` — tabela já existente desde
`20260921101000_audit_events.sql`, mas sem nenhum módulo gravando nela até
a NFS-e. Nenhuma tabela de log nova foi criada. A aplicação grava um
evento (`entity_type`, `entity_id`, `action`, `user_id`, `created_at`) para:

- criação/alteração de configuração fiscal do emissor;
- criação/alteração/ativação/desativação de perfil de serviço;
- criação/alteração de rascunho;
- atualização do snapshot do tomador a partir do cliente.

Nunca registra segredo, certificado, senha ou chave privada em
`metadata`. Na Parte 2, os logs ganharão: tentativa de transmissão,
payload/identificação segura da operação, retorno, rejeição/erro,
autorização, cancelamento, substituição e usuário que transmitiu.

### Validação interna de pré-emissão

`validateNfseDraft` (em `@ir/core`) confere se o rascunho tem o mínimo pra
uma futura transmissão (cliente, tomador identificado com CPF/CNPJ válido —
reaproveitando `isValidCpf`/`isValidCnpj` já usados em Clientes —, município/
UF, perfil de serviço, `cTribNac`, competência, valor > 0, descrição,
configuração do prestador). **Nunca declara o rascunho "fiscalmente válido
perante a Receita/Governo"** — é só uma validação interna. A Parte 2 trará
validação contra parâmetros oficiais/API/XSD do Sistema Nacional.

## Parte 2+ (API Nacional) — não implementada

Fluxo previsto, só documentado:

```
rascunho
  → validação final
  → montar DPS
  → assinar digitalmente
  → transmitir
  → receber NFS-e/rejeição
  → guardar snapshot enviado (congelado)
  → guardar XML e identificadores
  → consultar por chave
  → eventos de cancelamento/substituição
```

A documentação oficial prevê, entre outros: DPS, NFS-e, consulta da NFS-e
pela chave, consulta da DPS, eventos, parâmetros municipais, código nacional
de tributação, código municipal quando aplicável, NBS, local da prestação,
ISSQN. Nenhuma chamada real é feita nesta fase. A arquitetura deve continuar
preparada pra evolução dos layouts oficiais sem exigir refatoração grande.

## IBS/CBS (2027) — não implementado

Nenhum cálculo de IBS/CBS é feito agora. Para optantes do Simples Nacional,
as regras aplicáveis de IBS/CBS passam a produzir efeitos a partir de
01/01/2027, conforme regulamentação vigente na época. A modelagem atual
(campos fiscais como texto livre, snapshot por rascunho) evita ficar rígida
a ponto de exigir refatoração grande quando esses campos forem incorporados
— mas nenhum campo de IBS/CBS foi criado "por antecipação".

## Financeiro — integração futura (não implementada)

NFS-e e Financeiro continuam módulos independentes. Regra aprovada para
quando a Parte 2 existir:

- Uma NFS-e autorizada mostrará as ações "Gerar conta a receber" / "Agora
  não" — nunca cria cobrança silenciosamente. "Gerar conta a receber" abre o
  Financeiro **pré-preenchido**; o usuário ainda define vencimento, condição
  e demais dados financeiros.
- Caminho inverso: o Financeiro poderá localizar/vincular uma NFS-e já
  emitida.
- Uma NFS-e poderá estar relacionada a um ou mais títulos (parcelamento).
  Proteção contra duplicidade será exigida nesse momento.
- **Uma NFS-e cancelada nunca cancela/exclui automaticamente o Financeiro**
  — são auditorias separadas (ver regras já registradas abaixo, herdadas de
  `NFSE-REGRA-FUTURA.md`):
  1. Título financeiro não é nota fiscal.
  2. Pagamento não é nota fiscal.
  3. Cancelamento financeiro NÃO cancela NFS-e automaticamente.
  4. O módulo fiscal terá seus próprios estados e auditoria — nunca
     reaproveita `ReceivableStatus` nem qualquer enum já existente no
     Financeiro.

## Asaas / Pix — integração futura (não implementada)

Provider inicial de Pix definido: **Asaas**. Fluxo aprovado, só documentado:

```
Financeiro → gerar cobrança Pix Asaas → receber QR Code e Pix Copia e Cola
  → enviar ao cliente via WhatsApp → cliente paga → webhook Asaas
  → baixa automática no Financeiro
```

A arquitetura futura do Pix será organizada por *provider* (pra permitir
outro banco depois). O webhook deverá ser idempotente. Nenhum código Asaas
existe nesta fase.

## WhatsApp — integração futura (não implementada)

```
Pix criado com sucesso → usuário escolhe enviar cobrança → WhatsApp envia:
  identificação/referência, valor, vencimento, Pix Copia e Cola, QR Code
```

Nunca enviar mensagem de cobrança antes do Pix ter sido efetivamente criado.
A integração futura deve reaproveitar a infraestrutura Meta/WhatsApp já
existente no projeto — nunca uma solução paralela.

## O que NÃO fazer enquanto este documento estiver assim

- Não implementar transmissão real da NFS-e nem integração HTTP com a API
  Nacional.
- Não implementar certificado digital real, assinatura XML nem XML/DPS
  definitivo.
- Não implementar cancelamento/substituição de NFS-e nem DANFSe.
- Não implementar Asaas, Pix, webhook ou WhatsApp.
- Não implementar geração automática de Financeiro a partir de NFS-e.
- Não implementar retenções tributárias reais nem cálculo de IBS/CBS.
- Não criar tabela/coluna fiscal "por antecipação" além do que já existe.
