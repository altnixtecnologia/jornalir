# PROMPT MESTRE — CODEX — JORNALIR / FASE DE ESTRUTURAÇÃO

Você atuará como **engenheiro de software sênior / arquiteto de aplicações**, responsável por estruturar profissionalmente a nova plataforma do **Informativo Regional** no repositório existente:

`altnixtecnologia/jornalir`

Você receberá junto com este prompt o arquivo:

`PLANO-MESTRE-JORNALIR.md`

Esse documento é a **fonte de verdade funcional do produto**. Leia-o integralmente antes de alterar código. Não simplifique requisitos importantes, não invente integrações que ainda não foram aprovadas e não transforme decisões em “ideias futuras” quando o plano já as define.

---

# 1. OBJETIVO DESTA ETAPA

Estamos construindo uma plataforma maior, composta futuramente por:

- portal público de notícias;
- sistema interno do jornal;
- CMS/editorial;
- clientes;
- assinaturas;
- publicidade;
- financeiro;
- aniversariantes;
- aplicativo Android/iOS;
- notificações;
- WhatsApp;
- entrevistas/podcast;
- edição digital do jornal;
- integrações futuras com o Altnix Informativo.

**Mas nesta primeira passagem do Codex NÃO é para construir tudo.**

Seu trabalho agora é:

1. entender profundamente o repositório atual;
2. preservar o que já funciona;
3. organizar a arquitetura para crescimento;
4. criar uma fundação limpa e profissional;
5. estruturar o sistema interno;
6. começar pelo núcleo editorial/CMS;
7. usar dados simulados e contratos tipados;
8. preparar o código para que depois possamos conectar Supabase sem reescrever o frontend;
9. deixar um handoff claro para uma revisão posterior com Claude;
10. não fazer integrações reais ainda.

O desenvolvimento será feito em **lotes pequenos e controlados**.

**EXECUTE APENAS O LOTE 1 NESTA RODADA.**
Não avance para o Lote 2 sem autorização explícita.

---

# 2. CONTEXTO TÉCNICO ATUAL

O repositório já é um monorepo npm workspaces.

Estrutura conhecida:

```text
jornalir/
├── apps/
│   ├── site/
│   └── sistema/
├── packages/
│   ├── config/
│   ├── mocks/
│   ├── types/
│   └── ui/
├── docs/
└── package.json
```

Tecnologias atuais relevantes:

- Next.js 14.2.x
- React 18.3.x
- TypeScript 5.6.x
- Tailwind CSS 3.4.x
- App Router

O site já possui, entre outras coisas:

- rotas públicas;
- editorias;
- página de notícia;
- busca;
- jornal online;
- leitor/flipbook do jornal;
- rotas relacionadas ao Google Drive;
- publicidade experimental;
- componentes existentes de homepage;
- PWA/manifest/service worker em estágio inicial.

O sistema interno ainda é pequeno e possui páginas como anúncios e patrocinadores.

## Regra de compatibilidade

**Não atualize Next.js, React, Tailwind ou TypeScript nesta fase.**
Não faça “modernização de dependências” sem necessidade funcional direta.

Não substitua a stack atual.

---

# 3. REGRAS DE SEGURANÇA E ESCOPO

## NÃO TOCAR

Não acessar, alterar, migrar ou integrar nesta fase:

- Supabase atual do Altnix Informativo;
- Supabase da Altnix Platform;
- bancos remotos existentes;
- projeto de bot/WhatsApp da Altnix;
- TV Box;
- player Android;
- playlists;
- APIs do Digital Signage;
- Vercel de outros projetos;
- DNS;
- Meta/WhatsApp real;
- gateways de pagamento;
- Google OAuth real;
- notificações push reais.

Não executar migrations.
Não criar banco remoto.
Não criar projeto Supabase.
Não adicionar secrets.
Não fazer deploy de produção.

O `jornalir` deve permanecer isolado.

---

# 4. PRESERVAÇÃO DO QUE JÁ EXISTE

Antes de qualquer modificação:

