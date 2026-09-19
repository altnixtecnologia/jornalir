# PLANO MESTRE — ECOSSISTEMA INFORMATIVO REGIONAL

**Documento de definição e controle do projeto**  
**Data-base:** 17/09/2026  
**Status:** arquitetura funcional em definição; integrações e banco ainda não executados.

---

## 1. OBJETIVO GERAL

Transformar o atual ecossistema do Informativo Regional em uma plataforma própria, moderna e integrada, reunindo:

- portal de notícias;
- sistema editorial/CMS;
- sistema administrativo;
- cadastro central de pessoas e empresas;
- assinaturas;
- publicidade;
- financeiro;
- aniversariantes;
- aplicativo Android/iOS;
- notificações;
- WhatsApp como módulo de atendimento e divulgação;
- podcast/entrevistas;
- edição digital do jornal;
- integrações futuras com o Altnix Informativo.

O projeto deve ser profissional, simples de operar, visualmente moderno e pensado para uso real da equipe do jornal.

---

# PARTE A — ARQUITETURA GERAL

## 2. REPOSITÓRIO PRINCIPAL

O projeto-base será o repositório já existente:

`altnixtecnologia/jornalir`

A estrutura atual já possui conceito de monorepo, incluindo:

- `apps/site`
- `apps/sistema`
- `packages/ui`
- `packages/types`
- `packages/config`
- `packages/mocks`

A proposta é evoluir esse repositório para ser a plataforma oficial do Informativo Regional.

### Estrutura planejada

```text
jornalir/
├── apps/
│   ├── site/        # portal público
│   ├── sistema/     # sistema interno do jornal
│   └── mobile/      # futuro app Android/iOS
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   ├── mocks/
│   └── core/        # regras e contratos compartilhados, futuramente
│
└── docs/
```

---

## 3. IR CORE

Será criado posteriormente um **Supabase exclusivo do Jornal**, separado dos bancos do Altnix Informativo e da Altnix Platform.

O IR Core será a fonte central para:

- pessoas;
- empresas;
- clientes;
- assinantes;
- anunciantes;
- contratos;
- financeiro;
- matérias;
- editorias;
- cidades/regiões;
- usuários;
- aniversários;
- publicidade do portal;
- notificações;
- registros de auditoria;
- preferências de leitores;
- dados do app;
- módulo WhatsApp.

### Regra importante

O IR Core **não deverá receber o alto volume operacional de mídia das TVs e painéis de LED**.

---

## 4. SISTEMAS QUE CONTINUAM SEPARADOS

### Altnix Informativo

Permanece responsável exclusivamente pela operação de mídia digital:

- TVs;
- painéis de LED;
- players;
- TV Box;
- playlists;
- imagens e vídeos de campanhas;
- equipamentos;
- operação técnica.

### Altnix Platform

Permanece em sua própria arquitetura e banco.

### Regra de segurança

Nenhuma mudança no novo JornalIR deverá interromper:

- players;
- TV Box;
- telas;
- painéis;
- playlists;
- APIs do Altnix Informativo.

A futura unificação de cadastro/financeiro será feita **somente no final** e com migração progressiva.

---

# PARTE B — USUÁRIOS E PERMISSÕES

## 5. USUÁRIOS INICIAIS DO JORNAL

Inicialmente haverá dois perfis principais.

### 5.1 Administrador

Acesso total a:

- editorial;
- financeiro;
- clientes;
- assinaturas;
- publicidade;
- contratos;
- aniversários;
- usuários;
- configurações;
- integrações;
- auditoria;
- relatórios.

### 5.2 Editorial

Acesso apenas à parte editorial:

- criar matérias;
- editar matérias;
- alterar matérias;
- publicar;
- programar;
- gerenciar imagens;
- galerias;
- destaques;
- editorias;
- cidades/regiões;
- conteúdo do portal.

Sem acesso ao financeiro e às áreas administrativas sensíveis.

---

# PARTE C — SISTEMA EDITORIAL / CMS

## 6. MATÉRIA — CAMPOS PRINCIPAIS

O cadastro deve ser rápido e não burocrático.

### Campos básicos

