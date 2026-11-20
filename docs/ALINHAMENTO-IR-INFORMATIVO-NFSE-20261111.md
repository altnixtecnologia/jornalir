# ALINHAMENTO — JORNAL IR, ALTNIX INFORMATIVO E PRIORIDADES (11/11/2026)

**Situação:** decisões funcionais confirmadas; documento de coordenação entre conversas. Não é autorização para alterar produção nem emitir nota fiscal.

## Divisão dos projetos e conversas
- **Nesta conversa / repo `altnixtecnologia/jornalir`:** portal, CMS, sistema administrativo, cadastro único, vendas, contratos, assinaturas, financeiro, cobrança, liberação comercial, NFS-e e aplicativos Jornal IR / IR Controle.
- **Na outra conversa / repo `altnixtecnologia/altnix-informativo`:** mídias, campanhas, listas de reprodução, TV Box, LED, telas, equipamentos, telemetria, economia operacional, e adaptação do Informativo para receber dados e autorizações.
- A **Altnix Platform** continua independente; não incluir geolocalização nela. Os temas de custos/otimização do Informativo seguem exclusivamente na outra conversa.
- Para alinhamento, compartilhar o endereço deste documento e as decisões, sem senhas/chaves/dados fiscais reais.

## Decisão estrutural: Jornal IR é a fonte de verdade cadastral e financeira
**Jornal IR Sistema:** cadastro único PF/PJ, papéis, contato, contratos, produtos, planos, assinaturas, mensalidades, contas a receber, parcelas, cobrança, PIX, pagamentos, conciliação, emissão fiscal, auditoria e **decisão comercial** sobre suspensão/carência/liberação por contrato ou serviço.

**Altnix Informativo:** mantém exclusivamente o cadastro operacional mínimo, anúncios, campanhas, mídias, programação, equipamentos, telas, playlists e métricas de entrega. **Executa** a autorização de veiculação do Jornal IR; não estabelece uma segunda regra financeira autônoma.

### Regras de integração
1. Manter bancos Supabase separados; comunicação servidor-servidor autenticada, com escopo de tenant e permissões; nunca expor chaves service-role aos apps/TV Boxes.
2. Vínculo por identificadores estáveis: `jornal_ir.clients.id` ↔ vínculo próprio ↔ `informativo.ad_clients.id`; **`informativo.ad_clients.client_id` já é tenant interno, não é ID do Jornal IR!**
3. Migrar/conciliar cadastros e pagamentos existentes inicialmente **somente leitura**, preservar registros históricos, impedir duplicatas, resolver ambiguidades antes de migrar faturamento.
4. Jornal IR controla a cobrança; quando a migração estiver homologada, desativar geração de cobrança duplicada no Informativo. Até lá, **não desligar financeiro existente sem corte seguro**.
5. Enviar só eventos de alteração contratual, financeira e de autorização, com idempotência/repetição segura e reconciliação periódica leve — sem polling a cada minuto.
6. Autorizar/bloquear **por contrato/serviço**, não globalmente por cliente: atraso em um anúncio não bloqueia outro serviço em dia. Rever a dependência atual de `ad_clients.payment_status` no Informativo antes de aplicar bloqueio seletivo.
7. Falha temporária de comunicação não é inadimplência. Definir validade da autorização e fallback seguro para os players não pararem.
8. Separar tecnicamente motivos financeiro, administrativo, fraude/segurança e indisponibilidade do equipamento. Documentar trilha de auditoria e rollback.

### Estruturas existentes verificadas (nenhuma integração entre bancos implantada)
- **Jornal IR (Supabase):** `clients`, `client_roles`, `client_digital_export_permissions`, `commercial_sales`, `commercial_contract_packages`, `commercial_contract_services`, `subscriptions`, `receivables`, `receivable_receipts`, `payment_charges`, `billing_provider_settings`, `billing_webhook_events`.
- **Informativo (Supabase):** `ad_clients`, `ad_contracts`, `ad_client_financial_profiles`, `billing_invoices`, `billing_payments`, `billing_products`, `media_assets`, `screens`.
- Coexistência atual de estruturas de cobrança exige conciliação. Preservar receitas separadas por origem (impresso, portal, Informativo), mesmo com visão financeira consolidada.

## PRIORIDADE URGENTE — NFS-e do Jornal IR, semana de 16 a 20/11/2026
O usuário informou que precisará colocar a emissão de notas fiscais em funcionamento na próxima semana. **Prioridade 1 nesta conversa**, adiantando em relação às integrações e ajustes não críticos.