1. execute `git status`;
2. registre branch atual e SHA base;
3. inspecione a árvore do repositório;
4. leia os arquivos centrais de `apps/site`, `apps/sistema`, `packages/types`, `packages/mocks`, `packages/ui`, `packages/config` e `docs`;
5. identifique dependências e rotas existentes;
6. verifique se há alterações locais não publicadas.

Se houver alterações locais do usuário:

- NÃO resetar;
- NÃO fazer checkout destrutivo;
- NÃO usar `git clean`;
- NÃO sobrescrever;
- preserve o trabalho e adapte a estratégia.

Preserve especialmente as **funcionalidades**:

- `jornal-online`;
- leitor/flipbook;
- integrações atuais de leitura da edição;
- rotas públicas existentes enquanto ainda forem necessárias;
- qualquer capacidade operacional útil.

Isso **não significa preservar o frontend atual**.

Componentes visuais antigos podem ser considerados legado e substituídos nos lotes de frontend. Nesta etapa, não os apague de forma destrutiva apenas porque haverá redesign; mantenha compatibilidade temporária até a substituição planejada.

---

# 5. ESTRATÉGIA DE GIT

Trabalhe em branch dedicada.

Sugestão:

`feature/jornalir-core-foundation-20260917`

Se a branch já existir, não recrie nem destrua histórico; use uma alternativa segura.

Faça commits por **lote funcional**, não um commit por arquivo.

Nesta rodada deve haver, idealmente, **um commit principal ao final do Lote 1**.

Se houver motivo técnico para dois commits, mantenha-os coerentes.

Pode fazer push da feature branch se a autenticação permitir, mas:

- nunca fazer push direto em `main`;
- nunca mergear;
- nunca criar release;
- nunca fazer deploy de produção.

---

# 6. FILOSOFIA DE ARQUITETURA

Queremos um frontend que hoje funcione com mocks e amanhã funcione com Supabase sem reconstrução.

Use a separação conceitual:

```text
UI / PAGES
    ↓
APPLICATION / SERVICES
    ↓
REPOSITORY CONTRACTS
    ↓
DATA PROVIDER
    ↓
agora: MOCK
depois: SUPABASE
```

Não permita que páginas importem grandes arrays mock diretamente.

Evite lógica de negócio espalhada em componentes visuais.

Prefira:

- domínio tipado;
- interfaces claras;
- adaptadores;
- serviços;
- funções pequenas;
- componentes reutilizáveis;
- dependências direcionadas;
- fronteiras por módulo.

Não crie abstrações genéricas sem necessidade.

Não faça arquitetura enterprise exagerada.

O código precisa ser compreensível para outro programador sênior em poucos minutos.

---

# 7. DIRETRIZES VISUAIS

## Sistema interno

O sistema interno deve ser:

- profissional;
- moderno;
- claro;
- rápido;
- com boa densidade de informação;
- simples para usuários não técnicos;
- responsivo;
- desktop-first, mas utilizável em tablet/mobile.

Evitar “dashboard de template” genérico.

Pode usar painéis, tabelas, divisores e áreas funcionais quando fizer sentido.

Não espalhar dezenas de caixas apenas para preencher espaço.

## Portal público

O portal será redesenhado em lote posterior.

Regra futura já estabelecida:

**ZERO CARDS como linguagem visual principal do portal.**

O portal deve usar:

- hierarquia editorial;
- tipografia;
- fotografia;
- linhas/divisores;
- espaços;
- manchetes;
- composição contínua;
- foco mobile-first.

Nesta rodada, não redesenhe o portal inteiro.

Apenas preserve e prepare a arquitetura para futura troca.

---


# 7.1 REGRA ABSOLUTA SOBRE O FRONTEND ATUAL

O frontend atual **não é referência visual obrigatória**.

A orientação é:

- reaproveitar estrutura técnica útil;
- reaproveitar funcionalidades úteis;
- reaproveitar fluxos que façam sentido;
- reaproveitar leitura do jornal/flipbook e outras capacidades já funcionais;
- preservar dados, contratos e integrações úteis quando existirem;
- **não preservar o visual atual apenas por compatibilidade**.

O novo frontend deverá ser **reinventado**.

Queremos uma linguagem:

- contemporânea;
- sofisticada;
- editorial;
- limpa;
- mobile-first no portal;
- eficiente no sistema interno;
- visualmente autoral;
- muito acima da aparência genérica de templates;
- sem dependência estética do site atual.