- **Título**
- **Subtítulo** — opcional
- **Texto**
- **Imagem principal** — opcional
- **Galeria** — opcional e com múltiplas fotos
- **Assunto/editoria**
- **Cidade/região**

Outros campos poderão existir, mas não devem ser obrigatórios para uma publicação simples.

---

## 7. FORMATAÇÃO EDITORIAL

Título, subtítulo e texto terão um **padrão editorial predefinido**.

### Título e subtítulo

Terão um pequeno botão lateral para ajustes pontuais:

- fonte entre opções autorizadas;
- tamanho;
- negrito;
- itálico;
- peso/ênfase.

O padrão sempre será aplicado automaticamente.

### Texto

Terá editor mais completo, com opções como:

- negrito;
- itálico;
- subtítulos internos;
- listas;
- links;
- citações;
- alinhamento básico;
- inserção de imagem;
- mídia incorporada quando necessário.

Mesmo com editor completo, o texto começará sempre dentro do padrão visual definido pelo jornal.

---

## 8. ASSUNTO / EDITORIA

Toda matéria **sempre pertence a um assunto/editoria**, independentemente de estar ou não em destaque.

Exemplos iniciais:

- Geral
- Esporte
- Polícia
- Política
- Economia
- Eventos
- Cidades
- Outros que forem necessários

O sistema poderá sugerir o assunto automaticamente em conteúdos importados, mas o usuário sempre poderá alterar.

---

## 9. CIDADE / REGIÃO

Cidade e região serão atributos independentes da editoria.

Exemplos:

```text
Polícia + Passo de Torres
Política + São João do Sul
Geral + Região
Esporte + Torres
```

Deve ser possível:

- selecionar cidade;
- selecionar região;
- marcar conteúdo regional;
- criar nova cidade/região quando necessário.

Na navegação pública:

- "Geral" pode mostrar tudo;
- o leitor poderá filtrar por cidade/região;
- futuramente o usuário logado poderá definir suas regiões favoritas.

---

# PARTE D — IMAGENS E GALERIAS

## 10. IMAGEM PRINCIPAL

Se existir apenas uma imagem, ela poderá ser usada como capa.

Quando houver várias imagens:

- o usuário escolhe explicitamente qual será a imagem de capa;
- as demais ficam na galeria;
- a ordem da galeria poderá ser alterada.

Matérias sem imagem serão permitidas inicialmente.

A necessidade de imagem obrigatória para determinados destaques será decidida durante o desenho final do portal.

---

## 11. IDENTIFICAÇÃO DE MATÉRIAS E IMAGENS

Cada matéria terá um identificador interno visível à equipe.

Exemplo conceitual:

`IR-MAT-2026-001245`

As imagens relacionadas poderão carregar referência derivada da mesma matéria.

Exemplo:

```text
IR-MAT-2026-001245
IR-MAT-2026-001245-IMG-01
IR-MAT-2026-001245-IMG-02
IR-MAT-2026-001245-IMG-03
```

Objetivos:

- facilitar busca interna;
- localizar arquivos;
- rastrear origem;
- relacionar imagens e galerias;
- facilitar suporte e auditoria;
- evitar confusão em grande volume de conteúdo.

O formato final do ID ainda será definido.

---

# PARTE E — FLUXO DE PUBLICAÇÃO

## 12. STATUS DA MATÉRIA

Estados previstos:

- Rascunho
- Em ajuste
- Programada
- Publicada
- Arquivada

Uma matéria **nunca será publicada automaticamente apenas porque foi criada ou importada**.

---

## 13. AÇÕES DE PUBLICAÇÃO

Depois de todos os ajustes, haverá três ações principais:

```text
Salvar como rascunho
Publicar agora
Programar
```

### Programação

Deve permitir definir:

- data;
- horário;
- posição editorial/destaque;
- período do destaque quando aplicável;
- notificação;
- tipo de notificação.

---

# PARTE F — CAPA E DESTAQUES

## 14. REGRA PRINCIPAL

A matéria sempre continua existindo dentro de sua editoria/assunto.

A capa principal é apenas uma **exposição editorial temporária e rotativa**.

---

## 15. ROTAÇÃO PRINCIPAL

