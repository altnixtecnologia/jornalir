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


## 09/11/2026 — Atualização validada e versionada na branch isolada

**Novo estado real:** o upgrade Next 15.5.29 / React 19.1.10 já está **gravado** na branch `security/next15-system-20261108`, inclusive `apps/sistema/package.json`, `package-lock.json`, configuração e codemod de rotas. Commit de origem da migração `3a64bab4172184c84afa06a83b0bf4aac9f188ac`, com **64 arquivos** (62 arquivos de rotas, manifesto do sistema e lockfile). O codemod processou 63 arquivos, mas preservou sem mudança o reexport do endpoint FCM por ser falso positivo.

**Comprovação completa:**
- [GitHub Actions 42546954661](https://github.com/altnixtecnologia/jornalir/actions/runs/42546954661/job/128933896637): codemod oficial, TypeScript e **build Next 15.5.29** aprovados no runner.
- [GitHub Actions 42547296461](https://github.com/altnixtecnologia/jornalir/actions/runs/42547296461/job/128934934360): geração de lockfile, `npm ci` **do lockfile novo**, codemod, TypeScript, quatro suítes dirigidas de assinatura e build completo do sistema **APROVADOS**, depois commit automático apenas na branch isolada.
- [GitHub Actions 42547594082](https://github.com/altnixtecnologia/jornalir/actions/runs/42547594082/job/128935857785): instalação limpa do monorepo confirmou versões distintas: **portal Next 14/React 18** e **sistema Next 15/React 19**; TypeScript e build do portal **PASSARAM** com o novo lockfile. Atenção: portal **não foi atualizado de Next 14**, só comprovou coexistência temporária.
- A workflow com `contents: write` utilizada exclusivamente para materializar as correções foi **removida** após a conclusão. Restam apenas workflows de validação sem deploy.

**Riscos residuais:** compatibilidade funcional com usuários autenticados ainda precisa ser confirmada no navegador em liberação controlada; o cliente Supabase usa tipo transitório `UnsafeUnwrappedCookies` no Next 15, não compatível para Next 16 sem ajuste; também há alias transitório JSX do React 19. O portal continua Next 14 e necessita migração de segurança própria. **Não houve aplicação de migrations, merge na branch de contratos, alteração no PC local nem publicação.**

**Próxima ação:** abrir PR de integração *draft* contra `solicitacoes-financeiro-contratos-irc-20261031`; conferir a revisão antes de aprovar merge. Depois disso, manter o cron de envios desligado, configurar serviços e realizar homologação real no oficial com destinatários controlados antes do deploy definitivo. Não retestar a mesma CI verde sem mudanças.