O site antigo deve ser tratado como **fonte funcional e estrutural**, não como referência de design.

### Portal público

O redesign futuro do portal poderá substituir completamente:

- composição da homepage;
- header;
- navegação;
- apresentação de editorias;
- destaques;
- disposição de notícias;
- tipografia;
- espaçamento;
- tratamento de imagens;
- publicidade;
- rodapé;
- componentes visuais antigos.

Regra de produto já definida:

**ZERO CARDS como linguagem visual principal do portal.**

Não criar uma homepage formada por grade de caixas.

O portal deverá parecer uma publicação digital moderna, não um dashboard nem um template de blog.

### Sistema interno

O sistema administrativo também poderá ter frontend totalmente novo.

Preserve apenas:

- informação;
- função;
- regra de negócio;
- fluxo útil.

Não preserve componentes visuais antigos por inércia.

O sistema interno deve ter:

- navegação clara;
- excelente densidade de informação;
- poucos cliques;
- hierarquia visual forte;
- operação simples;
- aparência profissional;
- componentes consistentes.

### Nesta rodada

No Lote 1, o **shell de `apps/sistema` já pode nascer com a nova linguagem visual**.

No `apps/site`, ainda não execute o redesign total, porque isso será feito em lote próprio. Porém:

- não trate o visual existente como restrição;
- não crie novas dependências visuais baseadas no layout antigo;
- organize contratos e componentes para permitir substituição completa do frontend;
- preserve temporariamente o frontend atual apenas para não quebrar funcionalidades antes do lote de redesign.


# 8. TESTES E VALIDAÇÃO — IMPORTANTE

Não queremos uma rotina improdutiva de testar a cada comando.

## NÃO FAZER

- não rodar build após cada arquivo;
- não rodar typecheck após cada pequena mudança;
- não reiniciar servidor repetidamente sem motivo;
- não criar uma suíte enorme de testes agora;
- não gastar tempo “testando o teste” sem necessidade;
- não repetir comandos de instalação se as dependências já estão válidas.

## FAZER

Trabalhe em blocos.

Ao terminar um lote funcional:

1. rode o typecheck do workspace afetado;
2. rode o build do workspace afetado;
3. se a alteração impactar pacotes compartilhados usados pelos dois apps, rode o build raiz apenas no fechamento do lote;
4. corrija erros causados por suas alterações;
5. não persiga problemas antigos e não relacionados — documente-os.

Nesta fase, o objetivo é **qualidade com produtividade**, não quantidade de comandos.

---

# 9. PRINCÍPIOS DO DOMÍNIO EDITORIAL

O Lote 1 deve preparar corretamente estes conceitos.

## Matéria

Toda matéria pertence sempre a uma editoria/assunto.

Campos conceituais essenciais:

- identificador;
- referência interna legível;
- título;
- subtítulo opcional;
- corpo;
- editoria;
- cidade/região;
- status;
- imagem de capa opcional;
- galeria;
- origem;
- datas;
- programação;
- posição editorial temporária;
- notificação;
- vínculo opcional com edição digital.

## Status

Prever:

- `draft`
- `adjusting`
- `scheduled`
- `published`
- `archived`

## Editorias

Exemplos iniciais:

- Geral
- Esporte
- Polícia
- Política
- Economia
- Eventos
- Cidades

Não fixe isso de forma que exija código para adicionar nova editoria no futuro.

## Localidade

Cidade/região é independente da editoria.

Prever conceito como:

- cidade específica;
- região;
- abrangência geral.

## Destaque / posição editorial

Destaque não é categoria.

A matéria continua na editoria original.

Prever tipos como:

- manchete;
- destaque principal;
- destaque secundário;
- urgente/última hora;
- destaque da editoria;
- especial;
- nenhum.

Prever janela opcional de início/fim da exposição.

A homepage deverá futuramente suportar aproximadamente cinco matérias em rotação principal, mas isso não deve ser hardcoded como regra permanente.

## Notificação

Prever:

- nenhuma;
- normal;
- urgente.

## Imagens

Uma matéria pode:

- não ter imagem;
- ter uma única imagem;
- ter várias imagens.

Quando houver várias:

- uma pode ser marcada como capa;
- as demais formam galeria;
- ordem deve ser configurável.

## Referência interna

Prever campo para referência legível da matéria e referência correlacionável de mídia.

Não cristalize formato final de código se isso puder ser resolvido por serviço/configuração.

---

# 10. FUTURA IMPORTAÇÃO DE PDF — APENAS PREPARAR CONTRATOS

Não implemente parser/OCR agora.

Mas a arquitetura deve comportar no futuro:

```text
PDF da edição
↓
análise
↓
candidatos a matéria
↓
título/subtítulo/texto/imagens sugeridas
↓
revisão manual
↓
rascunho
```

Regras:

- nunca publicar automaticamente;
- candidato importado vira rascunho;
- publicidade detectada pode ser descartada;
- deve ser possível no futuro mesclar/dividir candidatos;
- imagem extraída é opcional;
- equipe poderá enviar fotos originais depois.

Crie apenas os tipos/contratos mínimos necessários para não bloquear esse fluxo futuramente.

Não faça OCR nesta fase.

---

# 11. PERFIS DE USUÁRIO

Prever inicialmente:

### `admin`

Acesso futuro total.

### `editorial`

Acesso a:

- matérias;
- edição;
- publicação;
- programação;
- mídias;
- editorias;
- localidades;
- destaques.

Sem acesso financeiro.

Nesta rodada não há autenticação real.

Use identidade/permissões simuladas apenas onde necessário para demonstrar a arquitetura.

---

# 12. LOTE 1 — EXECUTAR AGORA

## Objetivo

Criar a **fundação arquitetural e o primeiro esqueleto funcional do sistema editorial**, sem backend real.

### 12.1 Auditoria inicial

Antes de escrever código:

- mapear a estrutura;
- registrar o estado atual;
- identificar componentes reaproveitáveis;
- identificar acoplamentos ruins entre página e mock/localStorage;
- identificar o que não deve ser mexido agora.

Não gastar horas gerando relatório gigante.

A auditoria deve ser objetiva e orientar a implementação.

### 12.2 Documentação de arquitetura

Criar ou atualizar em `docs/`:

- `ARCHITECTURE.md`
- `FRONTEND-STRUCTURE.md`
- `DATA-BOUNDARIES.md`
- `HANDOFF-CODEX.md`

Se o `PLANO-MESTRE-JORNALIR.md` fornecido não estiver no repositório, adicione uma cópia em `docs/PLANO-MESTRE-JORNALIR.md` **sem alterar seu conteúdo funcional**.

`HANDOFF-CODEX.md` deve ser atualizado ao final do lote.

### 12.3 Camada de domínio

Organize `packages/types` para representar pelo menos:

- `UserRole`
- `Article`
- `ArticleStatus`
- `EditorialSection`
- `Locality`
- `EditorialPlacement`
- `NotificationMode`
- `MediaAsset`
- `ArticleMedia`
- `NewspaperEdition`
- contratos mínimos para futura importação de PDF

Não modele financeiro completo ainda.

Não modele WhatsApp completo ainda.

Não modele App mobile completo ainda.

Apenas mantenha fronteiras documentadas.

### 12.4 Camada de dados

Crie uma arquitetura para providers/repositories.

Pode criar um novo pacote compartilhado como:

`packages/core`

se isso realmente melhorar a organização.

Exemplo conceitual:

```text
packages/core/
  editorial/
    article-repository.ts
    editorial-service.ts
    ...
```

Crie implementação mock.

A UI do sistema deve consumir serviço/repositório, não importar dados crus.

### 12.5 Mocks coerentes

Reestruture `packages/mocks` apenas o necessário.

Crie dados editoriais suficientemente ricos para validar UI:

- matérias em vários status;
- matérias com e sem subtítulo;
- com e sem imagem;
- galeria;
- diferentes editorias;
- diferentes cidades/regiões;
- programada;
- publicada;
- urgente;
- manchete;
- importada de edição.

Não crie centenas de registros.

Use quantidade suficiente para demonstrar estados reais.

### 12.6 Shell do sistema interno

