# Sistema IR — integração de contratações (evolução incremental)

Status: **etapa 1 implementada em branch, NÃO publicada e migration NÃO aplicada**.
Objetivo: um cadastro mestre de clientes; planos e produtos nas áreas existentes;
serviços contratados preservados historicamente; um documento comercial único
quando houver vários serviços; Financeiro e assinador integrados sem duplicação.

## Fonte de verdade (não criar cadastro paralelo)

| Dado | Origem existente |
| --- | --- |
| Cliente, CPF/CNPJ, nome, endereço, contatos e representantes | `clients` |
| Assinaturas impressas, digitais e TV | `subscriptions` |
| Produtos impressos, LED, site e campanhas | `commercial_products` |
| Proposta com N itens e valores negociados | `commercial_proposals` + `commercial_proposal_items` |
| Venda efetivada | `commercial_sales` |
| Cobranças/competências | `receivables` |
| Contratos atuais (institucionais), PDFs, modelos e assinaturas | `institutional_contracts`, `contract_documents`, `contract_templates`, `contract_signature_*` |

Não armazenar uma segunda ficha de cliente no contrato: preencher a partir de
`clients` e capturar os dados efetivamente assinados na VERSÃO IMUTÁVEL do PDF.

## Etapa 1 — não perder itens nas propostas convertidas

Migration nova: `supabase/migrations/20261031100000_commercial_sale_items_snapshot.sql`.
Adiciona `commercial_sales.items_snapshot` (JSONB opcional). Toda proposta
convertida grava fotografia de nome do produto, canal/modalidade, quantidade,
descrição, valor unitário, desconto, total e referência ao item de origem.

- Um único cadastro de produto serve como fonte do nome/canal no momento da conversão.
- Mudanças posteriores no catálogo NÃO alteram os valores da venda.
- O resumo da venda apresenta TODOS os itens separadamente.
- Contratos, termos e vigências já fechados devem ser alterados via futura
  revisão/aditivo. A etapa 1 bloqueia edição dos campos econômicos/período
  das vendas que possuem itens congelados; observações seguem editáveis.
- Venda avulsa/antiga permanece sem `items_snapshot`; nenhuma migração de
  dados automática e nenhum PDF gerado.
- Índice único em `proposal_id` impede duas vendas para a mesma proposta,
  inclusive em concorrência.
- A data de conversão da proposta NÃO deve ser tomada como início da
  prestação de cada serviço no contrato: a proposta atual não armazena
  datas específicas por item. Solicitar antes de gerar PDF.

### Verificação antes da publicação

1. Executar migration em ambiente seguro e conferir políticas/permissões.
2. Rodar `npm -w packages/core test` e `npm -w apps/sistema run build`.
3. Criar proposta *de teste* com LED + impresso, valores e descontos; aprovar.
4. Converter uma vez: conferir item a item, total, vínculo com cliente,
   itens congelados; tentar converter novamente e conferir impedimento.
5. Alterar produto de catálogo e assegurar que a venda histórica não mudou.
6. Confirmar vendas antigas e venda avulsa sem regressão; testar cobrança.
7. Não ativar geração e envio de contratos automaticamente nesta etapa.

## Nova modalidade: locação de equipamentos

O catálogo comercial já identifica `equipment_rental` como canal próprio
(sem criar um segundo cadastro de clientes/produtos). A modalidade é
preparatória: **não gera contrato válido automaticamente** antes de os
campos abaixo serem implementados e os modelos revisados juridicamente.

Dados obrigatórios do termo de locação:

- Qualificação do locador/locatário e de representantes (Cadastro de clientes).
- Inventário por item, etiqueta/patrimônio, marca, modelo e número de série.
- Quantidade, acessórios, fotos e estado/avarias no termo de entrega.
- Datas e horários de retirada/entrega e devolução, local e responsável.
- Preço por diária, semana ou mês, franquias/tolerância, caução ou garantia
  quando contratada, vencimentos e encargos aprovados.
- Responsabilidades por instalação, transporte, energia, uso permitido,
  danos, perda, furto, quebra, reparos, manutenção e seguro (se aplicável).
- Procedimento de vistoria de devolução, atraso, prorrogação, multa
  proporcional e restituição/compensação da caução, se houver.