Inicialmente a área principal poderá trabalhar com aproximadamente **5 matérias em rotação**.

Esse número não é definitivo.

A rotação deverá ser configurável e poderá evoluir com o uso real do portal.

---

## 16. POSIÇÕES EDITORIAIS

Estrutura inicial sugerida:

- Manchete
- Destaque principal
- Destaque secundário
- Última hora / Urgente
- Destaque da editoria
- Especial

A matéria poderá estar em destaque sem deixar sua editoria original.

### Exemplo

```text
Matéria:
Assunto: Polícia
Cidade: Passo de Torres

Capa:
Manchete entre 09:00h e 14:00h

Após 14:00h:
continua normalmente em Polícia
```

O desenho visual desses destaques será desenvolvido posteriormente.

---

# PARTE G — IMPORTAÇÃO DO JORNAL IMPRESSO EM PDF

## 17. OBJETIVO

Reduzir o trabalho manual de republicar na web matérias já existentes no jornal impresso.

O sistema deverá aceitar o PDF completo da edição.

---

## 18. FLUXO DE IMPORTAÇÃO

```text
Upload do PDF
↓
Leitura e análise
↓
Identificação de possíveis matérias
↓
Extração de:
  - título
  - subtítulo, se houver
  - texto
  - imagens possíveis
  - assunto sugerido
↓
Criação de rascunhos
↓
Revisão manual
↓
Fotos adicionais
↓
Publicar / Programar / Manter em rascunho
```

### Regra absoluta

Conteúdo importado do PDF **sempre entra como rascunho**.

Nada é publicado automaticamente.

---

## 19. PUBLICIDADES NO PDF

O sistema tentará identificar matérias.

Se alguma publicidade for interpretada como matéria:

- não há problema;
- ela aparecerá na seleção;
- o usuário poderá simplesmente descartar.

Também deverá ser possível:

- juntar blocos identificados como matérias diferentes;
- separar blocos unidos incorretamente;
- corrigir título, subtítulo e texto.

---

## 20. FOTOS VINDAS DO PDF

As imagens poderão ser extraídas quando tecnicamente viável e com qualidade aceitável.

Porém:

- não serão obrigatórias;
- a equipe poderá substituir;
- novas fotos poderão ser adicionadas;
- o digital poderá ter mais imagens que o impresso.

O foco principal da importação é:

**pré-carregar título + subtítulo + texto da matéria.**

---

# PARTE H — EDIÇÃO DIGITAL DO JORNAL

## 21. ABA JORNAL

O portal manterá uma área específica para leitura da edição impressa em formato digital.

O projeto atual já possui conceito de leitura com efeito semelhante a folhear o jornal.

Essa experiência será mantida e modernizada.

---

## 22. VÍNCULO ENTRE MATÉRIA E EDIÇÃO

Uma matéria importada do PDF poderá ficar vinculada à edição de origem.

Na matéria publicada no portal poderá existir:

**"Ver esta matéria na edição digital"**

O link deverá abrir diretamente:

- a edição correta;
- idealmente a página correspondente.

---

# PARTE I — PORTAL PÚBLICO

## 23. POSICIONAMENTO

O objetivo não é criar apenas um "jornal na internet".

Será um **portal de notícias moderno, rápido e pensado para a palma da mão**.

---

## 24. REGRA VISUAL

**ZERO CARDS como linguagem principal do portal.**

Evitar:

- grade genérica de caixinhas;
- aparência de SaaS;
- portal visualmente fragmentado.

Priorizar:

- grandes manchetes;
- tipografia forte;
- fotografia;
- vídeo;
- hierarquia editorial;
- linhas e divisores;
- espaços em branco;
- blocos editoriais contínuos;
- movimento discreto;
- navegação natural;
- forte experiência mobile.

---

## 25. LEITOR SEM LOGIN

Todo conteúdo público poderá ser consumido sem obrigar cadastro, salvo conteúdos específicos que futuramente justifiquem restrição.

---

# PARTE J — CONTA DO LEITOR / CLIENTE

## 26. LOGIN

Opções previstas:

- Google;
- cadastro simples por e-mail;
- futuramente outras opções.

O processo deverá ser simples, porém seguro.

