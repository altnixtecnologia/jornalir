# HANDOFF PARA CLAUDE CODE — APÓS PUBLICAÇÃO DO SISTEMA IR

**NÃO EXECUTAR AGORA.** Este roteiro só deve ser enviado à Claude depois da publicação homologada do Portal/Sistema IR, com SHA de `main` e Vercel confirmados. Não realizar migração, importação em massa ou edição de dados reais antes disso.

## 1. Sincronizar o projeto LOCAL (primeiro)

- Repositório oficial: `altnixtecnologia/jornalir`.
- Pasta local usada anteriormente: `C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\Site-sistema` (confirmar pasta ativa antes de operar).
- Verificar `pwd`, `git remote -v`, `git branch -vv`, `git status --porcelain=v1`, `git worktree list`, `git log --oneline -15 --decorate`; identificar o SHA da `main` publicada e alterações locais fora da main.
- Antes de alterar, ler `CLAUDE.md`, `AGENTS.md`, `docs/ACORDOS-E-FONTE-DA-VERDADE.md`, `docs/STATUS-E-HANDOFF.md` e demais handoffs existentes.
- Fazer `git fetch --all --prune` (não faz merge/push).
- Se pasta de trabalho estiver limpa e `main` local puder avançar em fast-forward, atualizar de `origin/main` sem rebase/descarte. Se houver commits/arquivos locais/worktrees divergentes (incluindo `Site-sistema-painel` e cópias preservadas), **parar e apresentar diff e proposta de integração**. Não usar `reset --hard`, `clean -fd`, checkout forçado, stash automático, cherry-pick automático nem apagar backups.
- Não reescrever commits, não fazer push, não mexer em Vercel, Supabase remoto, equipamentos, Asaas, Meta/WhatsApp ou Telegram sem nova autorização.
- Concluir comparando `git rev-parse HEAD` com `origin/main`, rodar testes locais e informar o que foi preservado/pendente.

## 2. AUDITAR matérias do SITE ANTIGO antes de importar

- Site antigo: `https://informativoregional.net`.
- Novo portal, site/sistema: monorepo `altnixtecnologia/jornalir`; dados editoriais mestres no Supabase projeto `site-system-ir`.
- Cuidado: em 23/10/2026 foi consultada a base REAL em modo somente leitura e já havia **23.496 matérias de origem `legacy_site`**, sendo 23.421 publicadas e 75 arquivadas; cada uma com fonte `informativo_regional_legacy`, identificador externo único, `source_url` e `source_hash` preenchidos. Esses números são uma fotografia e devem ser consultados novamente.
- Houve importação inicial de 56 matérias + 168 imagens via Claude em etapa anterior, porém **a base atual já tem mais de 23 mil registros importados**; NÃO repetir a importação inicial nem presumir que faltam décadas de arquivo.
- Tabela `article_external_sources`: índices ÚNICOS `(provider,external_id)` quando id existe e `(provider,source_url)` quando URL existe. Não gerar novos IDs para contornar duplicidade.
- `legacy_migration_batches`: 6 lotes de 2015-2016 até 2025-2026 constavam `complete`; todos tinham contagens de `skipped_existing` altas. Interpretar `complete` como estado declarado, não prova de cobertura externa atual.
- A última matéria marcada como legado estava publicada em 17/10/2026; não pressupor que notícias posteriores já foram copiadas.
- Buscar no repositório scripts/pipeline anteriores de migração (`legacy_import_article`, `article_external_sources`, `legacy_migration_batches`) e o formato do conteúdo do site antigo; reaproveitar a lógica idempotente. Confirmar CMS e disponibilidade da fonte em vez de tentar raspagem indiscriminada.
- Fazer primeiro levantamento **somente leitura**: inventariar URLs/IDs do legado, comparar com `article_external_sources`, separar: já existe idêntica (skip), existe alterada (apresentar diff e pedir aprovação editorial), não existe (candidata a importação), URL quebrada, mídia faltando.
- Preservar títulos, texto original, datas e horários reais, autor, editorias, municípios, galerias, legenda/créditos, fotos e autoria. Não reescrever jornalisticamente nem sobrescrever matérias manuais do portal novo.
- Verificar imagens do legado e objetos R2, links 404, mapas de mídias, permissões de Storage. Não apagar originais nem reimportar mídias só porque a contagem de migração é zero ou baixa.
- Quando autorizado, importar **APENAS as matérias faltantes**, em lotes pequenos e idempotentes, usando mecanismos transacionais existentes, com checkpoints e relatório por ano/URL, sem publicar automaticamente notícias problemáticas ou de revisão pendente.
- Preservar URLs antigos e registrar necessidades de redirecionamento 301 canônico, sem trocar DNS/domínio sem autorização.

## 3. Relatório obrigatório da Claude

Entregar, em português, estas informações:
- Pasta e branch atual, SHA local e `origin/main`, diferença entre ambos, número de arquivos não rastreados/modificados e worktrees preservadas.
- Resultado de typecheck/build local, mudanças adicionais necessárias sem fazê-las em produção.
- Contagem de matérias antigas **já presentes**, fontes distintas, matérias novas identificadas, ausentes/alteradas, imagens existentes/faltantes e bloqueios.
- Lista de URLs/IDs de faltantes para homologação, estimativa de risco e plano de lotes.
- Exibir explicitamente: "NENHUM PUSH, DEPLOY OU ALTERAÇÃO DE SUPABASE EXECUTADO" se não houve autorização específica; se houver aprovação posterior, discriminar cada operação efetuada.
- Não chamar algo de publicado nem sincronizado apenas porque o GitHub/VS Code mostrou atualização: confirmar o SHA do deploy e o conteúdo em produção.

**Importante:** este é um roteiro de handoff, NÃO uma ordem de rodar migração neste momento.