- Termos de uso e de responsabilidade por dados pessoais tratados pelos
  dispositivos, se a locação envolver armazenamento ou captação de imagens.
- Checklist/recibo de entrega e devolução **separado do PDF jurídico**,
  mas vinculado à mesma contratação e à assinatura de cada parte.

**Regra:** um item do catálogo não substitui o inventário de equipamentos
efetivamente entregues. Antes da assinatura final precisamos de ficha
individual do equipamento e de termo de vistoria, com histórico imutável.
Cláusulas e cobrança de perdas/danos dependem de revisão jurídica.

## Etapa 2 — contratos das três origens, sem reescrever o assinador

Criar ligação versionada entre o contrato e os itens de assinaturas/vendas.
Separar ESTADO DO DOCUMENTO (rascunho, conferido, enviado, assinado)
de STATUS DO SERVIÇO (ativo, suspenso, encerrado). Uma contratação pode ter
N itens e várias competências, sem somar cobranças duas vezes.

- Contratação de assinatura: tipo impresso/digital/TV, periodicidade,
  cópias, endereço de entrega, início/fim, preço e regra de renovação.
- Comercial impresso/portal: formato, locais de veiculação, edições,
  período, preço, descontos, critérios de aprovação da arte.
- LED: cidade, painel, localização, datas e horários, inserções,
  duração e frequência, disponibilidade, conteúdo, manutenção.
- Pacotes: cabeçalho único, N anexos/itens com cláusulas e prazos
  distintos. O operador poderá escolher contratos separados se necessário.
- Nunca preencher data, nome, modalidade ou preço por suposição:
  indicar pendências e bloquear emissão definitiva.

## Etapa 3 — modelos jurídicos e assinatura

Utilizar `contract_templates` versionado e `contract_documents` privado.
Modelos para assinatura do jornal, comercial, LED e pacote combinado.
Cláusulas mínimas: partes e representantes, objeto por serviço, vigência,
entregas, valores, vencimentos, reajuste, cancelamento, obrigações,
responsabilidades, privacidade/LGPD, evidências de aceite e resolução
de conflitos. Revisão jurídica obrigatória dos modelos antes de uso real.
O assinador existente usa convite e comprovante; homologar fluxo completo
de e-mail/WhatsApp, múltiplos signatários e armazenamento sem abrir arquivos
publicamente. Não confundir assinatura eletrônica com ICP-Brasil/PAdES.

## Etapa 4 — usabilidade / operação

- Em cada área, ação **Contratar** preenche dados do cadastro existente
  e condições do plano; não força navegar pelo Financeiro.
- Cliente mostra contratos, serviços, cobranças e anexos numa mesma linha
  do tempo, com acesso conforme permissões.
- Planos podem ser criados, duplicados, editados e desativados. Exclusão
  definitiva somente sem vínculo histórico. Revisões não mudam contratos
  já assinados.
- Roteiro guiado com poucos passos: cliente → serviços → datas/valores →
  prévia → conferência → assinatura → arquivo/Financeiro.
- Testes antes de publicar: CPF/CNPJ, pessoa física/jurídica, permissões,
  datas de início/fim, multi-serviços, modelos, e-mail, download, reenvio,
  cancelamento, histórico, segurança, idempotência, arquivo e cobranças.

**Não aplicar migration nem enviar automaticamente contratos/cobranças reais
sem homologação.** O objetivo é reutilizar módulos atuais, com controle
de escopo e publicações consolidadas.


## Etapa 1B — Inventário de locação e rastreabilidade (23/10/2026)

**Implementado apenas na branch integrada, NÃO no banco de produção:**

- Migration `20261107100000_rental_assets_bookings_inspections.sql`: cria
  `rental_assets`, `rental_bookings`, `rental_inspection_events`.
- Cadastro físico por equipamento, ligado a `commercial_products` com
  `channel=equipment_rental`. Etiqueta/patrimônio únicos, número de série,
  marca, modelo, acessórios, condição e estado disponível/manutenção/retirado.
- Reservas ligadas a `commercial_sales` aprovado/ativo com item de **mesmo
  produto de locação** negociado, sem repetir cadastro do cliente.
- Datas e HORAS de retirada e devolução, responsável, local, diária, total,
  caução e observações. Sem campos presumidos.