Estruture `apps/sistema` com um shell moderno e consistente.

Menu planejado:

- Início
- Editorial
- Clientes
- Financeiro
- Assinaturas
- Publicidade
- Aniversariantes
- WhatsApp
- Entrevistas
- Relatórios
- Configurações

Nesta fase, apenas **Editorial** precisa começar a ter conteúdo funcional novo.

Os demais módulos podem aparecer como áreas planejadas/indisponíveis, sem falsas funcionalidades.

Não remova as rotas existentes de anúncios/patrocinadores; preserve-as e documente a futura incorporação em Publicidade.

### 12.7 Editorial — rotas iniciais

Estruture pelo menos:

```text
/sistema/editorial
/sistema/editorial/materias
/sistema/editorial/materias/nova
/sistema/editorial/programacao
/sistema/editorial/importar-pdf
/sistema/editorial/editorias
/sistema/editorial/localidades
/sistema/editorial/midias
```

Nesta rodada:

- `materias` deve listar dados mock de forma profissional;
- filtros básicos devem funcionar no frontend;
- `nova` deve possuir um esqueleto funcional do cadastro;
- demais páginas podem ser estruturas funcionais simples, desde que coerentes com o plano.

### 12.8 Cadastro inicial de matéria

Não implemente ainda um editor rich-text completo.

Mas a tela deve preparar:

- título;
- subtítulo;
- corpo;
- editoria;
- localidade;
- status;
- imagem de capa;
- galeria;
- notificação;
- posição editorial;
- programação;
- botões:
  - Salvar rascunho
  - Publicar agora
  - Programar

Use estado/mock nesta rodada.

A UI deve mostrar claramente que título, subtítulo e texto terão padrões editoriais configuráveis futuramente.

Não criar toolbar complexa ainda.

### 12.9 Site público

Nesta rodada:

- não redesenhar a homepage inteira;
- não remover o flipbook;
- não remover rotas;
- não quebrar leitura do jornal;
- não substituir componentes atuais em massa.

Faça apenas as adaptações compartilhadas indispensáveis para que `apps/site` continue compilando com os novos tipos/pacotes.

Documente no handoff quais componentes existentes entram em conflito com a futura regra “zero cards”, mas não faça a substituição nesta rodada.

---

# 13. NÃO FAZER NO LOTE 1

Não implementar:

- Supabase;
- banco;
- autenticação real;
- Google login;
- pagamentos;
- financeiro completo;
- clientes completos;
- contratos;
- assinatura;
- WhatsApp real;
- notificações push;
- app Android/iOS;
- OCR;
- parser real de PDF;
- IA;
- integração com Altnix Informativo;
- integração com Platform;
- importação de dados reais;
- redesign final do portal;
- biblioteca de mídia remota;
- upload real para storage;
- deploy.

---

# 14. LOTES FUTUROS — NÃO EXECUTAR AGORA

Use esta ordem apenas como direção arquitetural.

## Lote 2 — CMS editorial completo

- editor de título/subtítulo;
- editor de corpo;
- padrão tipográfico;
- controles limitados de formatação;
- upload local/mock de imagens;
- escolha da capa;
- galeria;
- ordenação;
- editoria/localidade;
- destaque;
- programação;
- notificação;
- preview;
- estados e transições.

## Lote 3 — edição digital + importação PDF

- cadastro de edição;
- PDF;
- fluxo visual de candidatos;
- revisão;
- mesclar/dividir;
- vínculo matéria ↔ edição/página;
- sem publicação automática.

## Lote 4 — cadastro central / CRM

- pessoa;
- empresa;
- múltiplos papéis;
- assinante;
- anunciante;
- cliente;
- histórico.

## Lote 5 — contratos, publicidade, financeiro

- contratos;
- inserções;
- períodos;
- recorrência;
- contas;
- parcelas;
- recebimentos;
- auditoria;
- estrutura preparada para integração futura com Altnix Informativo.

## Lote 6 — aniversariantes

- filtro quinta→quarta;
- cadastro;
- mensagens;
- vínculo com cliente.

## Lote 7 — portal público

- redesign editorial;
- mobile-first;
- zero cards;
- rotação principal;
- manchetes;
- publicidade integrada sem poluir;
- leitura de matérias;
- cidades/editorias;
- edição digital.