### Diagnóstico confirmado do Supabase (11/11/2026)
Existem tabelas `nfse_issuer_configs`, `nfse_certificates`, `nfse_service_profiles`, `nfse_dps_sequences`, `nfse_drafts`, `nfse_issued_notes`, `nfse_transmission_attempts`, `nfse_cancellation_requests`. Consultas contaram **0 registros** em configurações, certificados, perfis de serviço, rascunhos, notas emitidas, tentativas e cancelamentos. Portanto, **a emissão não está comprovadamente operacional**; estrutura de banco não equivale a fluxo validado. Antes de afirmar prontidão, auditar código da branch de trabalho e ambiente fiscal.

### Plano de execução do módulo de notas
1. Inventariar tela NFS-e, API, credenciais e flags existentes na branch do Jornal IR; diferenciar código existente, rascunhos e funcionalidade desativada.
2. Conferir dados fiscais do prestador, prefeitura/ambiente nacional aplicável, códigos de serviço, exigências e certificados, **sem inventar valores fiscais nem compartilhar segredos**.
3. Conferir dados necessários do cadastro único, fluxo de criação de rascunho e vínculo com venda/contrato/recebível, sem exigir preenchimento redundante.
4. Testar assinatura/numeração DPS, validações, idempotência, envio e retorno; rejeições, consulta, armazenamento de XML e cancelamento conforme regras aplicáveis.
5. Homologar em ambiente de testes com registros adequados; liberar produção só após confirmação funcional/fiscal e autorização do usuário. Não emitir notas reais automaticamente.
6. Preparar rotina operacional objetiva (criar, revisar, emitir, consultar, cancelar), logs e gestão de erros.

## Última sequência do Jornal IR a manter, com nova prioridade
1. **NFS-e URGENTE:** preparar, homologar e colocar em uso seguro.
2. **Cadastros:** a base avançou em filtros, campos fiscais, CNPJ alfanumérico, vínculos e prevenção de duplicidade; finalizar homologação visual e funcional no sistema oficial, preservando registros existentes.
3. **Financeiro + cobranças:** aproveitar `receivables`, `payment_charges`, assinaturas e webhooks existentes; unificar as origens e assegurar conciliação.
4. **Contratos / assinaturas / assinatura digital:** validar pendências, permissões, fluxo completo até cobrança/liberação; sem criar outro módulo paralelo.
5. **Agenda / Pauta / TV:** correções publicadas anteriormente, mas homologação real e ajustes pontuais continuam.
6. **Jornal Online / importação PDF:** fechar fluxo simples de upload único, publicação e rascunhos; validar edição real; notificações padrão às 07:00h do dia seguinte (exceções configuráveis).
7. **Apps:** IPA iOS do Portal Jornal IR compilado no Codemagic, Windows preparado (iTunes/iCloud/Sideloadly), resta instalar/assinar no iPhone e testar; iOS Controle interno separado; Android permanece existente.
8. **Integração Jornal IR ↔ Informativo:** desenho contratual e conciliação agora, implantação gradual após cadastro/financeiro e NFS-e prioritários estarem estabilizados.
9. **WhatsApp compartilhado:** retomar credenciais e webhook/segundo número quando as dependências anteriores permitirem.

**Regras de trabalho:** um módulo por vez; testar e validar em uso real; não sobrescrever trabalho local, stashes ou worktrees; sincronizar VS Code/GitHub antes das alterações; evitar gastos desnecessários e duplicação de código; sem deploy/migration/exclusão/mudança de cobrança ou emissão real não autorizados.

## PROMPT BREVE PARA A OUTRA CONVERSA
> Estamos separando as frentes: esta outra conversa fica somente com **Altnix Informativo** (mídias, telas, equipamentos, custos e adaptação do receptor da integração). No Jornal IR ficou decidido que **cadastro único, contratos, financeiro, cobranças e regras de bloqueio/liberação serão centralizados no banco/sistema Jornal IR**. O Informativo continua operacional e só recebe cadastro mínimo e autorização **por serviço/contrato**, sem duplicar cobrança nem interromper players. Não migre/desligue financeiro atual antes de conciliação e corte seguro. Leia `docs/ALINHAMENTO-IR-INFORMATIVO-NFSE-20261111.md` no repo `altnixtecnologia/jornalir` (branch `docs/alinhamento-ir-informativo-nfse-20261111`). NFS-e passou a prioridade urgente no Jornal IR para a semana de 16 a 20/11; mantenha assuntos fiscais e do portal na conversa do Jornal IR.