- Proteção de `EXCLUDE USING gist` para impedir agendamentos confirmados
  sobrepostos do mesmo equipamento em concorrência.
- Vistoria textual antes da retirada e devolução; registro de acessórios,
  responsável, status e eventos imutáveis. Edição/DELETE da prova são bloqueados.
- Proíbe cancelar uma venda com equipamento emprestado ou reservado e
  encaminhar aparelho reservado para manutenção/baixa.
- Regras de RLS separadas para cadastrar equipamento, gerir reservas e lançar
  vistorias. Link no menu Comercial `/sistema/publicidade/locacoes`.
- Testes de RLS em PostgreSQL descartável e ensaio de todo o schema Supabase
  local, sem acesso ao banco remoto.

**Não entregue ainda:** fotos privadas com bucket protegido e thumbnails,
assinatura do termo de entrega/devolução, vistoria com anexos,
faturamento/regras de caução, multas de atraso, prorrogação, integração
documental com `contract_templates` e assinador, cláusulas legais validadas,
aprovação do cliente, revisão jurídica. O botão de locação NÃO emite
contrato nem movimenta dinheiro por conta própria.

**Próximo bloco:** cabeçalho de contratação comercial, itemizações por origem,
versões do documento, revisão dos prazos por serviço, vinculação à assinatura
eletrônica e inclusão da locação em modelos juridicamente revisados.

## Etapa 2A — preparação por serviço e opção de documento único/separado (23/10/2026)

**Em desenvolvimento na PR #15, NÃO aplicado ao Supabase remoto nem publicado:**

- Migration `20261108100000_commercial_contract_packages.sql` cria
  `commercial_contract_packages` (venda/cliente do cadastro mestre, uma
  contratação por venda, opção `combined` ou `separate`) e
  `commercial_contract_services` (item histórico imutável, modalidade,
  início e término individual, local, objeto/entrega e condições).
- RPC `prepare_commercial_contract` realiza tudo numa transação.
  Duas chamadas concorrentes não duplicam a contratação da venda;
  propostas com múltiplos itens mantêm todos; venda legada gera item
  derivado dos valores históricos, sem inventar datas.
- A tela de detalhe da venda tem nova seção de preparação para selecionar
  contrato único ou separados e preencher cada serviço individualmente.
- Permissões próprias `publicidade.contratos_preparar` e
  `publicidade.contratos_revisar`, negadas por padrão e verificadas na
  Server Action e no banco. Ação de revisão exige objeto, data de início,
  data de término e local obrigatório de LED/locação em TODOS os serviços.
- Rascunhos podem voltar da revisão para ajustes por usuário autorizado.
  Preços, canais e itens de origem não são editáveis; revisão não equivale
  a contrato jurídico aprovado, assinado ou emitido.
- Testes de segurança no PostgreSQL descartável cobrem conjunto único vs.
  separado, ausência de dados, permissão de revisão, imutabilidade e
  módulo oculto. Reconstrução completa do banco permanece necessária.

**Ainda PENDENTE para concluir o módulo:**
1. Campos específicos por modalidade (impresso, site, LED, assinatura e
   locação) com validação de nomes, prazos, frequência, local, responsáveis
   e obrigações, usando os cadastros existentes.
2. Catálogo de modelos jurídicos por modalidade e modelo de pacote;
   revisão jurídica formal das cláusulas pelo responsável legal.
3. Documentos individuais ou combinado efetivamente renderizados em PDF
   paginado, vinculados à contratação, com versionamento e revisão antes
   de geração — não usar `institutional_contracts` como venda comercial.
4. Adaptar assinador já existente para a nova origem comercial,
   assinatura de vários signatários, consentimento, arquivo privado e
   evidências, preservando contratos institucionais e seus PDFs.
5. Roteiro de ativação sem duplicar receivables/PIX, vinculação ao
   cliente, reenvio, cancelamento/aditivos e aceite manual de ponta a ponta.

**Segurança:** qualquer cláusula/prazo não confirmado deve permanecer vazio
e impedir emissão; nenhum documento jurídico ou cobrança é gerado
automaticamente no estágio de preparação.


## Etapa 2B — conferência de documento sem emitir contrato (23/10/2026)

