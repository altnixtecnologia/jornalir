# Bloco 3 — Estrutura de integração Jornal IR ↔ Altnix Informativo

**Estado em 04/11/2026: PREPARAÇÃO SOMENTE.** Não há transferência, integração ativa, liberação de login, migração de mídia, cobrança ou sincronização remota.

## Fontes corretas, conferidas em ambos Supabase (somente leitura)

- Jornal IR: cadastro mestre em public.clients; financeiro em commercial_sales, receivables, subscriptions e payment_charges.
- Altnix Informativo: anunciantes em public.ad_clients; o campo ad_clients.client_id aponta para public.clients do Informativo, que é o **tenant/organização**, NÃO o cliente comercial do Jornal IR.
- Mídias, playlists, telas e exibições permanecem no Informativo: media_assets, playlist_items, playlists, screens, screen_media_playback_events, screen_media_daily_counts.
- O Informativo já possui portal de clientes em ad_client_portals/ad_client_portal_members e RPCs de entrega por período; não recriar a contagem de exibições.
- No Jornal IR, a rota existente /api/integrations/altnix/clients permanece DESLIGADA com trava de código ALTNIX_CLIENT_EXPORT_RELEASED=false. Não habilitar variável nem remover a trava agora.

## Fotografia agregada em 04/11/2026

- 16 anunciantes e 16 registros de portal.
- Os 16 têm mídia com status de arquivo ativo e não excluída; **isso não comprova contratação ou direito de acesso**. Somente 4 têm status cadastral active.
- Apenas 3 anunciantes têm portal habilitado e 3 têm ao menos um membro de portal ativo (os dois conjuntos não foram comparados).
- 171 mídias, 22 playlists, 5.445 contadores diários e 594.727 eventos de reprodução.
- 0 campanhas em campaigns: não depender só desta tabela para detectar mídia digital.

## Estrutura de integração proposta — ainda sem migration

1. Usar o par (source_tenant_id, source_ad_client_id) como identidade de origem. Um único client_id mestre do Jornal IR pode corresponder a vários anunciantes do Informativo em cidades diferentes.
2. Executar futuramente prévia de conciliação por CPF/CNPJ exato, apenas como sugestão. Nunca associar por semelhança de nome, telefone ou e-mail; divergências e duplicidades exigem revisão humana.
3. Após autorização para a migração, registrar vínculo auditável com source_system='altnix_informativo', source_tenant_id, source_ad_client_id, master_client_id, reviewed_by, reviewed_at e status. Não copiar PKs entre bancos.
4. Separar associação de cadastro de **autorização para visualizar**. O IR ainda precisa de vínculo explícito entre usuário autenticado e cliente mestre; profiles, por si só, não contém esse vínculo. Acesso por cliente deve ser validado no servidor.
5. Futuro leitor de exibições será API interna, de escopo estritamente read-only, filtrando anunciante + tenant + mídia/tela + período, com autorização pelo cliente mestre. Não usar chave administrativa no navegador.
6. Somente o IR gerencia títulos NOVOS depois da conciliação. Nada de importar dívida criando cobranças duplicadas, nem de automatizar suspensão. Cortesia, permuta e comodato não geram cobrança automática.
7. Operação existente do Informativo continua ativa, inclusive portal legado, histórico, playlists e aparelhos. Altnix Platform é independente.

## O que foi estruturado neste lote

- apps/sistema/src/lib/integrations/altnixLinkPreview.ts: função pura que prepara status candidate_only/manual_review/confirmed sem buscar, gravar ou transmitir nada; mesmo confirmed não concede acesso.
- apps/sistema/test/altnix-link-preview.test.ts: oito testes direcionados de conflitos, duplicatas, ausência de documentos, múltiplas cidades e prévia sem associação automática.

## Próxima etapa somente depois de nova autorização

A) Prévia da conciliação real sem escrita e aprovação humana; B) estrutura persistente de vínculos e autenticação de cliente; C) endpoint de leitura de exibições e financeiro do Jornal; D) testes isolados e migração progressiva com rollback. Nenhuma dessas etapas é executada por este commit.

Respeitar também docs/ALTNIX-INFORMATIVO-SYNC-FUTURO.md. Sem alterações no repositório Altnix Informativo, seus bancos, equipamentos, mídias, pagamentos ou usuários.


## Revisão do inventário e seleção restrita — 04/11/2026

Conferência direta no banco do Informativo, somente leitura:

- **4 cadastros com status active e documento em formato reconhecido**: 2 CPF (Marcelo Vargas e Cristian Berão) e 2 CNPJ (Altnix Tecnologia e Informativo Regional). Todos têm eventos de exibição; isso NÃO comprova automaticamente que são clientes comerciais aprovados.
- **12 cadastros de teste Codex**: 5 Cliente codex-go-live-* criados em 25/08/2026 e 7 Cliente codex-final-* criados em 26/08/2026. Todos estão archived, sem CPF/CNPJ, com portal não habilitado e sem eventos de reprodução.
- Os 12 testes preservam **12 contratos e 29 mídias com status active**. NÃO deletar cadastros, contratos ou mídias sem investigação e autorização separadas.
- Regra da prévia assistida: **apenas ad_clients.status = active e CPF (11 dígitos) ou CNPJ (14 dígitos)**. Formato não valida dígitos verificadores; vínculo exige aprovação humana.
- Demais ficam excluídos da **prévia normal**, mas preservados para auditoria, sem transferência, exclusão ou liberação de acesso.
- A função pura partitionInformativoAdvertisersForPreview implementa a seleção em memória. No futuro, a consulta real deverá aplicá-la antes de previewInformativoAdvertiserLinks.
- A rota remota permanece bloqueada, ALTNIX_CLIENT_EXPORT_RELEASED=false. Não há integração ou migração ativa.
