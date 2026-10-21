# Jornal IR — abrangências e notificações por cidade/UF

## Decisões (21/10/2026)

**Opções amplas iniciais:** Santa Catarina (SC), Rio Grande do Sul (RS) e Brasil. São registros existentes, NÃO duplicar. A antiga abrangência Geral permanece para as matérias históricas, sem remapeamento ou reenvio.

As categorias continuam: Cidade, Estado, Região, País e Geral. Cada cidade e cada estado terá uma UF explícita, nunca inferida pelo nome. Região, Brasil e Geral alcançam todos os leitores com o canal correspondente habilitado, conforme decisão editorial atual.

| Matéria | Leitor todas | Leitor selecionou apenas cidades SC | Leitor selecionou apenas cidades RS |
| --- | --- | --- | --- |
| Cidade Passo de Torres/SC | sim | só se marcou Passo de Torres | não |
| Cidade Torres/RS | sim | não | só se marcou Torres |
| Estadual SC | sim | sim | não |
| Estadual RS | sim | não | sim |
| Região, Brasil ou Geral | sim | sim | sim |

As modalidades Sem notificação, Normal e Urgente permanecem independentes da abrangência. Sem notificação nunca envia; urgente respeita a preferência geográfica, mas usa o canal urgente e seu som. FCM não comprova leitura.

## Fase 1: cadastro editorial (esta branch)

- Preparar UF em public.localities.state_code, com migração de backfill de 7 cidades e 2 estados existentes, sem alterar IDs, nomes, slugs ou matérias.
- Destacar SC, RS e Brasil no painel; simplificar criar, editar e buscar; exibir UF apenas para tipos Cidade e Estado.
- Preservar a abrangência Geral histórica: mais de 23 mil matérias existentes estão associadas a ela.
- A constraint da migration fica NOT VALID até revisar eventual novo registro sem UF; ativar validação depois.
- A coluna parent_id existente não precisa ser utilizada; UF explícita resolve a segmentação e é mais fácil de manter.
- **Não ativar a fase 1 isoladamente em produção:** frontend espera a migration correspondente.

## Fase 2: preferências do leitor Android

- Adicionar geo_mode (all | selected) em native_push_devices.
- Tabela relacional native_push_device_cities (device_id, locality_id), com PK composta e índice para filtro, somente service_role.
- Preferências de cidades salvas transacionalmente no mesmo cadastro do aparelho, mediante credencial de gerenciamento, validando IDs de cidades ativas.
- Primeira abertura: escolher tudo ou uma/múltiplas cidades antes de solicitar permissão Android. Leitores antigos recebem convite não bloqueante para configurar, mantendo all até alterarem.
- Manter canais normal e urgente e permitir mudar preferências depois.

## Fase 3: roteamento antes de enviar

- No trigger de publicação, registrar snapshot da abrangência (geo_scope, geo_state_code, geo_locality_id) no evento; não mudar público de envio se a abrangência for editada depois.
- Em claim_native_push_deliveries, formar deliveries somente para aparelhos consentidos e elegíveis pela preferência de cidade/UF, sem disparar geral para todos por engano.
- Modo all recebe qualquer abrangência; selected recebe cidade selecionada, estado com ao menos uma cidade selecionada da UF, ou Região/Brasil/Geral.
- Trabalhador revalida desligamento de canais antes do FCM e mantém idempotência por evento e dispositivo, limites, expiração e auditoria.
- Eventos anteriores não devem ser reenviados.

## Fase 4: navegador

Estender a mesma regra às assinaturas Web Push separadamente, usando a identidade própria de cada dispositivo. Não ativar o Web Push dentro do WebView do APK.

## Verificações obrigatórias

- Build/typecheck no preview e inspeção de cadastro/edição no mobile e desktop.
- Simular leitores SC-only, RS-only, ambas UFs e modo todas; testar cidade, estado, região, Brasil, normal, urgente e desativado.
- Conferir fila e dedupe com rollback. Não gerar ou enviar push real para leitores sem aprovação.
- Só aplicar migration e publicar após a validação e autorização da etapa.