- Prévia somente leitura em `apps/sistema/src/lib/contracts/commercialContractPreview.ts`,
  disponível na tela da venda. Seleção `combined` gera uma conferência
  com todos os serviços; `separate` gera uma conferência por serviço.
- Busca do cadastro mestre do cliente e venda dentro da Server Action; serviços
  e condições vêm dos itens originais e prazos salvos. Valor total da venda
  não é recalculado para aparentar um preço novo.
- Lista cada campo obrigatório em falta, sem inventar início/fim, local,
  objeto ou cláusulas. A conferência sempre identifica
  **MINUTA SEM VALIDADE CONTRATUAL — NÃO ASSINAR**.
- Nada é enviado para assinatura ou salvo no Storage nesta etapa. O revisor
  tem acesso de leitura à conferência com permissão `contratos_revisar`,
  mesmo sem poder editar os dados. A prévia é descartada após salvar
  alterações para impedir informação desatualizada.
- Testes em `apps/sistema/test/commercial-contract-preview.test.ts`
  para pacote único, documentos separados, lacunas e ausência de serviços,
  incluídos no pipeline TypeScript/Build.
- Próxima fase permanece: selecionar modelos jurídicos versionados e
  aprovados, completar variáveis e assinantes, produzir PDF privado
  imutável, associar ao cadastro e adaptar o assinador.

**Pendências futuras registradas para não se perderem:**
- #16 — restaurar estrelinha de capa na matéria e melhorar seleção
  direta do recorte **somente no desktop**, preservando mobile;
- #17 — revisão final de SMTP/convites e quotas do Supabase Pro;
  organização `Suporte Altnix` confirmada no plano Pro, mas envio
  de Auth continua dependendo do serviço SMTP e entregabilidade.

## Etapa 2C — seleção de modelos jurídicos por documento (23/10/2026)

**Implementado somente na branch PR #15. Ainda NÃO publicado:**

- Migração `20261109100000_commercial_contract_template_assignments.sql`
  vincula cada contratação comercial a modelo jurídico **versionado**,
  escolhido explicitamente: modelo `commercial_combined` para o
  documento único; modelo `commercial_<canal>` ou `commercial_generic`
  para cada serviço nos documentos separados.
- RLS deixa os operadores do Comercial lerem SOMENTE modelos da categoria
  comercial; os institucionais permanecem restritos ao Financeiro.
- Rejeita versões antigas, modelos inativos, categorias incompatíveis,
  origem de venda diferente, duplicidade por serviço e alterações após
  encaminhamento à revisão jurídica.
- A revisão não pode começar sem modelo do pacote ou de TODOS os itens,
  nem com dados operacionais obrigatórios pendentes.
- A interface da venda permite selecionar, substituir ou remover vínculo
  em rascunho e preencher valores personalizados declarados no modelo.
  Texto e versão do próprio modelo continuam imutáveis.

## Etapa 2D — PDF de minuta para conferência (23/10/2026)

- Rota autenticada `/sistema/publicidade/vendas/[id]/conferencia-pdf`
  gera **PDF temporário** com modelo versionado + anexo operacional da
  venda, de modo `combined` ou por `?service=<uuid>`.
- Reutiliza o renderizador PDF `buildContractTemplatePdf`, mas NÃO salva
  no Storage, NÃO cria assinatura, NÃO cria cobrança e NÃO gera contrato
  válido para assinatura.
- Texto exibe avisos explícitos **MINUTA PARA CONFERÊNCIA JURÍDICA — NÃO
  ASSINAR** e proíbe geração se faltar objeto, prazo, local obrigatório,
  valor ou placeholder do modelo. Só substitui variáveis declaradas,
  nunca inventa cláusulas ou executa expressões do template.
- Controles separados para leitura e edição; formulário de campos
  personalizados permite informar condições não presentes no cliente,
  mas exige que sejam explicitamente preenchidas e conferidas.
- Incluídos testes de placeholders (`commercial-legal-draft.test.ts`)
  e de RLS/modelos (`commercial-template-sandbox-assertions.sql`).

