# PROMPT — FASE 12 — EDITORIAS, LOCALIDADES E BIBLIOTECA DE MÍDIA

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Completar a gestão de apoio ao editorial: editorias (assuntos), localidades
(cidade/região/geral) e uma biblioteca de mídia funcional — sem storage
real, sem OCR, sem Supabase.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04 a 11)

## Escopo

### Editorias — `/sistema/editorial/editorias`

Listar, criar, editar, ativar/inativar, alterar ordem. Nunca hardcoded na
interface — sempre a partir do serviço. Exemplos iniciais: Geral, Esporte,
Polícia, Política, Economia, Eventos, Cidades.

### Localidades — `/sistema/editorial/localidades`

Listar, criar, editar, ativar/inativar, organizar por cidade/região/geral.
Localidade continua independente da editoria.

### Biblioteca de mídia — `/sistema/editorial/midias`

Ainda sem storage real — usar o provider mock já existente e evoluir o
necessário (cadastro por referência de URL já hospedada, nunca upload de
arquivo). Cada mídia suporta: imagem, referência interna, nome, legenda,
crédito, data, vínculo com matéria quando houver (calculado, não duplicado
como campo). Interface para visualizar, pesquisar, filtrar e selecionar.

### Múltiplas fotos (requisito permanente)

Uma matéria pode ter nenhuma, uma ou várias fotos. Com várias: escolher
capa, montar galeria, ordenar, legenda individual e crédito individual por
uso (sobrescrevendo o padrão da mídia só para aquela matéria). A biblioteca
e o seletor de mídia da matéria devem estar preparados para esse fluxo.

### Visual

Painel funcional, aproveitando bem o espaço: tabelas e listas, não cards em
excesso. Filtros, ações claras, poucos cliques (criar/editar sem sair da
listagem sempre que razoável).

## Não implementar nesta fase

Supabase, storage real, upload remoto, OCR, alterações no parser de PDF,
portal público, app mobile, financeiro.

## Automação

Crie você mesmo:
- `automation/prompts/12-editorias-localidades-midias.md`
- `automation/scripts/12-editorias-localidades-midias.ps1`

Não peça para o usuário criar arquivos manualmente.

## Validação

Somente ao final: typecheck, build do sistema, validação do CRUD mock de
editorias/localidades, validação da biblioteca, validação de capa +
múltiplas fotos + ordem + legenda/crédito.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: adiciona gestao editorial e biblioteca de midias`

Push apenas da feature branch.
