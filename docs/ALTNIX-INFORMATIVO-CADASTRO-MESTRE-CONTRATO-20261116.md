# Jornal IR e Altnix Informativo — contrato de integração do cadastro mestre

**16/11/2026 — preparação somente; integração de dados e financeiro ainda não ativada.**

## Fontes oficiais e identidades

1. **Jornal IR** é a fonte de verdade dos dados do cliente: `public.clients.id` (UUID permanente), `clients.whatsapp`, telefones, e-mails, documento e demais informações cadastrais. `client_roles` permite que um mesmo cadastro seja assinante, anunciante, cliente de painéis, etc.
2. **Jornal IR** é a fonte de verdade para contratos, vendas, cobranças, pagamentos e regras financeiras por serviço. Preservar snapshots fiscais imutáveis por emissão de NFS-e.
3. **Altnix Informativo** continua responsável pela operação de mídia: telas, playlists, assets, campanhas, exibição, dispositivos, diagnósticos, logs e histórico.
4. Em `Informativo.public.ad_clients`, **`id` permanece o identificador operacional** e **`client_id` permanece o tenant interno**. Não sobrescrever nenhum dos dois com o UUID do Jornal IR. O elo futuro é a coluna separada `ad_clients.jornalir_client_id` (nullable), associada a `Jornal IR.public.clients.id`.
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
