# Jornal IR ↔ Altnix Informativo — fase 1, conciliação financeira somente leitura

Atualizado em 24/11/2026. Este documento **não** altera o contrato legado
da API cadastral `/api/integrations/altnix/clients`: sua trava de release
continua desativada e `client_digital_export_permissions` continua intacta.

## O que já foi reconciliado

- Quatro `ad_clients` ativos no Informativo vinculados com seus
  `clients.id` do Jornal, com CPF/CNPJ verificado e UUID local preservado.
- Os anunciantes arquivados não entram na integração.
- Contrato interno `PRV-678161847305` do Informativo Regional é
  `internal_permanent`: jamais criar fatura para ele.
- Legado Informativo: 4 contratos vinculados a anunciantes ativos,
  13 faturas e 4 pagamentos (3 confirmados, 1 cancelado).
- Jornal IR: um recebível cadastrado no cliente Cristian; não há
  correspondência automaticamente autorizada com fatura do Informativo.

## Nova API financeira do Jornal

`POST /api/integrations/altnix/finance-preview`, somente no backend,
exige **todos** os controles antes de qualquer consulta:

- `VERCEL_ENV=production` e
  `JORNALIR_FINANCE_BRIDGE_READ_ENABLED=true` no projeto Vercel
  `jornalir-sistema`.
- `JORNALIR_FINANCE_BRIDGE_SECRET`: mesmo segredo forte de pelo menos
  32 caracteres, configurado exclusivamente no backend de ambos os
  projetos Vercel. Nunca colocar no chat, Git ou `NEXT_PUBLIC_*`.
- `JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS`: lista explícita de
  UUIDs canônicos já confirmados, separada por vírgulas. Não permite
  pesquisar livremente por nome ou CPF/CNPJ.
- `Authorization: Bearer <segredo>`, JSON com
  `canonicalClientId` (UUID permitido) e `offset` inteiro.
- Resposta: estado de recebíveis e seus recibos, IDs e valores, até
  50 por página, com `total`, `offset` e `hasMore`.
  Jamais retorna CPF/CNPJ, endereço, e-mail, WhatsApp, Pix ou chaves.
- Respostas sempre `Cache-Control: private, no-store`, erros sem
  detalhes internos. Não tem POST de escrita, upsert, cobrança, NFS-e,
  troca de permissões, liberação de mídia ou mecanismo de migração.

## Controle de mudança

A flag é desligada por padrão. Sem os envs, a API retorna 503/401;
isso é deliberado. A publicação do código pode ser independente da
liberação para operar; NÃO ativar antes de conferir a ponta receptora,
teste com contas administrativas e proteção de dados.

A equipe deve confrontar os 13 IDs originais de fatura, pagamentos
(inclusive o cancelado), competências, valores, status, contratos,
referências externas e recebíveis canônicos. Nenhuma correspondência
por valor+data sozinha é suficiente para assumir pagamento ou duplicar
cobrança. O corte financeiro será separado por contrato/serviço,
com idempotência, autorização e estado de origem.

## 26/11/2026 — Conciliação de origem, sem corte financeiro

- Consulta read-only em ambos os bancos: 4 vínculos ativos confirmados; nenhuma das quatro identidades tem exportação digital aprovada no Jornal. Não conceder autorização automaticamente a vínculos existentes. 13 faturas legadas (3 pagas, 7 vencidas, 3 anuladas), 4 pagamentos (3 confirmados, 1 cancelado); 2 faturas sem billing_month, 11 com itens, nenhuma com múltiplos contratos na amostra. No Jornal há 1 recebível pago de assinatura com 1 recibo, sem coincidência de source_id/referência com qualquer fatura local. Não é recebível de mídia; excluir da futura projeção operacional do serviço. Nenhum ID pessoal/financeiro individual foi exportado para documentação.
- Contratos locais: 1 comodato interno permanente ativo (nunca cobrar/bloquear), 1 permuta ativa, 2 standard vencidos. Não alterar status existentes durante a preparação. Comercial do Jornal usa commercial_sales e receivables.commercial_sale_id (source_type=advertising), não institutional_contracts para publicidade comum. O modelo de venda atual tem parcelas finitas; vigência mensal renovável, carência, modos especiais e autorização por serviço precisam ser mapeados sem alterar o modo de operação. Não inferir competência a partir do vencimento ou criar recebível novo por valor semelhante.
- Diagnóstico existente ampliado com commercialSaleId, installmentNumber, competencyDate, ID de recibo e indicador de completude (máx. 500 recibos por página; sem truncamento silencioso). Mantém versão 1 como extensão aditiva e flags existentes; não é API operacional de cobrança. Sem escrita, sem permissões novas, sem layout alterado. Testes e build da criação central e edição já aprovados (e4b1aaf); esta revisão ainda precisa de CI. Próximo: vincular explicitamente contratos ao serviço e preparar titularidade por competência, preservando faturas históricas e bloqueios atuais.

## 26/11/2026 — Conciliação comercial: inventário de vendas no contrato existente (PR #140)

- API de diagnóstico finance-preview inclui até 50 vendas do mesmo cliente, inclusive sem recebíveis, com IDs/referência, canal textual, produto opcional, condição, status, vigência e parcelas. Contagem explícita e salesComplete; erro de leitura/contagem ausente não vira lista vazia confirmada. Mantidas autenticação, allowlist, cache privado, flag e ausência de escrita. O canal da venda é snapshot de texto, não comprova vínculo com LED/TV; não inferir por cliente, nome, data ou valor.
- Contrato complementar à PR #67: revisão por venda/contrato e competência, sem ativar financeiro. Versão anterior do consumidor não deve autorizar corte; consumidor atualizado deverá recusar ausência das vendas. Não criar títulos, contratos paralelos, permissões ou charges. Teste de escopo acrescentado ao workflow existente; execução da nova revisão pendente no momento deste registro. Sem alteração de produção, dados, migrations, UI ou APK.


## 26/11/2026 — Decisão revisada: iniciar o financeiro Altnix sem importar testes

- Operador esclareceu às 14:21 BRT que faturas, contratos e demais dados financeiros do Informativo eram de testes e não devem ser importados. Manter cadastros e mídias, vínculos operacionais e funcionamento do Informativo Regional, contrato interno permanente sem mensalidade/vencimento. Não zerar o financeiro existente do Jornal IR: a limpeza refere-se exclusivamente ao legado de testes do Altnix Informativo.
- Inventário read-only no Informativo: 15 contratos de teste além do permanente, 13 faturas e 4 pagamentos; três faturas referenciam Asaas production. Verificar provedor e preservar evidências antes de limpeza; nenhum estorno/cancelamento ou execução em produção autorizado por este registro.
- Direção: reaproveitar commercial_sales, receivables e integração Asaas oficiais para operações novas, sem criar financeiro paralelo, sem importar títulos de teste, mantendo interface existente e regras de serviço/contrato. A API de conciliação e os testes anteriores ficam úteis para verificação e prevenção de duplicidade, mas não exigem correspondência de cada fatura de teste. Guardas de autoridade, provisionamento comercial, recorrência, portal e homologação permanecem pendentes. Não mudar flags, publicar ou limpar registros nesta etapa.
