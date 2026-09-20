# PROMPT — FASE 15 — FLUXO EDITORIAL COMPLETO DO PAINEL

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Fechar o caminho completo da matéria dentro do painel, principalmente as
vindas do PDF, sem deixar vínculos soltos: PDF → candidato → revisão →
conversão → rascunho → edição → editoria/localidade → múltiplas fotos →
capa/galeria → destaque/placement → edição/página → agendamento/publicação.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04 a 12)
- `docs/PDF-REAL-VALIDATION.md`

## Escopo

### PDF → matéria

Preservar tudo já validado (extração exata, merge/split, descartar, avisos,
rastreabilidade, página de origem). Importação nunca publica automaticamente
— sempre `draft`.

### Vínculo com a edição

Toda matéria importada mantém edição, página, origem e referência interna,
visíveis claramente (ex.: "Edição 037 · Página 6"). Preparar o vínculo
futuro "Ver esta matéria na edição digital" sem inventar URL quando ela
ainda não existir (usa `NewspaperEdition.pdfUrl` quando presente).

### Matéria completa

Título, subtítulo, corpo, editoria, localidade, status, notificação,
destaque/placement (com início/fim quando usado), publicação imediata,
agendamento, edição/página quando houver, origem, referência interna.

### Multi fotos

0, 1 ou várias fotos. Por imagem: capa ou galeria, ordem, legenda, crédito.
Trocar capa, reordenar, remover, selecionar da biblioteca — sem perder isso
no fluxo vindo do PDF.

### Destino editorial

Área derivada (nunca regra nova no frontend) mostrando editoria,
localidade/região, destaque quando houver, publicação e vínculo com edição
digital quando existir. Usada tanto na edição da matéria quanto na revisão
do candidato.

### Listagem de matérias

Evoluir `/sistema/editorial/materias`: origem (manual/PDF), edição/página,
editoria, localidade, status, destaque, notificação, quantidade de fotos,
publicação/agendamento — com filtros úteis para esses campos.

### Revisão do PDF e não duplicação

Deixar claro texto extraído, página, confiança/avisos, editoria,
localidade, fotos sugeridas e destino depois da conversão. Um candidato já
convertido nunca pode virar uma segunda matéria — nem pela interface (botão
escondido) nem pelo serviço (rejeição explícita), sempre oferecendo abrir a
matéria já criada.

### Mobile

Todo o fluxo desta fase (listagem, edição de matéria, revisão de PDF,
multi-fotos) funciona no celular, sem overflow horizontal, com ações
principais acessíveis. Ainda não é a fase de redesign definitivo do painel.

## Não implementar nesta fase

Supabase, auth real, integração Altnix, publicidade/playlist, financeiro,
CRM, redesign do painel inteiro, alterações no parser de PDF sem
necessidade real.

## Automação

Crie você mesmo:
- `automation/prompts/15-fluxo-editorial-completo.md`
- `automation/scripts/15-fluxo-editorial-completo.ps1`

Não peça para o usuário criar arquivos manualmente.

## Validação

Somente ao final: typecheck (sistema + site), build do sistema, validação de
negócio reproduzindo o fluxo completo com um PDF real do acervo (script
`tsx` temporário, removido ao final, nunca commitado) — incluindo a
rejeição de reconversão de um candidato já convertido.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: completa fluxo editorial do painel`

Push apenas da feature branch.
