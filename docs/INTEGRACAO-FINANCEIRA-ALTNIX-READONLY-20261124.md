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