**Próxima fase, AINDA NÃO entregue:** modelo/variáveis comerciais que
incluam qualificação legal completa da empresa e do cliente (CNPJ/CPF,
endereços, responsáveis, obrigações e vencimentos por modalidade), aceite
e aprovação jurídica formal, documento definitivo imutável com hash,
armazenamento privado e link no cliente, consentimento/assinatura
eletrônica com múltiplos signatários, comprovantes, reenvio, aditivos,
rescisão e integração financeira sem cobrança duplicada.

**Importante:** não considerar uma prévia PDF aprovação legal. Antes de
assinar, o responsável deverá revisar o teor jurídico de cada
modalidade e confirmar as condições exibidas.

## Etapa 2E — escolha automática por modalidade (23/10/2026)

**Implementada na branch integrada, SEM produção.**

- `20261110100000_commercial_contract_auto_templates.sql`: preparação da venda
  seleciona automaticamente, quando inequívoco, o **último modelo ativo**
  de `commercial_combined` para pacote único ou
  `commercial_<serviceChannel>` por serviço individual.
- Sem modelo específico disponível, admite `commercial_generic`
  **somente para documentos individuais**; com catálogo ambíguo ou
  inexistente, deixa a escolha pendente de conferência.
- Uma proposta com **um** serviço sugere um documento individual;
  vários serviços sugerem documento combinado, alterável no formulário.
- Ao alternar combinado/separado, `set_commercial_contract_document_mode`
  remove os vínculos antigos ainda em rascunho e recalcula os modelos
  apropriados numa transação. Itens e valores negociados ficam intactos.
- A chamada repetida de preparação não cria pacote duplicado nem
  substitui modelo já escolhido manualmente. Testado em
  `tests/security/commercial-auto-contract-assertions.sql`.
- **Criação automática:** o trigger `commercial_sales_prepare_contract_draft`
  cria o rascunho e suas condições históricas no momento em que a venda
  entra em `approved`/`active` (sem emitir PDF ou assinar). Propõe um
  contrato combinado para vários itens e um individual para item único.
  Quando o operador possui `contratos_preparar`, vincula também os
  modelos automaticamente. Se o aprovador não tem essa permissão, cria
  apenas o rascunho; um preparador autorizado completa os modelos depois.
  A alteração de outros campos em venda já aprovada não duplica o pacote.
  Contratos de vendas antigas permanecem disponíveis para preparação
  manual/idempotente, sem migração retroativa em massa.
- O catálogo do Supabase real foi consultado SOMENTE em leitura em
  23/10/2026: `contract_templates` retornou **zero modelos**. Portanto
  a escolha é automática no código, mas não poderá ser concretizada
  em produção antes de cadastrar e revisar juridicamente os modelos
  oficiais por tipo de serviço.
- Nenhum PDF jurídico/assinatura é gerado sem modelo e dados completos.

**Atenção:** seleção automática de um modelo ativo não substitui
a aprovação do texto jurídico, conferência da qualificação das partes
nem o consentimento do cliente.


## Etapa 2F — proteção de minuta contra regressão de modelos (23/10/2026)

- Commit `aa5ee459` na PR #15: a rota da prévia PDF também confere se o
  modelo jurídico está ativo, se é compatível com a modalidade e se não há
  versão posterior do mesmo grupo. Antes, a validação era feita na seleção,
  mas o modelo podia mudar entre a escolha e a conferência.
- Trata-se de proteção de **minuta não assinável**; não constitui aprovação
  jurídica nem habilita emissão definitiva.
- **Validação restante:** executar TypeScript, testes e integração em banco
  descartável com modelo ativado, desativado, substituído e incompatível.
- **Próxima implementação:** fluxo formal de aprovação jurídica por versão,
  qualificação obrigatória de ambas as partes, emissão privada imutável com
  hash e ligação comercial ao assinador e ao histórico do cliente, sem duplicar
  títulos financeiros nem alterar os contratos institucionais.
- Nenhuma migration remota ou publicação foi executada nesta etapa.

## Continuidade obrigatória — escopo aprovado (23/10/2026)

A PR #15 é homologação, não liberação de produção. Não confundir **prévia
não assinável** com emissão definitiva ou aprovação jurídica.

### Ordem de entrega preservada
1. **Contratos comerciais:** qualificação completa das partes, modelos jurídicos
   ativos revisados/aprovados, modalidades individual/combinada, parâmetros por
   serviço, PDF definitivo privado e imutável com evidências, vínculo ao cliente,
   assinador com múltiplos signatários, convites, reenvios e histórico. Preservar
   contratos institucionais; não criar contrato artificial para contornar o
   assinador atual. Sem cobranças duplicadas.