---

## 27. BENEFÍCIOS DO LOGIN

O cadastro só será incentivado se trouxer benefício real.

Possibilidades:

- cidades favoritas;
- assuntos favoritos;
- notificações personalizadas;
- matérias salvas;
- assinatura;
- histórico;
- pagamentos;
- publicidade contratada;
- dados cadastrais;
- contratos;
- campanhas;
- preferências.

---

# PARTE K — APP ANDROID / IOS

## 28. APP DO LEITOR

Previsto dentro do ecossistema JornalIR.

Principais áreas:

- notícias;
- últimas notícias;
- minha região;
- alertas;
- favoritos;
- entrevistas;
- podcast;
- edição impressa;
- aniversariantes;
- assinatura;
- conta.

---

## 29. APP DO CLIENTE / ANUNCIANTE

O mesmo app poderá oferecer área autenticada para clientes.

Possibilidades:

- consultar cadastro;
- acompanhar assinatura;
- acompanhar anúncios;
- consultar contratos;
- ver cobranças;
- pagar via PIX;
- pagar via cartão;
- visualizar comprovantes;
- enviar informações para divulgação;
- acompanhar serviços contratados.

Integração de pagamentos será definida em fase posterior.

---

# PARTE L — NOTIFICAÇÕES

## 30. CONTROLE NA PUBLICAÇÃO

Cada matéria poderá ter:

- notificação desativada;
- notificação normal;
- notificação urgente.

O editor escolhe no momento da publicação ou programação.

---

## 31. TOM EDITORIAL

Mesmo notificações urgentes devem manter o posicionamento do jornal:

- informativo;
- neutro;
- direto;
- sem exageros;
- sem alarmismo.

Pode existir maior impacto no texto de urgência, porém sem sensacionalismo excessivo.

---

# PARTE M — CLIENTE ÚNICO

## 32. CADASTRO CENTRAL

Uma mesma pessoa ou empresa poderá acumular diferentes papéis sem duplicação.

Exemplo:

```text
SUPERMERCADO X

├── anunciante do impresso
├── anunciante do site
├── cliente do Altnix Informativo
├── assinante
├── contato financeiro
└── usuário do app
```

O cadastro central deve permitir múltiplos vínculos.

---

# PARTE N — CONTRATOS E PUBLICIDADE

## 33. CONTRATOS

O sistema deverá suportar contratos de diferentes formatos:

- por dia;
- por período;
- por quantidade de inserções;
- mensal;
- recorrente;
- de longa duração;
- sem prazo fixo até cancelamento.

Tudo deve permanecer documentado e rastreável.

---

## 34. PUBLICIDADE DO PORTAL

O Altnix Informativo é exclusivo de TVs e painéis.

Publicidade do portal será gerida pelo JornalIR.

Inicialmente:

- espaços publicitários rotativos;
- períodos configuráveis;
- quantidade de inserções;
- posicionamentos definidos;
- versões desktop/mobile quando necessário.

Outras formas mais inovadoras de publicidade serão desenhadas posteriormente, mantendo a experiência editorial limpa.

---

# PARTE O — FINANCEIRO

## 35. FINANCEIRO CENTRAL

O novo financeiro deverá ser completo e futuramente unificar os diferentes produtos do cliente.

Exemplo:

```text
CLIENTE X

Impresso ............ R$ 500
Portal .............. R$ 200
Altnix Informativo .. R$ 300
-----------------------------
Total ............... R$ 1.000
```

Mas cada origem permanece separada contabilmente.

---

## 36. RECURSOS PREVISTOS

- contas a receber;
- contas a pagar;
- contratos;
- parcelas;
- vencimentos;
- pagamentos;
- inadimplência;
- recorrências;
- centros de custo;
- receitas por produto;
- histórico;
- anexos;
- comprovantes;
- PIX;
- cartão;
- lembretes automáticos;
- relatórios;
- conciliação futura.

---

# PARTE P — AUDITORIA E RASTREABILIDADE

## 37. REGRA DE AUDITORIA

**Tudo deve gerar log.**

Exemplos:

