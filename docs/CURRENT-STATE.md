# Estado atual — JornalIR

Data: 17/09/2026. Levantamento estático; não comprova funcionamento em execução.

## Referência

- Base: `main`, SHA `2bf8a7e272a6f9aa0797261f635ee07f309357f8`.
- Branch de trabalho: `feature/jornalir-core-foundation-20260917`, criada dessa base.
- Monorepo npm workspaces: `apps/*` e `packages/*`.
- Next.js 14.2.33, React 18.3.1, TypeScript 5.6.3 e Tailwind CSS 3.4.14. Sem atualização nesta etapa.
- Arquivos locais anteriores preservados: `REESTRUTURACAO-PROJETO-GPT.md`, `docs/PLANO-MESTRE-JORNALIR.md` e `docs/PROMPT-MESTRE-CODEX-JORNALIR.md`.

## Fotografia funcional

| Área | Situação observada no código |
| --- | --- |
| `apps/site` | Portal público atual: capa, notícias, editorias, busca, institucional e jornal digital. |
| `apps/sistema` | Administração ainda inicial: início, anúncios e patrocinadores. |
| Dados do sistema | Páginas importam arrays de `@ir/mocks` e manipulam estado React em memória; sem persistência nessas operações. |
| Dados do portal | `newsStorage.ts` e `adsStorage.ts` usam IndexedDB (`ir_site_db`, stores `news` e `ads`). Notícias recorrem a dados simulados quando não há registros utilizáveis. |
| Administração no portal | `/materias`, `/anuncios` e `/configuracoes-site` ainda existem dentro de `(public)`; preservar nesta etapa. |
| Jornal digital | Leitor usa `FlipbookReader`, catálogo local e endpoints de Google Drive. Preservar PDFs, rotas, leitura e referências existentes. |
| Compartilhamento | Pacotes `types`, `mocks`, `config` e `ui`; ainda não existe `core`. |

## Pontos para o próximo trabalho técnico

- Possível duplicação de rota: `apps/sistema/next.config.mjs` define `basePath: "/sistema"` e as páginas ficam em `src/app/sistema`. A combinação indica URLs como `/sistema/sistema`; falta confirmação em execução. Solução proposta em [FRONTEND-STRUCTURE.md](FRONTEND-STRUCTURE.md#rotas-do-sistema--proposta-para-o-próximo-lote-técnico).
- `NewsItem` exige imagem e tem categorias fixas; `CmsNewsItem` acrescenta programação/destaque, mas não representa todo o domínio do Plano Mestre. O cadastro atual também exige imagem, diferente da regra nova que permite matéria sem foto.
- Páginas consomem mocks e armazenamento diretamente. Não há ainda a separação completa UI → service → repository → provider.
- A tabela compartilhada atual pressupõe status `ativo/inativo`; não atende diretamente aos cinco estados editoriais.
- Documentos antigos de banco são propostas históricas, não migrations aplicadas. Seus exemplos de categorias/status não substituem o Plano Mestre.
- Existem arquivos `page.legacy.tsx`, `oldsite.html`, logs e `*.tsbuildinfo` rastreados. Nenhuma limpeza nesta parte.

## Limites da verificação

Foram lidos manifests, configurações, páginas e módulos centrais, além dos documentos existentes. Não foram executados build, typecheck, servidor, testes ou chamadas às integrações operacionais. O Git emitiu aviso de acesso negado ao ignore global do usuário; a consulta ao estado do repositório retornou normalmente.