## Lote 8 — app / notificações / leitor

Somente após revisão arquitetural.

---

# 15. CRITÉRIOS DE QUALIDADE

O código entregue precisa:

- compilar;
- ter TypeScript coerente;
- evitar `any` desnecessário;
- evitar arquivos monolíticos gigantes;
- evitar duplicação óbvia;
- manter responsabilidades claras;
- não quebrar o site atual;
- não introduzir dependências pesadas sem justificativa;
- manter acessibilidade básica;
- manter interface responsiva;
- ter nomes em inglês no código quando fizer sentido técnico, mas textos visíveis em português;
- não expor secrets;
- não depender de backend inexistente;
- não fingir integração real.

Se precisar instalar uma dependência, justifique no handoff.

Evite adicionar frameworks de UI completos nesta fase.

---

# 16. AUDITORIA / LOG FUTURO

O Plano Mestre exige auditoria imutável no backend futuro.

Nesta fase não há banco.

Mesmo assim, organize os contratos para que ações futuras possam registrar:

- ator;
- ação;
- entidade;
- id;
- timestamp;
- antes/depois;
- contexto.

Não implemente sistema de auditoria fake complexo.

Apenas não desenhe entidades de modo que essa futura exigência fique inviável.

---

# 17. RESULTADO ESPERADO DO LOTE 1

Ao terminar esta rodada, eu devo conseguir abrir o sistema e ver:

1. shell administrativo moderno;
2. navegação clara;
3. área Editorial estruturada;
4. listagem de matérias com mocks tipados;
5. filtros;
6. tela inicial de nova matéria;
7. páginas estruturais de programação/importação/editorias/localidades/mídias;
8. separação real entre UI e dados;
9. documentação de arquitetura;
10. site público preservado;
11. build/typecheck válidos.

O objetivo não é perfeição visual ainda.

É criar uma base profissional que permita evoluir rápido sem reescrever tudo.

---

# 18. VALIDAÇÃO NO FINAL DO LOTE

Somente depois de concluir o código do lote:

1. rode o typecheck relevante;
2. rode build de `apps/sistema`;
3. rode build de `apps/site` se pacotes compartilhados foram alterados;
4. rode o build raiz apenas se necessário para validar o conjunto;
5. corrija somente erros relacionados às mudanças;
6. faça uma inspeção breve das rotas principais.

Não crie uma bateria infinita de testes.

---

# 19. HANDOFF OBRIGATÓRIO

Ao final, atualize `docs/HANDOFF-CODEX.md` com:

- data;
- branch;
- SHA base;
- SHA final;
- resumo do lote;
- decisões arquiteturais;
- arquivos/pastas principais alterados;
- novas dependências, se houver;
- comandos de validação executados;
- resultados;
- problemas preexistentes encontrados;
- o que ficou intencionalmente para o Lote 2;
- riscos;
- instruções para o próximo agente.

Na resposta final, seja objetivo e use exatamente esta estrutura:

```text
VERDICT:
COMPLETE / PARTIAL / BLOCKED

BRANCH:
...

BASE SHA:
...

FINAL SHA:
...

LOTE ENTREGUE:
Lote 1 — Fundação + Editorial Skeleton

PRINCIPAIS ENTREGAS:
...

VALIDAÇÃO:
...

NÃO FOI FEITO:
...

PENDÊNCIAS REAIS:
...

PRÓXIMO LOTE RECOMENDADO:
Lote 2 — CMS Editorial Completo
```

Não esconda limitações.

Não diga “pronto” se algo importante estiver quebrado.

---

# 20. REGRA FINAL

Leia o `PLANO-MESTRE-JORNALIR.md` antes de começar.

Pense como engenheiro responsável por um sistema que será usado diariamente por uma redação e pelo financeiro de uma empresa real.

Não faça protótipo descartável.

Não tente construir o projeto inteiro numa rodada.

Não teste obsessivamente a cada comando.

Faça o **Lote 1 completo, limpo, compilável, documentado e fácil de continuar**.

**Comece agora pelo diagnóstico do repositório e execute somente o Lote 1.**
