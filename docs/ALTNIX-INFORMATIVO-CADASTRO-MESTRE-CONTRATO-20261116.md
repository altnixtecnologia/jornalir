# Jornal IR e Altnix Informativo — contrato de integração do cadastro mestre

**16/11/2026 — preparação somente; integração de dados e financeiro ainda não ativada.**

## Fontes oficiais e identidades

1. **Jornal IR** é a fonte de verdade dos dados do cliente: `public.clients.id` (UUID permanente), `clients.whatsapp`, telefones, e-mails, documento e demais informações cadastrais. `client_roles` permite que um mesmo cadastro seja assinante, anunciante, cliente de painéis, etc.
2. **Jornal IR** é a fonte de verdade para contratos, vendas, cobranças, pagamentos e regras financeiras por serviço. Preservar snapshots fiscais imutáveis por emissão de NFS-e.
3. **Altnix Informativo** continua responsável pela operação de mídia: telas, playlists, assets, campanhas, exibição, dispositivos, diagnósticos, logs e histórico.
4. Em `Informativo.public.ad_clients`, **`id` permanece o identificador operacional** e **`ad_clients.client_id` permanece o tenant interno**. Não sobrescrever nenhum dos dois com o UUID do Jornal IR. O elo futuro é a coluna separada `ad_clients.jornalir_client_id` (nullable), associada a `Jornal IR.public.clients.id`.
5. Os dois Supabase continuam separados, sem acesso direto do navegador ao banco privado do outro sistema.

## Contato e autenticação por WhatsApp

- No Jornal IR, manter separados `clients.phone_primary`, `clients.phone_secondary` e **`clients.whatsapp`**. Código de login, link de portal e avisos por WhatsApp **nunca** devem usar `phone_primary` como fallback.
- A migration do Informativo `20261116164000_ad_clients_whatsapp_destination.sql` acrescentou `ad_clients.whatsapp` somente para operação **transitória** de anunciantes ainda não vinculados.
- A função `resolveOperationalWhatsApp` no Informativo bloqueia qualquer envio usando dados locais **após existir `jornalir_client_id`**, até que um adaptador autenticado confirme o UUID e devolva o WhatsApp oficial do Jornal IR. Não usar esse contrato com dados fornecidos por URL, interface ou cliente não autenticado.
- Depois de vinculados, alterações cadastrais ocorrem no Jornal IR e não são gravadas em duplicidade no Informativo. Campos técnicos operacionais continuam editáveis no Informativo.
- O botão manual de WhatsApp também deve respeitar a mesma origem do número. Em ausência do número canônico validado, mostrar ausência/pêndencia e **não** mandar ao telefone principal.
- O fluxo de login por e-mail permanece independente.

## Estado atual e sequência segura

No último diagnóstico do banco do Informativo: 16 anunciantes, 0 com `jornalir_client_id` e 0 números `ad_clients.whatsapp` preenchidos após a migration. **Não houve migração automática de clientes nem importação de telefones.** Um campo mostrado no formulário não comprova persistência no banco; conferir cadastro salvo antes de qualquer disparo.

1. Criar uma conciliação **somente leitura** de candidatos a cliente, validar documento, tenant, papéis, duplicações, acesso e histórico; nenhum `UPDATE` por coincidência de nome/CNPJ.
2. Construir API **servidor-servidor autenticada e limitada**, inicialmente para consultar contato canônico e estado dos serviços, com auditoria, idempotência, retries e compatibilidade de versionamento.
3. Testar consultas e bloqueios de envio sem SMS/WhatsApp real, sem criar registros duplicados. Habilitar `jornalir_client_id` por lote aprovado apenas quando a leitura canônica estiver funcionando.
4. Centralizar as cobranças progressivamente no Jornal IR, preservando faturas pagas, vencidas e anuladas, e evitando cobranças Asaas em duplicidade. Não usar um `payment_status` global para bloquear mídia quitada de outro serviço.
5. Depois de backup, testes, reconciliação e plano de reversão, habilitar o fluxo de produção autorizado. Preservar sempre mídias, aparelhos e veiculações.

**Fora do escopo agora:** sincronização de dados reais, associação de cliente por documento, novas cobranças, alteração de permissões, envio de códigos, publicação de APK, acionamento de equipamentos ou migração financeira.

## 26/11/2026 — Interface preservada, preparação de consulta

A mesma API cadastral existente passa a preparar o campo WhatsApp canônico apenas na consulta por UUID exato (`id`); buscas por nome não retornam esse campo. Mantidas a trava de release `false`, a flag, o segredo server-side, o consentimento individual e a exigência de cliente ativo. O telefone principal nunca substitui WhatsApp. O Informativo conserva seu layout e formato de dados, com adaptador de leitura e futuras gravações no mestre. Nada é apagado nem replicado fisicamente. Não habilitar a integração, alterar autorizações, emitir cobrança ou publicar sem decisão separada. A documentação financeira de 24/11 registra quatro vínculos já existentes, sem corte financeiro.

## 26/11/2026 — Escrita parcial cadastral Altnix (PR #140, bloqueada)

- API POST /api/integrations/altnix/clients/update preparada para cliente já vinculado, com segredo de escrita separado, trava de release false e flag server-only; sem configuração real. Operador/tenant/anunciante/clientId devem vir do backend Informativo autenticado; grant explícito por essa combinação no Jornal, sem grants criados automaticamente. Revogar exportação também impede escrita. Não usar service_role para chamar save_client com payload incompleto: a função substitui todo cadastro e papéis.
- Migration aditiva preparada: RPC transacional de patch restrito de nome, nome fantasia, telefone/WhatsApp, e-mail, CEP/logradouro/número/complemento; versão updated_at exata, lock e idempotência por operationId/hash, auditoria na tabela existente, sem conteúdo cadastral duplicado no log. CPF/CNPJ, tipo, status, cidade/UF/IBGE, papéis, fiscal e pessoas permanecem exclusivos do Jornal. Mudança de município/documento e criação ainda precisam de fluxo central próprio. Nenhuma operação financeira.
- Testes de contrato e sandbox PostgreSQL de permissões, replay, versão, campos preservados e revogação adicionados; CI pendente, sandbox não equivale ao schema completo. Próximo passo: transportar versão canônica até os formulários, backend Informativo com identidade autenticada e chave idempotente estável, proteção SQL local e provisionamento autorizado de grants. Não habilitar nenhuma trava, aplicar migration remota ou publicar.
