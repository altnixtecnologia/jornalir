# Plano de preparação da integração Jornal IR ↔ Altnix Informativo — 16/11/2026

**Status: ESPECIFICAÇÃO / SEM ATIVAÇÃO.** Este documento não libera integração, deploy, migration, cobrança, emissão fiscal, mudanças em players ou alterações no repositório Altnix Informativo.

## 1. Referências e precedência
- [Alinhamento 11/11](ALINHAMENTO-IR-INFORMATIVO-NFSE-20261111.md), [preparação e bloqueios](ALTNIX-INFORMATIVO-SYNC-FUTURO.md) e [prévia de conciliação](INTEGRACAO-ALTNIX-INFORMATIVO-BLOCO3-ESTRUTURA-20261104.md).
- Reutilizar `apps/sistema/src/lib/integrations/altnixLinkPreview.ts` e respectivos testes; não criar motor de conciliação concorrente.
- A prioridade operacional do Jornal IR na semana 16–20/11 continua NFS-e. Este documento não altera a ordem de publicação nem autoriza emissão real.
- Antes da futura implementação, revisar branches, PRs, migrations e esquemas efetivos, pois a documentação reflete verificações históricas e pode estar desatualizada.

## 2. Fronteiras e fontes de verdade
| Domínio | Autoridade | Destino/observação |
| --- | --- | --- |
| Identidade comercial PF/PJ | Jornal IR `public.clients` | Informativo recebe no futuro somente dados operacionais mínimos necessários |
| Vendas, contratos, serviços, assinaturas | Jornal IR | Cada autorização mapeia um serviço contratual específico |
| Recebíveis, cobranças, parcelas, pagamentos, notas | Jornal IR após corte seguro | Preservar histórico e operação financeira preexistente do Informativo até conciliação aprovada |
| Mídias, playlists, campanhas, telas, dispositivos, reprodução | Altnix Informativo | Não replicar ativos binários, alterar players nem recalcular contagens no Jornal |
| Decisão comercial de veiculação | Jornal IR futuramente | Informativo executará por vínculo específico, nunca por saldo global de cliente |
| Patrocínio bônus do portal IR | Operação manual do Jornal IR | Isento de regra de cobrança/suspensão automática |
| Altnix Platform | Projeto independente | Fora deste escopo |

**Advertência de IDs:** `Informativo.public.clients` é tenant/organização, e `Informativo.ad_clients.client_id` referencia esse tenant. NUNCA relacionar esse campo diretamente a `JornalIR.public.clients.id`.

