# Estrutura e responsabilidades do frontend

Proposta em 17/09/2026. Nenhuma página foi movida ou redesenhada nesta parte.

## Organização proposta

```text
apps/
  site/src/
    app/                    # Rotas públicas e endpoints públicos necessários
    components/site/        # Apresentação editorial específica do portal
  sistema/src/
    app/sistema/            # Rotas do CMS e administração
    components/             # Layout e navegação administrativos
    features/editorial/     # Telas, formulários e composição visual editorial
    composition/            # Montagem dos serviços com providers
packages/
  types/src/                # Contratos de domínio por módulo
  core/src/editorial/       # Proposto: serviços e contratos de repositórios
  mocks/src/editorial/      # Proposto: fixtures e provider mock
  ui/src/                   # Componentes efetivamente compartilhados
  config/src/               # Configuração comum
docs/                       # Plano, decisões e passagem de contexto
```

A árvore indica destinos, não diretórios já criados. Evitar extrair componentes para `ui` apenas por parecerem reutilizáveis. Páginas coordenam apresentação; serviços concentram regras; persistência fica no provider. Separar acesso ao navegador de módulos que possam executar no servidor.

## Classificação dos itens atuais

`PUBLIC`: experiência do leitor. `ADMIN`: operação interna, mesmo que esteja no portal. `SHARED`: responsabilidade útil a mais de uma área, sem exigir extração imediata. `LEGACY`: referência ou implementação anterior preservada até revisão de uso. Essas classes não representam autorização de acesso.

| Item atual | Classe | Destino / tratamento futuro |
| --- | --- | --- |
| `/`, `/noticias`, `/noticias/[slug]`, `/busca` | PUBLIC | Portal; preservar e redesenhar no lote próprio. |
| `/geral`, `/politica`, `/policia`, `/esportes`, `/saude`, `/sociais`, `/colunistas` | PUBLIC | Portal; editorias e navegação pública. |
| `/sobre`, `/contato` | PUBLIC | Portal institucional. |
| `/jornal-online`, `/jornal-online/[id]`, `FlipbookReader` | PUBLIC | Leitura do jornal; preservar comportamento e acervo. |
| `/api/jornal-online/drive`, `/api/jornal-online/drive-file` | PUBLIC | Suporte atual à leitura; preservar, sem novas integrações. |
| `apps/site/src/app/(public)/materias/page.tsx` (`/materias`) | ADMIN | Cadastro editorial; futura transição para CMS em `apps/sistema`. |
| `apps/site/src/app/(public)/anuncios/page.tsx` (`/anuncios`) e `AdsSlotsManager` | ADMIN | Gestão de quadros publicitários; futura área Publicidade do sistema. |
| `apps/site/src/app/(public)/configuracoes-site/page.tsx` (`/configuracoes-site`) | ADMIN | Referência mock de configurações; futura área Configurações. Não é hoje um editor completo. |
| Início, anúncios e patrocinadores de `apps/sistema` | ADMIN | Preservar rotas; incorporar ao novo layout e à área Publicidade gradualmente. |
| `packages/types`, `packages/config`, componentes básicos adequados de `packages/ui` | SHARED | Reuso por contratos claros; avaliar componente por componente. |
| `newsStorage.ts`, `adsStorage.ts`, `siteSettings.ts` | SHARED | Hoje locais ao portal e usados em leitura/gestão; separar dados, configuração e persistência gradualmente. Não mover agora. |
| `page.legacy.tsx` do jornal digital e `oldsite.html` | LEGACY | Referência histórica; confirmar usos antes de qualquer remoção. |

O grupo `(public)` não adiciona segmento à URL nem constitui proteção de acesso. As três páginas ADMIN permanecem exatamente onde estão nesta etapa.

Componentes como `NewsCard`, `BentoCard`, `BentoGrid`, `NativeAdCard`, `EditorialCard` e `SponsoredNativeCard` deverão ser revisados no redesign em relação à regra de zero cards. A existência deles não obriga a manter sua linguagem visual; não serão substituídos nesta parte.

## Rotas do sistema — proposta para o próximo lote técnico

**Causa:** `apps/sistema/next.config.mjs` declara `basePath: "/sistema"`, enquanto as páginas já estão sob `src/app/sistema`. O prefixo da aplicação se soma ao segmento da rota, indicando `/sistema/sistema` e descendentes. Links Next.js com `/sistema/...` também recebem o prefixo configurado. Diagnóstico estático; ainda sem inspeção em execução.

**Recomendação:** remover apenas o `basePath` no próximo lote técnico autorizado e manter `app/sistema` como único responsável pelo prefixo. Isso preserva a organização existente e os destinos explícitos `/sistema/...`, sem mover todas as páginas.

```text
app/sistema/page.tsx                       → /sistema
app/sistema/anuncios/page.tsx              → /sistema/anuncios
app/sistema/patrocinadores/page.tsx         → /sistema/patrocinadores
app/sistema/editorial/materias/page.tsx     → /sistema/editorial/materias (futura)
```

Na execução futura: revisar links, navegação e recursos estáticos; verificar URLs diretas e confirmar se o caminho duplicado exige redirecionamento de compatibilidade. Não alterar hospedagem, DNS ou roteamento entre aplicações nesta correção. Compartilhar domínio entre os dois apps exigirá planejamento próprio; remover `basePath` não resolve a implantação conjunta.

Alternativa: manter `basePath` e retirar o segmento `sistema` das pastas e links internos. Não recomendada neste momento por exigir mais movimentação. Nenhuma das alternativas foi implementada.

Referência: [documentação oficial de basePath do Next.js 14](https://nextjs.org/docs/14/app/api-reference/next-config-js/basePath).

## Próximas telas previstas, ainda não implementadas

Editorial: `/sistema/editorial`, `/materias`, `/materias/nova`, `/programacao`, `/importar-pdf`, `/editorias`, `/localidades` e `/midias`, sendo os últimos sete caminhos relativos a `/sistema/editorial`.

O layout administrativo terá navegação para Início, Editorial, Clientes, Financeiro, Assinaturas, Publicidade, Aniversariantes, WhatsApp, Entrevistas, Relatórios e Configurações. Só o núcleo Editorial receberá novas funções no Lote 1; demais módulos serão identificados como planejados quando ainda indisponíveis.
