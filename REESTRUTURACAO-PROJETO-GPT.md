# Sistema Informativo Regional — resumo para reestruturação

## Objetivo

Revisar a organização do projeto e propor uma estrutura mais clara para o portal de notícias e o sistema administrativo, preservando as funcionalidades e a identidade visual.

## Tecnologias atuais

- Monorepo com npm workspaces.
- Next.js 14.2.33, React 18.3.1 e TypeScript 5.6.3.
- Tailwind CSS 3.4.14.
- Leitor de PDF com dependências pdfjs-dist e react-pageflip.

## Estrutura atual

```text
Site-sistema/
├── apps/
│   ├── site/          # Portal público: notícias, editorias, busca e jornal digital
│   │   ├── src/app/   # Páginas e endpoints
│   │   ├── src/components/
│   │   └── public/    # Marca, imagens, anúncios e PDFs
│   └── sistema/       # Administração: início, anúncios e patrocinadores
│       └── src/app/
├── packages/
│   ├── ui/            # Componentes compartilhados
│   ├── types/         # Tipos compartilhados
│   ├── config/        # Configurações compartilhadas
│   └── mocks/         # Dados simulados
├── docs/              # Documentos sobre banco de matérias e anúncios
├── package.json
└── tsconfig.base.json
```

## Pontos para revisar

- Separação entre portal público e administração: existem páginas de matérias, anúncios e configurações também no portal.
- Organização de componentes, regras de negócio e acesso a dados.
- Integração entre o conteúdo administrado e o exibido no site.
- Persistência de dados, autenticação e permissões: confirmar a implementação atual.
- Organização das notícias, patrocinadores, anúncios e edições do jornal.

## Pedido ao GPT

Analise esta estrutura e, com o código disponível, proponha uma reorganização simples e sustentável. Mostre:

1. A árvore de pastas sugerida.
2. A responsabilidade de cada aplicação e pacote.
3. O que manter, mover ou unificar, com uma justificativa breve.
4. A ordem recomendada das mudanças.

Nesta primeira análise, priorize visualizar e entender a estrutura proposta antes de implementar alterações. Evite adicionar complexidade ou trocar tecnologias sem necessidade.

> Este resumo foi baseado na árvore de arquivos e nos manifests. A existência dos arquivos não confirma que os módulos estejam completos ou integrados. Para uma análise detalhada, envie também o código-fonte.