2. **Integração das origens:** assinaturas, locação e Comercial/Financeiro,
   com relacionamento aos serviços e títulos existentes, sem duplicar clientes.
3. **Usuários/ativação:** exibir nome cadastrado (não prefixo do e-mail),
   adicionar campo de nome e investigar e-mails de convite/ativação e SMTP.
4. **Editorial:** restaurar a estrela de seleção de capa; melhorar o recorte
   de imagens **exclusivamente no desktop**; mobile permanece como está.
5. **Supabase Pro:** verificar limites antigos locais de upload, quotas,
   SMTP/Auth, tamanho real suportado e erro concreto. Plano Pro não implica
   entrega automática de e-mails. Testar com cautela antes de publicação.
6. **Teste e publicação:** comparar telas e fluxos aprovados, testes desktop/
   mobile, Auth/RLS, integrações e documentos; somente então preparar release
   consolidada com autorização de publicação.

### Etapa 2G — validação do valor histórico antes da minuta
- `commercialContractPreview.ts` bloqueia preparação da minuta com valor
  total inválido ou valor negociado do item ausente/inválido, em vez de
  representar um item com valor indefinido.
- Acrescentados testes para esses dois bloqueios.
- Ainda faltam execução de testes em CI, revisão funcional autenticada,
  validação jurídica, integração do assinador comercial e emissão definitiva.
- Não foram criados documentos assináveis, cobranças ou migrations nesta etapa.

## Etapa 2H — conferência jurídica com qualificação e valores por documento (23/10/2026)

- Validação centralizada de PF/PJ a partir de `clients`: nome/razão social,
  CPF/CNPJ, responsável legal quando PJ, CPF do responsável e endereço completo.
  Pendências são apresentadas na conferência e impedem a minuta PDF e o
  encaminhamento prematuro à revisão pelo formulário (sem inventar dados).
- Placeholders legais `cliente.nome`, `cliente.documento`, `cliente.endereco`,
  `cliente.representante`, `cliente.representante_cpf`, `cliente.qualificacao`
  vêm do cadastro; não são editáveis nos valores livres do modelo.
- `venda.valor` no documento INDIVIDUAL considera somente o item histórico
  daquela prestação; no documento COMBINADO considera a venda completa.
  O sistema não redistribui descontos nem cria títulos financeiros.
- Minutas são sempre **não assináveis** e temporárias; nenhum PDF privado
  definitivo/convite de assinatura é emitido por essa etapa.
- Critérios ainda a homologar: testes de build, casos com cliente sem
  documentos/endereço, vendas com descontos e modelos ativos por modalidade.
  A aprovação jurídica, emissão definitiva e assinador comercial continuam
  explicitamente bloqueados até implementação e testes próprios.

## Etapa 2I — revisão comercial sem campos jurídicos faltantes (23/10/2026)

- Modelo jurídico com variável declarada `required=true` agora precisa ter
  valor não vazio, mesmo que o corpo do modelo não faça referência ao campo.
- A Server Action de encaminhamento à revisão confere, para **todos** os
  serviços/documentos: modelo correspondente, versão ativa e atual,
  categoria compatível, qualificação jurídica, valores e preenchimento de
  marcadores obrigatórios. Não basta existir vínculo no banco.
- A rota da minuta em PDF aplica a mesma validação de variáveis declaradas.
- Alterações de modelo após vínculo impedem conferência, exigindo nova
  escolha em rascunho. Encaminhar não significa aprovação do modelo.
- Esta proteção é aditiva ao RLS/trigger e precisa de ensaio autenticado na
  homologação. Não gera contrato definitivo nem cria signatários.

## Etapa 2J — fonte única de preços por documento

- `commercialDocumentAmount()` resolve valores do histórico de venda de modo
  único e é usada tanto na rota PDF quanto na revisão jurídica.
- Documento combinado usa o total aprovado; documento individual usa apenas
  o valor negociado do item correspondente, sem rateio ou nova cobrança.
- Testes cobrem vendas mistas, valores numéricos válidos, valor ausente e NaN.
