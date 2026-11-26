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

## 26/11/2026 — Criação central de novo cadastro (preparação, sem liberação)

- API de criação preparada reutilizando save_client oficial, validação CPF/CNPJ inclusive alfanumérico, nome/WhatsApp/e-mail obrigatórios, campos comuns e papel fixo anunciante. Município/UF opcionais em par, sem presumir IBGE fiscal. Grant de criação explícito por tenant/ator; grant permite exportar apenas o novo cliente criado, não editar clientes já existentes. Nenhum grant real configurado. Duplicidade de documento ou âncora recusa e reverte transação; nunca associa automaticamente ao cadastro existente. Idempotência reutiliza ledger de operações com tipo create e índice exclusivo para âncora, auditoria sem PII. Criação não produz contrato, fatura ou Asaas.
- Fluxo Informativo ainda não pode criar âncora local: gatilhos comerciais legados precisam ser protegidos para evitar duas fontes financeiras. Próxima etapa: provisionamento idempotente da âncora e reconciliação financeira, sem criar contrato local. Travas create/write/read continuam false, sem publicação. Testes anteriores 2ffac2f aprovados; nova suíte e SQL sandbox pendentes.

## 26/11/2026 — Prioridade: cadastro único e conferência dos vínculos existentes

- Operador reafirmou prioridade cadastral do Informativo e Jornal IR (site/sistema), sem aguardar conclusão de contratos/financeiro. Quatro anunciantes ativos da conta principal têm quatro UUIDs mestres distintos, todos existem e estão ativos no Jornal; comparação de documentos normalizados por hash em consultas somente leitura confirmou 4/4. Não recriar, não associar por nome, não mover IDs. Nenhuma permissão de exportação habilitada (0/4); 1/4 com WhatsApp preenchido no cadastro mestre, 0/4 no legado. Não copiar telefone para WhatsApp.
- Reaproveitar ação administrativa setClientDigitalExportAction/RPC de aprovação existente, separando aprovação de leitura de grants de criação/edição. As tabelas de grants novas ainda não existem no banco real; não aplicar migrations ou autorizar agora. Quatro vínculos prontos para revisão de aprovação após homologação. Cadastro arquivado em outros tenants permanece preservado.
- Prévia de vínculo existente agora preserva CNPJ alfanumérico, exige documento verificável também quando há vínculo informado (sem documento vira revisão manual), não transforma formato em validação fiscal. Testes novos e CI existente ampliada. Informativo PR #67 40477bd integra o formulário Novo cliente à API já preparada, valida dados antes da intenção e mantém âncora pausada até serviço. Sem novo contrato, cobrança, alteração de dados ou deploy.


## 26/11/2026 — Roteiro de homologação e publicação exclusivamente cadastral

**Separar o corte cadastral do financeiro.** Não executar limpeza financeira, criar títulos, ativar bridge financeiro, alterar contratos, mídias, APKs, playlists ou job de faturamento neste lote. Portal público não consulta dados pessoais nem recebe segredos; projetos Vercel Jornal portal e sistema são independentes. A integração usa exclusivamente controle.altnix.com.br, não o portal público.

1. Revisar PR #140 Jornal e #67 Informativo, commits mais recentes e CI (testes de domínio, SQL descartável, TypeScript, builds). Não aprovar apenas por build. Confirmar que as migrations inéditas de escrita/criação do Jornal e guarda/âncora/intenção do Informativo não constam no ledger oficial; se aplicadas, não reescrever, preparar migration incremental. Fazer backup verificado e conferir políticas/assinaturas RPC, rollback e inventário antes de autorização.
2. Conferir os quatro vínculos da conta principal, IDs operacionais e canônicos distintos, CPF/CNPJ normalizado exato, status ativo, registros históricos intocados. Aprovar somente os quatro identificadores já reconciliados pela ação administrativa existente do Jornal (setClientDigitalExportAction). Nenhuma autorização para outros tenants. 0/4 aprovados na última leitura; não alterar em preparação.
3. Homologar consulta com sessão aprovada (admin/owner ou permissão específica), somente IDs locais da conta, rejeição de outro tenant/cliente inativo, revogação da exportação, indisponibilidade sem fallback e WhatsApp explícito por UUID; comparar dados com a ficha mestre. O acesso por código WhatsApp e mensagens para vinculados continuam bloqueados até o fluxo autenticado de envio ser homologado; e-mail existente independente. Não testar com envio real.
4. Homologar escrita/criação/vínculo em ambiente isolado usando dados fictícios: edição parcial preserva documentos/papéis/fiscais, versão e idempotência; criar pessoa/empresa sem cobrança, âncora pausada; reutilizar cadastro aprovado por documento exato sem criar novo cliente; conflito local exige usar ficha existente; falha entre bancos é retomada com a mesma intenção, não gerar outro documento/UUID. A tabela de grants Jornal é restrita a manutenção autorizada: registrar por tenant/ator somente quem possui clients.manage vigente no Informativo; leitura não concede edição. Para edição existente usar grant exato tenant/advertiser/actor/client. Para criação, grant explícito enabled; allow_existing separado para vincular autorizado; allow_edit_created separado para o ator editar somente o cliente que criou. Não dar grants a operadores por conveniência. Conferir rejeições de ator/permissão revogados, cruzamento de tenant e exclusão física antes de publicar.
5. Publicação após aval: primeiro migrations aditivas e versões com travas desligadas, sem alteração de dados operacionais. Validar a leitura piloto restrita aos quatro após autorização administrativa e configuração segura dos segredos e travas (nenhum valor de segredo em logs/docs/browser). Só então corte cadastral por tenant (jornalir_cadastro_cutover) e liberação coordenada escrita/criação com grants específicos, código e envs nos dois projetos. Não ativar flag financeira nem ativar automaticamente serviço, portal, WhatsApp ou contrato. Testar lista/detalhe do painel real, em desktop e mobile, sem criar cliente real não autorizado. Confirmar o Informativo Regional permanente, mídias/telas e sincronização sem chamadas adicionais em heartbeat. Para rollback, desligar UI e criação/escrita antes de reverter versão; preservar anchors/ledger, não reabrir escrita local para vinculados sem reconciliar alterações, não apagar cadastros/IDs ou dados. Nenhuma publicação geral sem autorização.

**Bloqueadores atuais:** permissões de exportação e grants ainda não ativados; SQL/CI das correções em validação; homologação visual/integração real e recuperação de intenção pendente de ambiente de homologação. Se o cliente já possuir intenção mas não houver resposta confirmada, não trocar documento/ator, consultar ledger de ambos os lados; nenhum reset global das intenções. Não apagar nem recriar os quatro clientes existentes.
