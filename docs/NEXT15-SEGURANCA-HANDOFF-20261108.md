# Atualização de segurança Next.js 15 — experimento isolado (08/11/2026)

**NÃO publicar esta branch nem mesclá-la automaticamente.** Branch de trabalho `security/next15-system-20261108`, derivada de `solicitacoes-financeiro-contratos-irc-20261031`. O pacote/lockfile de produção continua em Next 14.2.33/React 18.3.1. O CI modifica o manifesto **somente no runner descartável** para instalar e avaliar a migração.

## Versões de segurança verificadas

- Next.js **15.5.29** (Maintenance LTS) e React **19.1.10**, em função dos comunicados de segurança até **3 de novembro de 2026**. Next 14.x não recebeu os patches exigidos nas vulnerabilidades recentes.
- Referência: `https://nextjs.org/blog/november-2026-security-release` e `https://nextjs.org/docs/15/app/guides/upgrading/version-15`.
- O app do portal (`apps/site`) também usa Next 14.2.33 e exigirá tratamento próprio antes de uma publicação independente do portal. Não alterar o portal por acidente ao atualizar o administrativo.

## Resultado comprovado

GitHub Actions `https://github.com/altnixtecnologia/jornalir/actions/runs/42545634208/job/128929906254`:
- Instalou Next 15.5.29 e React 19.1.10 com sucesso no runner, sem alterar produção.
- Inicialmente, TypeScript retornou **272 erros JSX namespace** e **8 erros síncronos de cookies/headers**. Tratamento em branch: alias de tipo em `apps/sistema/src/types/react19-jsx-compat.d.ts` sem alteração de comportamento; assinatura externa usa `await headers()`; Supabase mantém temporariamente tipo síncrono suportado no Next 15 para evitar migrar todas as chamadas em cascata. Esses arquivos não foram integrados à branch principal.
- **TypeScript do sistema PASSOU** após correções.
- O webpack compilou com sucesso em cerca de 30s.
- **O build FINAL FALHOU**, porque Next 15 exige `searchParams` como `Promise` em páginas e a primeira detectada foi `apps/sistema/src/app/agenda/page.tsx`. Outras páginas dinâmicas podem exigir `params` e `searchParams` assíncronos. O `next.config.mjs` também tem opções `serverComponentsExternalPackages` e `outputFileTracingIncludes` dentro de `experimental` que devem mover ao escopo raiz no Next 15.

## Próxima etapa focada — sem auditoria ampla

1. Migrar **apenas os arquivos afetados pelas tipagens de `params`/`searchParams`**; usar a orientação e/ou codemod oficial Next 15, preservando os fluxos existentes, incluindo login, editor, NFS-e e contratos.
2. Adaptar `next.config.mjs` no ambiente Next 15 conforme avisos do build.
3. Atualizar manifesto **e lockfile juntos** no branch de segurança, depois executar typecheck + build + testes direcionados. Não fazer alterações destrutivas nem empurrar para `main` sem liberação.
4. Tratar a migração do portal separadamente (também usa Next14), não misturar com a homologação de contratos.
5. Só depois da compatibilidade real considerar merge para branch de contratos. Documento não autoriza aplicar migrations nem publicar o site.

**Importante:** a etapa é maior do que um simples bump de versão. Não pedir ao Claude para fazer auditoria geral. O Claude pode receber apenas tarefa leve de sincronização do VS Code, sem tocar nesta branch de segurança.
