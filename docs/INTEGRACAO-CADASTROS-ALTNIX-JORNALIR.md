# Histórico de integração de cadastros — SUPERADO EM 24/10/2026

**NÃO IMPLEMENTAR O PLANO ANTIGO ABAIXO.**

Este documento originalmente sugeria cópia manual nos dois sentidos (Altnix → Jornal IR e Jornal IR → Altnix), com dois cadastros independentes. Essa proposta **foi substituída** pela decisão explícita do proprietário em 24/10/2026:

- **Cadastro mestre e financeiro únicos no Jornal IR.**
- Preparar primeiro **somente o Jornal IR**, sem consumir/escrever cadastros do Altnix.
- Não mudar o repositório, banco, mídia, financeiro, players nem OTA do Altnix agora.
- Não ligar exportação nem suspensão/liberação de mídias. Tudo isso será integrado e publicado **de uma vez, futuramente**, depois de revisar todos os módulos e obter autorização explícita.
- A antiga ideia de botões "Copiar para Jornal IR" e sincronização bidirecional **não está aprovada** e não deve ser implementada por agentes.
- Em Altnix Informativo, `public.clients` é o tenant, e `public.ad_clients` representa anunciantes. Nunca unir tabelas chamadas `clients` apenas por semelhança nominal.

**Fonte normativa atual:**
`docs/ALTNIX-INFORMATIVO-SYNC-FUTURO.md` e issue #18. Este arquivo fica somente como indicação da decisão substituída, para impedir que agentes repitam o planejamento errado.

**Estado:** nenhum envio ou conexão remota autorizada. A PR #15 do Jornal IR permanece draft. Uma branch experimental no Altnix está isolada e **não deve ser usada ou mesclada**, sem novo aval.
