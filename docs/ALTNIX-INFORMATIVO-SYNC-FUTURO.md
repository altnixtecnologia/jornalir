# Sincronização futura: Jornal IR → Altnix Informativo (requisito arquitetural pendente)

Status: **não implementado**. Este documento existe só para registrar a decisão
arquitetural antes de qualquer código real ser escrito — nenhuma migration, tabela
ou coluna foi criada para isso ainda, de propósito (ver Parte 3A do Financeiro:
"não adicionar isso à migration financeira apenas para marcar presença").

## Contexto

Existe outro projeto, **Altnix Informativo**, responsável principalmente por
TVs/painéis/dispositivos/clientes relacionados aos serviços de exibição. Os dois
sistemas vão precisar compartilhar/sincronizar cadastro de cliente no futuro.

## Regras arquiteturais já decididas

1. **`public.clients` (Jornal IR / site-sistema) é o cadastro MESTRE.** Nunca os
   dois sistemas têm cadastros mestres concorrentes.
2. **Direção da sincronização: Jornal IR → Altnix Informativo.** O Jornal IR nunca
   lê/escreve no banco do Altnix Informativo nesta fase (e quando a integração for
   construída, a leitura eventual de volta — se houver — precisa ser desenhada com
   cuidado para não virar uma segunda fonte de verdade).
3. **Só campos COMUNS de cadastro são sincronizados** (identidade, contato,
   endereço — os mesmos já modelados em `public.clients`). Dados operacionais
   próprios do Altnix Informativo (dispositivos, TVs, equipamentos, serviços,
   configurações, playlists etc.) **nunca podem ser sobrescritos ou apagados**
   pelo Jornal IR.
4. **Referência ao cliente mestre.** O cadastro correspondente no Altnix
   Informativo deverá guardar uma referência ao cliente mestre do Jornal IR (ex.:
   uma coluna `external_master_client_id` ou equivalente, **do lado do Altnix
   Informativo** — não do lado do Jornal IR).

## Antes de implementar (passos futuros, nesta ordem)

1. Auditar o schema atual do Altnix Informativo (sem acessar o banco dele nesta
   fase — isso é trabalho de uma fase futura dedicada).
2. Mapear exatamente quais campos são "comuns de cadastro" vs. dados operacionais
   específicos do Altnix Informativo.
3. Definir a estratégia seguridade de upsert (nunca um `DELETE`/sobrescrita cega;
   sempre por `external_master_client_id`, nunca por heurística de nome/documento).
4. Decidir o mecanismo de disparo (webhook, fila, job periódico) — fora de escopo
   decidir agora.

## O que isso significa para o código atual

A estrutura de `public.clients` (módulo Clientes) e do Financeiro (Parte 3A) **não
foi desenhada de um jeito que impeça essa sincronização futura** — o cadastro
mestre continua único, sem nenhum campo que precise ser removido ou reestruturado
para essa integração existir depois. Nenhuma ação é necessária no Jornal IR agora
além de preservar essa propriedade ao evoluir o módulo Clientes.
