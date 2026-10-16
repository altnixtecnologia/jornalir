# Pré-auditoria da futura integração Altnix Informativo → Jornal IR (SOMENTE LEITURA)

Data-base: 16/10/2026. Os dados comerciais no Informativo são testes segundo o responsável; os equipamentos e o acervo editorial do Jornal IR são preservados.

## Bancos independentes e limites

- Jornal IR (site-system-ir): projeto Supabase separado, `public.clients` é **cadastro mestre** de pessoas e empresas. Matérias e edições no portal são definitivas e fora de escopo.
- Altnix Informativo: `public.clients` é **tenant operacional**, não o anunciante. O anunciante é `public.ad_clients`. Não importar `public.clients` nem confundir os IDs.
- Altnix Platform: projeto Supabase isolado, não tocar na implementação desta integração.
- Futuramente, o vínculo deve ser `ad_clients.external_master_client_id` (ou tabela de integração 1:1), nunca reaproveitar IDs operacionais como ID do Jornal nem criar chave estrangeira entre bancos.
- Anunciante recebe somente campos comuns do Jornal (nome, documento, contato, endereço); as mídias, playlists e telas pertencem exclusivamente ao Altnix.
- Financeiro no Altnix: inicialmente consulta *somente leitura* por API autenticada ao Jornal; após migração validada, impedir qualquer criação dupla de cobrança Asaas.
- Relatório de reproduções permanece no Altnix (`get_admin_delivery_report_v2`, `get_client_portal_delivery_range`), sem duplicar eventos no Jornal.
- Mídias continuam no armazenamento atual nesta fase. Migrar depois com piloto e cache offline preservado.

## Quantitativos constatados via SQL read-only (16/10/2026)

| Estrutura Altnix | Quantidade |
| --- | ---: |
| Anunciantes (`ad_clients`) | 16 |
| Equipamentos/telas (`screens`) | 3 |
| Mídias (`media_assets`) | 110 |
| Mídias com anunciante vinculado | 110 |
| Contratos do sistema de testes (`ad_contracts`) | 16 |
| Faturas do sistema de testes (`billing_invoices`) | 11 |
| Anunciantes sem documento | 13 |
| Anunciantes sem e-mail | 13 |
| Anunciantes sem telefone | 12 |

Jornal IR: 1 cadastro e 1 assinatura no momento da consulta. **Não foi importado, alterado ou apagado registro algum.** Esses totais podem mudar.

## Plano de aproveitamento, para APÓS a assinatura estar homologada

1. Gerar um preflight em modo leitura, sem expor CPF/CNPJ/e-mail em logs. Comparar documentos válidos e aprovados; criar lista de revisão manual para os sem identificador. Não fazer mesclagem por nome.
2. Confirmar quais 16 registros são testes e quais precisam permanecer. 110 mídias têm vínculo com anunciante; nunca apagar sem verificar playlists, telas e relatórios de reprodução.
3. Depois de confirmar o mapeamento, criar registros faltantes no Jornal IR via serviço de cadastro existente, com idempotency key por `ad_client_id`, atribuição correta de PF/PJ, revisão dos campos e log de origem. Não inventar CPF/CNPJ ausente.
4. Registrar no Altnix a referência ao master ID; sincronização unidirecional Jornal → Altnix para cadastro comum; eventual status financeiro consulta o Jornal, nunca reescreve o estado técnico da tela.
5. Executar ensaios de ponta a ponta em ambiente de testes, reconciliar contagens, links, mídia e player antes de liberar produção dos dois painéis em uma janela conjunta. Sem aplicar migrations de Platform.

**Bloqueio atual:** assinatura digital e modelos jurídicos precisam ser concluídos primeiro. Importação e mudança de fontes de cobrança ficam para o próximo estágio, por decisão do usuário.
