# PROMPT — FASE 07 — EDITOR EDITORIAL DE TEXTO

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Evoluir o cadastro/edição de matéria (Fase 06) sem mexer em backend real:
título/subtítulo ganham um controle discreto de formatação pontual, e o
corpo passa a ter um editor funcional leve no lugar do textarea simples.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04, 05 e 06)

## Escopo

### Título e subtítulo

Manter o padrão editorial automático. Adicionar um botão pequeno e discreto
("Aa") ao lado do rótulo com um painel de ajustes limitados: negrito,
itálico, tamanho (padrão/grande/extra grande) e peso/ênfase
(normal/média/forte). Não é um editor livre — título e subtítulo continuam
campos de texto simples (`<input>`), o estilo é aplicado como metadado
separado (`titleStyle`/`subtitleStyle`, novo campo opcional em `Article`),
nunca como marcação dentro da própria string do título.

### Corpo da matéria

Substituir o textarea por um editor leve (Tiptap/ProseMirror, headless, sem
UI própria) com negrito, itálico, subtítulo interno (heading nível 3),
listas com marcadores e numeradas, link, citação, alinhamento
esquerda/centro/justificado e desfazer/refazer. O corpo continua sendo uma
`string` em `Article.body` (agora HTML gerado pelo editor) — nenhuma
mudança de tipo ali, compatível com conteúdo futuro importado de PDF.

## Regras

- preservar o conteúdo já existente (matérias mock antigas com corpo em
  texto puro continuam abrindo corretamente, sem transformação forçada);
- alterar `ArticleService` apenas onde é realmente necessário
  (`CreateArticleInput` ganha `titleStyle`/`subtitleStyle` opcionais; nenhuma
  regra de publicação/programação/arquivamento muda);
- não quebrar criação, edição, publicação, programação ou arquivamento já
  entregues nas Fases 05/06;
- sem upload real, sem Supabase.

## UX

Adicionar aviso de alterações não salvas: `beforeunload` ao fechar a
aba/atualizar, e confirmação ao usar o botão "Voltar à listagem" (que passa
a viver dentro do próprio formulário, onde está o estado de "sujeira").
Navegação pela barra lateral não é interceptada nesta fase — documentar como
limite conhecido, não implementar um guard de rota global.

## Não fazer

Supabase, upload real, OCR/PDF, IA, autenticação, novo portal público,
notificações push reais.

## Automação

Crie você mesmo:
- `automation/prompts/07-editor-texto.md`
- `automation/scripts/07-editor-texto.ps1`

Não pedir nenhum arquivo manual ao usuário.

## Validação

Somente ao final: typecheck, build do sistema, e teste real de criação e
edição com formatação (camada de serviço, reproduzindo o que as Server
Actions fazem) confirmando que o conteúdo formatado é preservado ao
salvar/reabrir — inclusive para matérias antigas com corpo em texto puro.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: adiciona editor editorial de texto`

Push apenas da feature branch.