## 3. Identidade e conciliação, somente leitura primeiro
- Identificador de origem: (`source_system=altnix_informativo`, `source_tenant_id`, `source_ad_client_id`); destino: `master_client_id` do IR. Suportar um cliente IR com vários anunciantes em tenants diferentes.
- Reaproveitar `previewInformativoAdvertiserLinks` e `partitionInformativoAdvertisersForPreview`. Apenas `ad_clients.status=active` com CPF/CNPJ no formato previsto entram na prévia normal; dados arquivados continuam preservados para auditoria. Formato de CPF/CNPJ não prova validade.
- Correspondência exata por documento é **candidato**, nunca aprovação. Duplicidades, divergências e ausências exigem decisão de operador autorizado e trilha de auditoria. Não vincular por nome, telefone ou e-mail.
- Modelo de vínculo **proposto, ainda não persistido**: `source_system`, `source_tenant_id`, `source_ad_client_id`, `master_client_id`, `status`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at` e unicidade por origem. Planejar revogação e histórico, sem sobrescrever registros existentes.
- Um vínculo cadastral confirmado não é autorização de portal nem de veiculação.

## 4. Serviço e alvo: granularidade obrigatória
- Identificar a linha comercial efetiva existente (avaliar `commercial_contract_services`, itens de vendas/contrato e assinaturas) antes de introduzir nova estrutura.
- Para futura autorização: `master_client_id`, `contract/service_id`, identificador operacional do anunciante/tenant, alvo(s) específico(s) do Informativo (mídia, playlist, tela conforme capacidade real), período, versão da decisão, motivo, aprovador e auditoria.
- Não deduzir direito de acesso por quantidade de mídias, campanha, cadastro ativo ou mero vínculo de CPF/CNPJ.
- Situações distintas: pago, parcial, atraso, carência, contestação, acordo, cancelamento, estorno, cortesia, permuta, comodato; apenas política explicitamente aprovada pode produzir autorização comercial. Não fazer suspensão global por `payment_status` de anunciante.
- Alteração em contrato A não altera mídia de contrato B. Suspensão e restauração exigem prévia do impacto, revisão autorizada, confirmação de quitação aplicável e reversão auditável.

## 5. Fronteira técnica futura (NÃO IMPLEMENTAR AGORA)
- Bancos Supabase separados, servidor-servidor autenticado, escopo de tenant/anunciante e menor privilégio; sem service-role em browser, app ou player.
- Reaproveitar a rota `/api/integrations/altnix/clients` apenas após revisão futura. Preservar `ALTNIX_CLIENT_EXPORT_RELEASED=false` e quaisquer outras travas; não habilitar env.
- Contrato conceitual de eventos: `event_id`, `event_type`, `schema_version`, `occurred_at`, `tenant_id`, `master_client_id`, `source_ad_client_id`, `service_id`, `authorization_version`, `effective_at`, `payload_minimal`; validar schema real antes de implementar.
- Idempotência por `event_id` e versão por serviço, tratamento de eventos fora de ordem, confirmação e reprocessamento auditável. Sem polling por minuto, sem trigger remoto, outbox ou webhook neste lote.
- Consulta futura dos relatórios de reprodução: API interna **somente leitura**, autorizada por usuário↔cliente mestre, tenant/anunciante, mídia/tela e período; aproveitar RPCs/contadores do Informativo, sem duplicar a telemetria.
- Falha de rede nunca equivale a inadimplência. Estudar validade e fallback das autorizações e reconciliação de dispositivos offline, sem alterar OTA ou exibição nesta fase.
- Separar suspensão financeira de bloqueio administrativo, incidente de segurança e indisponibilidade técnica.

## 6. Acesso do cliente
- Revisar o mecanismo de autenticação e o vínculo explícito usuário↔cliente mestre, com checagem no servidor e RLS adequada, sem inferir associação apenas de `profiles`.
- Preservar portal legado do Informativo até uma transição com aprovação, para relatórios, mídias e solicitações de substituição; no futuro escolher navegação integrada sem liberar dados de outro anunciante.

## 7. Homologação do lado Jornal (ordem proposta, sem execução agora)
1. Inventariar no branch oficial de trabalho os vínculos reais entre `clients`, `commercial_sales`, `commercial_contract_packages`, `commercial_contract_services`, `subscriptions`, `receivables`, `receivable_receipts`, `payment_charges` e permissões existentes.
2. Verificar consistência de `client_id`, IDs estáveis por serviço, duplicidade de parcelas/cobranças e status fiscais/financeiros, apenas consultas de leitura.
3. Executar prévia de conciliação com amostra controlada, inclusive tenants distintos, homônimos, CPF/CNPJ ambíguo, arquivados/testes e divergência de documento, sem persistência.
4. Especificar modelo de vínculo e autorização, RLS, auditoria, mecanismo de revogação e plano de rollback; submeter para aprovação antes de qualquer migration.
5. Construir testes isolados e CI da integração desativada; validar que nenhuma rota remota, cobrança, mídia ou player é afetado.
6. Revisar integração de cobranças e NFS-e, preservando a prioridade de homologação do módulo fiscal; não emitir notas reais por testes.
7. Produzir relatório de prontidão e contrato de interface final para a conversa/repositório Altnix Informativo.
8. Somente depois: auditoria read-only do Informativo, implementação receptor em branch própria, laboratório controlado, corte financeiro planejado e release conjunto com autorização.

## 8. Critérios mínimos de aceite antes de acionar o Informativo
- Cadastro mestre sem ambiguidade; vínculos de cliente aprovados e reversíveis.
- Cada serviço comercial e seu alvo digital rastreáveis, inclusive várias telas e múltiplos anúncios por cliente.
- Financeiro demonstrando conciliação de pagamentos parciais, PIX duplicado, contestação, estorno, cobranças de outro serviço e legado sem duplicidade.
- Autorização e visualização segregadas por tenant/serviço, regras de suspensão seletiva e cortesias validadas.
- Testes de falha de comunicação e offline especificados sem impacto na exibição atual.
- Segurança/RLS, logs e rollback revisados.
- Aprovação explícita do proprietário para iniciar fase receptor/integração; **nenhuma preparação documental equivale a essa aprovação**.

## 9. Instrução para a outra conversa (somente após aceite do IR)
Auditar `altnixtecnologia/altnix-informativo` em modo leitura e confrontar com este documento e `docs/ALINHAMENTO-IR-INFORMATIVO-NFSE-20261111.md`. Mapear tabelas, regras `ad_clients.payment_status`, contratos/cobranças legados, portal e RPCs de reprodução. Propor adaptação mínima do receptor com implantação desativada; não alterar operação, bancos, players, env, Vercel nem financeiro do Informativo até autorização específica.
