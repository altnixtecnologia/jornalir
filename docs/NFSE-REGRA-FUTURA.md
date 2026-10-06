# NFS-e / emissão fiscal (requisito arquitetural pendente)

Status: **não implementado**. Este documento existe só pra registrar a decisão
arquitetural antes de qualquer código fiscal real ser escrito — nenhuma
integração com prefeitura/Betha/IPM/NFS-e Nacional, nenhuma tabela fiscal e
nenhum cálculo tributário foram criados de propósito (Bloco 2 do módulo de
Contratos Institucionais, item 11).

## Regra decidida

**NFS-e será um módulo independente**, desenvolvido e estudado separadamente
no futuro. O Financeiro (contas a receber, contratos, créditos) **fornecerá
dados** pra esse módulo, mas:

1. **Título financeiro não é nota fiscal.** Um `receivable` representa um
   valor a cobrar — nada mais. A existência (ou não) de uma nota fiscal
   nunca é inferida a partir dele.
2. **Pagamento não é nota fiscal.** Um `receivable_receipt` registra que
   dinheiro entrou — isso nunca emite, substitui ou dispensa uma NFS-e.
3. **Cancelamento financeiro NÃO cancela NFS-e automaticamente.** Cancelar um
   título (`receivables.status = 'cancelled'`) é uma ação puramente
   financeira; qualquer nota fiscal já emitida pra aquele título precisa ser
   tratada separadamente, pelo módulo fiscal, com sua própria auditoria.
4. **O módulo fiscal terá seus próprios estados e auditoria** (emitida,
   cancelada, substituída, rejeitada pela prefeitura etc.) — nunca reaproveita
   `ReceivableStatus` nem qualquer enum já existente no Financeiro.

## O que já foi verificado para não impedir isso no futuro

- Nenhuma tabela fiscal foi criada "por antecipação" — schema novo só quando
  o módulo fiscal for realmente desenhado.
- A arquitetura de títulos/contratos (`receivables`, `institutional_contracts`,
  `contract_documents`) já aceita, sem qualquer mudança, uma futura coluna de
  referência externa (ex.: `fiscal_document_id`) ou uma tabela própria de
  documentos fiscais relacionada por `receivable_id`/`contract_id` — nada no
  modelo atual bloqueia isso.
- Retenção tributária (dedução de ISS/IR/INSS etc. de um recebimento) também
  não foi implementada, mas a arquitetura de `receivable_adjustments`
  (já tipada por `adjustment_type`, testada ao acrescentar `credit_applied`
  sem quebrar nada) comporta um futuro `adjustment_type = 'tax_withholding'`
  sem exigir mudança de schema — só a ampliação do `check` do tipo, quando o
  módulo fiscal/tributário for desenhado.

## O que NÃO fazer enquanto este documento estiver assim

- Não implementar emissão fiscal.
- Não integrar com prefeitura/Betha/IPM/NFS-e Nacional.
- Não escrever código especulativo de API fiscal.
- Não criar tabela/coluna fiscal só por antecipação.
