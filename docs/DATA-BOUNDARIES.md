# Fronteiras de dados

Proposta de 17/09/2026. Contratos, serviços e novos providers ainda não implementados.

## Hoje

```text
Sistema: página → arrays de @ir/mocks → estado React em memória
Portal:  página → newsStorage / adsStorage → IndexedDB no navegador
                    └── notícias: fallback para conteúdo simulado
Jornal:  leitor → catálogo local / endpoints existentes do Google Drive
```

IndexedDB é local ao navegador e à origem. As portas de desenvolvimento 3000 e 3001 representam origens diferentes; compartilhar o nome de um banco não sincroniza site e sistema. Estado React em memória também não é persistência nem compartilhamento entre aplicações.

Esses fluxos são legados preservados. Esta documentação não afirma que já existe uma fonte central ou que o sistema atual publica no portal.

## Alvo

```text
UI → service → repository (contrato) → provider (implementação)
                                          ├── mock
                                          ├── IndexedDB, quando houver adaptação do legado
                                          └── Supabase / IR Core, em etapa futura
```

| Camada | Responsabilidade | Limite |
| --- | --- | --- |
| UI | Formulários, filtros, navegação, estados de carregamento/erro/sucesso. | Não importar grandes arrays, chamar banco diretamente ou decidir regras de publicação. |
| Service | Casos de uso, validações e transições editoriais. | Não depender de React, IndexedDB ou SDK do Supabase. |
| Repository | Contrato tipado das operações necessárias ao módulo. | Não expor detalhes de tabela, SDK, armazenamento ou componentes. |
| Provider | Implementar operações e traduzir dados/erros para o contrato. | Não definir apresentação nem uma segunda versão das regras de negócio. |
| Composição | Escolher e injetar o provider nos serviços. | Não espalhar condicionais de ambiente em páginas. |

Prever operações assíncronas desde o mock, com entradas, resultados e falhas tipados. Especificar filtros, registro ausente e sucesso de escrita conforme os casos de uso reais. Evitar repositório genérico universal.

## Contratos e compatibilidade

- `packages/types`: entidades, identificadores e valores do domínio.
- `packages/core`, se criado: contratos de repositórios e serviços editoriais; depende de `types`.
- `packages/mocks`: fixtures e implementações de contratos; pode depender de `core`/`types`. `core` não depende de `mocks`.
- Preservar `NewsItem`, `CmsNewsItem` e consumidores existentes até haver adaptadores explícitos. Não transformar todos os dados antigos silenciosamente.
- Manter editoria, localidade, posição editorial, programação e notificação como conceitos independentes.
- Preparar vínculo de matéria/mídia com edição e página de origem, sem executar importação ou OCR.
- O formato final das referências internas continua em aberto; não fixá-lo nas telas.

## Providers por etapa

**Mock:** dados suficientes para os estados editoriais e implementação substituível. A futura implementação deve explicitar se o estado dura apenas a sessão e demonstrar o resultado de salvar/navegar. Não anunciar persistência real.

**IndexedDB legado:** preservar stores, chaves, dados e comportamento atual nesta fase. Se houver adaptação posterior, encapsular no provider, somente no navegador. Qualquer migração exige estratégia própria de preservação; não limpar bancos nem importar dados automaticamente.

**Supabase futuro:** implementar os mesmos contratos, conectando o IR Core exclusivo do JornalIR. O frontend permanece baseado nos serviços; composição e infraestrutura mudam. Compartilhar contratos não equivale a compartilhar memória entre apps: a integração real dependerá desse backend comum.

Autenticação, autorização no servidor e políticas de acesso deverão proteger operações administrativas no backend futuro; simulações de perfil não oferecem essas garantias. Credenciais privilegiadas nunca entram em componentes cliente. Nenhuma credencial, conexão ou migration é criada agora.

## Consistência funcional futura

Serviços devem garantir editoria obrigatória, imagens opcionais e publicação explícita. Programação mock representa intenção; não promete processamento em segundo plano. Importação gera rascunhos revisáveis, nunca publicação automática. A exposição pública consumirá somente conteúdo elegível para publicação.

Prever contexto de auditoria nas operações relevantes: ator, ação, entidade/id, timestamp, antes/depois e contexto. O backend futuro deverá garantir registro e imutabilidade; não tratar logs do navegador como auditoria confiável.

O IR Core será a fonte única de dados de negócio de site, sistema e app. Mídia operacional de TVs/painéis continua fora dele; integrações com Altnix Informativo e Platform ficam para fases posteriores. O banco definitivo será desenhado após validação dos fluxos, conforme o Plano Mestre.