- criação;
- edição;
- mudança de status;
- publicação;
- alteração de preço;
- alteração de contrato;
- pagamento;
- cancelamento;
- mudança cadastral;
- programação;
- mudança financeira;
- ação administrativa.

---

## 38. LOG IMUTÁVEL

O histórico administrativo deverá ser rastreável pelo administrador.

Princípio:

**nenhum registro de auditoria poderá ser apagado pelo usuário da aplicação.**

Quando uma informação de negócio precisar ser "excluída", preferir:

- arquivamento;
- cancelamento;
- desativação;
- nova versão.

Evitar exclusão destrutiva sempre que houver impacto histórico, financeiro ou contratual.

---

# PARTE Q — ANIVERSARIANTES

## 39. FILTRO PADRÃO

A área de aniversariantes terá como padrão editorial:

**quinta-feira até quarta-feira.**

O sistema exibirá automaticamente esse intervalo, com possibilidade de alterar manualmente.

---

## 40. DADOS

Possíveis campos:

- nome;
- nascimento;
- cidade;
- contato;
- origem;
- observações;
- relação com cadastro/assinatura quando existir.

A foto poderá ser adicionada posteriormente, inclusive no dia da diagramação.

---

## 41. TEXTO DE PARABENIZAÇÃO

O sistema poderá sugerir mensagens curtas pré-definidas para facilitar o trabalho.

Essas mensagens:

- não serão obrigatórias;
- poderão ser editadas;
- servirão apenas como ponto de partida.

---

# PARTE R — WHATSAPP

## 42. POSICIONAMENTO

O WhatsApp permanece no projeto, mas deixa de ser o centro de toda a estratégia.

Será um módulo.

---

## 43. USOS PREVISTOS

- atendimento compartilhado;
- identificação de quem respondeu;
- contato vinculado ao cadastro central;
- recebimento de pautas;
- respostas rápidas;
- Canal do WhatsApp;
- divulgação geral via canal;
- cobranças e lembretes em casos específicos;
- comunicação individual quando fizer sentido.

Inicialmente **não haverá foco em disparo massivo individual**.

---

# PARTE S — PODCAST E ENTREVISTAS

## 44. CONTEÚDO MULTIMÍDIA

Entrevistas e podcast serão tratados como conteúdo editorial.

Cada item poderá conter:

- convidado;
- pauta;
- data;
- vídeo;
- áudio;
- matéria relacionada;
- capa;
- publicação no portal;
- app;
- canal;
- notificação quando apropriado.

Vídeos grandes poderão permanecer em YouTube/CDN, sem ocupar desnecessariamente o IR Core.

---

# PARTE T — INTEGRAÇÃO COM O ALTNIX INFORMATIVO

## 45. REGRA PRINCIPAL

A migração/unificação de clientes e financeiro do Altnix Informativo será uma das **últimas etapas do projeto**.

O atual sistema deve continuar operando normalmente durante todo o desenvolvimento.

---

## 46. ESTRATÉGIA DE TRANSIÇÃO

Planejamento inicial:

```text
1. Altnix Informativo continua 100% operacional.

2. Novo IR Core é criado e validado isoladamente.

3. Novo cadastro/financeiro funciona no JornalIR.

4. Integração inicialmente somente leitura.

5. Dados do Altnix Informativo são comparados com o IR Core.

6. Divergências são corrigidas.

7. Sincronização controlada é criada, se necessária.

8. IR Core passa a ser a fonte central somente depois de validado.

9. Altnix Informativo continua consumindo os dados necessários.

10. TV Box, players e telas não devem perceber a migração.
```

### Objetivo

Migração sem interrupção perceptível.

Preferência por **zero downtime**.

Se alguma indisponibilidade for tecnicamente inevitável, deverá ser planejada, mínima e somente após validação.

---

# PARTE U — ORDEM DE DESENVOLVIMENTO

## 47. FASES

### Fase 1 — Arquitetura e definição

- consolidar requisitos;
- definir áreas;
- definir fluxo editorial;
- definir linguagem visual;
- definir modelo de dados conceitual;
- preparar documentação.

### Fase 2 — Sistema editorial / CMS

- matérias;
- editorias;
- cidades/regiões;
- imagens;
- galerias;
- rascunhos;
- programação;
- destaques;
- importação de PDF.

