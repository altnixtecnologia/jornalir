# PROMPT — FASE 06 — CADASTRO E EDIÇÃO DE MATÉRIA

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Transformar `/sistema/editorial/materias/nova` e `/sistema/editorial/materias/[id]`
em formulário real, usando os services já existentes (`ArticleService`,
`EditorialSectionService`, `LocalityService`). Sem importar mocks diretamente
nas páginas.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04 e 05)

## Escopo

Campos: título, subtítulo opcional, corpo, editoria obrigatória, localidade,
status (informativo, controlado pelas ações), notificação, posição
editorial/destaque com janela opcional, programação, referência interna
(gerada pelo repositório), imagem de capa e galeria ordenável.

Regras: matéria sempre tem editoria; imagem é opcional; com várias imagens,
uma pode ser marcada como capa; galeria permite reordenar; destaque não
altera a editoria; notificação nenhuma/normal/urgente; programar exige
data/hora; "Salvar rascunho" nunca publica.

Ações: Salvar rascunho, Publicar agora, Programar (todas em criação e
edição) e Arquivar (somente na edição).

Editor de texto: textarea simples isolada em componente próprio, preparada
para receber um editor rico depois, sem instalar bibliotecas pesadas agora.

Imagens: sem upload real. Biblioteca de mídia mock (via um `MediaAssetService`
somente leitura, novo mas mínimo, simétrico aos repositórios já existentes)
permite selecionar capa, adicionar/remover da galeria e reordenar.

Mutações passam por Server Actions ("use server") que chamam `ArticleService`
diretamente no mesmo processo dos Server Components — evita duas cópias
divergentes do estado mock em memória (uma no servidor, outra no navegador)
que existiriam se os services fossem chamados a partir do client component.

## Não tocar / não implementar

Preservar portal, IndexedDB atual, flipbook, jornal digital e
anúncios/patrocinadores. Não implementar Supabase, upload real, OCR/PDF, IA,
autenticação, portal público novo ou notificações push reais.

## Validação

Somente ao final: typecheck do sistema, build do sistema, e validação real
dos fluxos de criação, edição, publicação e programação contra os mocks
(camada de serviço, não apenas a compilação).

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: adiciona cadastro e edicao de materias`

Push apenas da feature branch.
