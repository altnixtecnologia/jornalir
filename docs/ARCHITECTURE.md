# Arquitetura-alvo — JornalIR

Status: proposta documental de fundação, em 17/09/2026. Não implementada nesta parte.

## Fonte funcional e escopo

[PLANO-MESTRE-JORNALIR.md](PLANO-MESTRE-JORNALIR.md) é a fonte de verdade funcional, preservada integralmente. [PROMPT-MESTRE-CODEX-JORNALIR.md](PROMPT-MESTRE-CODEX-JORNALIR.md) orienta os lotes de execução. A autorização desta rodada limita o trabalho a documentação e branch.

Os documentos técnicos organizam a implementação; não redefinem requisitos nem resolvem silenciosamente os pontos em aberto do Plano Mestre. O Lote 1 completo ainda não está entregue.

## Regras da arquitetura

- `apps/site` será exclusivamente a experiência pública: leitura, navegação, busca, edição digital e experiências futuras do leitor.
- `apps/sistema` será CMS + administração, com módulos separados e navegação própria.
- O frontend atual não é referência visual obrigatória. Funcionalidades úteis serão preservadas, mas o frontend será reinventado em etapas. O portal futuro será editorial, mobile-first e sem cards como linguagem visual principal.
- `packages/types` concentra contratos de domínio, independentes de React, Next.js e Supabase.
- `packages/core` poderá concentrar serviços e contratos de repositórios se necessário para manter regras fora da UI. Criá-lo somente no próximo trabalho técnico que justifique seu uso.
- `packages/ui` conterá somente componentes realmente compartilháveis. Layouts específicos permanecem em cada aplicação.
- `packages/mocks` deverá fornecer dados e implementações dos mesmos contratos de repositórios que futuramente serão atendidos por Supabase.
- `packages/config` concentra configurações comuns sem segredos e sem lógica de persistência.
- O futuro IR Core será a fonte única de dados de negócio para site, sistema e app. Será exclusivo do JornalIR, separado do Altnix Informativo e da Altnix Platform. Armazenamento temporário ou cache não será uma segunda fonte oficial.

## Fluxo e dependências

```text
UI / páginas
    ↓
Serviços de aplicação
    ↓
Contratos de repositórios
    ↓
Provider escolhido na composição da aplicação
    ├── mock (próxima implementação)
    ├── IndexedDB legado (preservado, adaptação gradual)
    └── Supabase / IR Core (futuro)
```

Repositório é o contrato de operações; provider é a implementação concreta, não uma camada genérica adicional obrigatória. Serviços recebem repositórios e não importam mocks. A aplicação escolhe a implementação em um ponto de composição, fora das páginas.

Direção proposta: `core` depende de `types`; `mocks` implementa contratos de `core` e usa `types`; aplicações compõem esses pacotes. `ui` não acessa providers nem implementa regras de publicação. Evitar ciclos e abstrações sem necessidade concreta.

## Núcleo editorial

Preparar os conceitos `Article`, `ArticleStatus`, `EditorialSection`, `Locality`, `EditorialPlacement`, `NotificationMode`, `MediaAsset`, `ArticleMedia`, `NewspaperEdition` e `UserRole`.

- Status: `draft`, `adjusting`, `scheduled`, `published`, `archived`.
- Toda matéria pertence a uma editoria; localidade é independente; destaque é exposição temporária, com janela opcional.
- Editorias/localidades serão registros configuráveis, sem exigir alteração de código para cadastrar novos itens.
- Subtítulo, imagem e galeria são opcionais; capa e ordenação são escolhas explícitas quando houver várias imagens.
- Publicação é ação explícita. Conteúdo importado permanece em rascunho; revisão e publicação são etapas separadas.
- Importação PDF terá inicialmente apenas contratos mínimos de candidatos, origem e revisão, sem parser/OCR.
- Identidade e permissões `admin`/`editorial` serão simuladas no Lote 1. Isso não constitui autenticação ou proteção real.
- Prever eventos de auditoria com ator, ação, entidade, identificador, data, antes/depois e contexto. Imutabilidade será garantida no backend futuro; não simular essa garantia com um log local.

## Evolução e preservação

Preservar temporariamente os tipos e fluxos antigos do portal. Introduzir compatibilidade por adaptadores quando o novo domínio for implementado, sem trocar todos os consumidores de uma vez. Preservar anúncios/patrocinadores do sistema até incorporação planejada em Publicidade.

O primeiro núcleo será Editorial. Clientes, financeiro, assinaturas, aniversariantes, WhatsApp, entrevistas, relatórios e configurações manterão fronteiras próprias, sem implementação completa agora. O app também é futuro; não criar seu projeto nesta etapa.

Não atualizar stack, criar banco, migrations, autenticação real, upload remoto, integrações, deploy ou conexões com outros projetos nesta fase. A arquitetura prevê esses destinos sem antecipar sua execução.

Ver [FRONTEND-STRUCTURE.md](FRONTEND-STRUCTURE.md) para classificação e rotas; [DATA-BOUNDARIES.md](DATA-BOUNDARIES.md) para dados.