### Fase 3 — Portal

- nova capa;
- navegação;
- editorias;
- cidades;
- matéria;
- galerias;
- edição digital;
- entrevistas;
- pesquisa;
- mobile-first.

### Fase 4 — Cadastro central

- pessoas;
- empresas;
- papéis;
- assinaturas;
- anunciantes;
- clientes.

### Fase 5 — Contratos e publicidade

- contratos;
- inserções;
- campanhas;
- publicidade do portal.

### Fase 6 — Financeiro

- contas;
- recebimentos;
- pagamentos;
- cobrança;
- relatórios;
- auditoria.

### Fase 7 — Aniversariantes

- cadastro;
- filtro quinta→quarta;
- mensagens;
- vínculo com clientes.

### Fase 8 — App

- Android;
- iOS;
- leitor;
- cliente;
- notificações;
- pagamentos.

### Fase 9 — WhatsApp

- atendimento;
- CRM;
- Canal;
- integração de contatos;
- lembretes controlados.

### Fase 10 — Podcast / entrevistas

- conteúdo;
- publicação;
- distribuição.

### Fase 11 — Integrações externas

- site;
- app;
- push;
- WhatsApp;
- meios de pagamento;
- outros serviços.

### Fase 12 — Integração final com Altnix Informativo

Somente após todo o novo núcleo estar estável.

---

# PARTE V — PRINCÍPIOS NÃO NEGOCIÁVEIS

## 48. REGRAS DO PROJETO

1. Portal moderno, clean e mobile-first.
2. Zero cards como linguagem visual principal do site.
3. Operação simples para usuários do jornal.
4. Conteúdo editorial rápido de cadastrar.
5. Nenhuma publicação importada sai automaticamente.
6. Toda matéria pertence permanentemente à sua editoria.
7. Destaque é uma posição temporária, não uma categoria.
8. Um cliente pode ter múltiplos produtos sem duplicação cadastral.
9. Financeiro separa as origens, mas permite visão consolidada.
10. Tudo relevante gera log e histórico.
11. Auditoria não pode ser apagada pelo usuário da aplicação.
12. Mídia pesada das TVs permanece separada.
13. Altnix Informativo e Platform continuam em seus ambientes.
14. Migração do Altnix Informativo somente no final.
15. TV Box/players não podem parar por causa da nova plataforma.
16. Integrações devem ser previstas desde o início, mesmo quando ainda não implementadas.
17. O sistema deve crescer por módulos, sem exigir reescrita de toda a plataforma.

---

# PARTE W — PONTOS AINDA EM ABERTO

## 49. DECISÕES FUTURAS

Ainda serão definidos em conjunto:

- desenho final da capa;
- comportamento exato da rotação dos cinco destaques;
- necessidade ou não de imagem em todos os destaques;
- formato final dos IDs internos;
- estrutura final da biblioteca de mídia;
- nomes definitivos das editorias;
- nomenclatura de regiões;
- espaços publicitários do portal;
- formatos de publicidade menos intrusivos;
- regras completas de login do leitor;
- provedor de pagamentos;
- mecanismo de push;
- tecnologia final do app;
- política de retenção de arquivos;
- fluxo de revisão editorial;
- histórico de versões de matéria;
- algoritmo/processo de importação do PDF;
- integração com Canal do WhatsApp;
- estrutura final do novo financeiro;
- estratégia técnica de sincronização com o Altnix Informativo.

---

# PARTE X — PRÓXIMO PASSO RECOMENDADO

Antes de criar o novo Supabase ou iniciar integrações externas:

1. concluir este documento funcional;
2. revisar a estrutura atual do `jornalir`;
3. definir o mapa de telas do sistema;
4. definir o mapa editorial do portal;
5. criar o design system;
6. construir a interface com dados simulados;
7. validar com o uso real da equipe;
8. somente então desenhar o banco definitivo.

O objetivo é evitar criar um banco prematuramente e depois adaptar toda a plataforma a decisões que ainda estão sendo amadurecidas.

---

**Este documento deve ser mantido como fonte de verdade funcional do projeto enquanto a arquitetura estiver em definição.**
