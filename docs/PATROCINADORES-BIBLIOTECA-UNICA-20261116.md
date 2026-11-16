# Patrocinadores — biblioteca única no painel, esteira universal intacta

Data: 16/11/2026. Branch: `feat/patrocinadores-biblioteca-unica-20261116`.

## Decisão do proprietário
O usuário NÃO deve escolher grupo, posição esquerda/direita ou sequência de rotação: somente manter as imagens dos clientes atualizadas, em um único lugar. **As seis posições são locais de exibição do site**, não seis formulários administrativos.

## Reaproveitamento comprovado
- **Não recriar a esteira de 07/11**: `apps/site/src/components/site/sponsorConveyor.ts`, `GlobalAdRotation.tsx`, a página inicial e as notícias continuam idênticos.
- `site_ad_slots` (seis registros internos) e `site_ad_media` permanecem como estão, com imagens antigas, `media_asset_id`, configurações individuais, status e ordem preservados.
- Novo envio usa o primeiro slot interno ativo de forma determinística, apenas para armazenar o novo registro; `buildSponsorPool` já combina imagens de todos os slots em uma fila única e distribui pelas seis posições.
- Painel agora tem um único upload e uma galeria única com todas as imagens, permitindo pausar/ativar, excluir e configurar formato/efeito individual.
- Imagens não são recopiadas ou migradas, nenhuma cobrança é criada e o Asaas não é tocado. As imagens publicitárias do portal continuam bônus de veiculação manual.
- Reordenação por grupo não é apresentada porque o operador não deve administrar posições. A exposição igualitária da esteira independe da ordem da biblioteca.
- Se todos os slots forem desativados no banco, upload fica bloqueado com aviso (nunca cadastrar silenciosamente em posição invisível). Imagens de slots desativados ainda são visíveis na galeria com alerta.

## Mudanças de código
- `apps/sistema/src/features/configuracoes/siteAdLibrary.ts`: transforma estrutura herdada em biblioteca unificada, sem escrita;
- `apps/sistema/src/features/configuracoes/SiteAdSlotsPanel.tsx`: um painel com upload único e manutenção individual, reutilizando Server Actions e otimizador de imagens;
- `apps/sistema/src/app/sistema/configuracoes/patrocinadores/page.tsx`: texto coerente;
- `apps/sistema/src/app/globals.css`: galeria responsiva;
- `apps/sistema/test/site-ad-library.test.ts`: testes do modelo com 12 imagens e seis posições de origem.

## Portões de homologação
1. Executar `npx tsx --test apps/sistema/test/site-ad-library.test.ts`, `npm run typecheck --workspace @ir/sistema` e testes existentes; depois abrir versão de homologação autorizada com autenticação.
2. Testar imagens novas e antigas; upload parcial/erro/reenvio; pausa/reativação; efeito/formato; mobile e desktop; portais inicial e notícia.
3. Confirmar que todas as 12 imagens atuais permanecem e passam pelas seis posições com exposição igual, sem duplicação.
4. **Permissões específicas para patrocinadores** serão outro lote: hoje actions e RLS exigem `publicidade.vendas_editar`, inclusive inserção de mídia `media_assets` tem regras próprias. Não basta liberar botão; revisar catálogo, Server Actions e policies em migration autorizada antes de dar acesso limitado a operador.
5. Não executar migration, não trocar domínio, não alterar dados reais e **não publicar na Vercel** até aprovação. PR/merge/release somente após revisão.

**Situação:** código preparado na branch de trabalho; homologação local/CI e visual ainda pendente.
