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
