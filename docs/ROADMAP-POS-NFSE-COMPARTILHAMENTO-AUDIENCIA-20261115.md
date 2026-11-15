# BACKLOG APÓS CONCLUSÃO DA NFS-e — CENTRAL DE COMPARTILHAMENTO E AUDIÊNCIA

> **Recebido em 15/11/2026. STATUS: REGISTRADO, NÃO INICIAR IMPLEMENTAÇÃO ATÉ CONCLUIR A PROGRAMAÇÃO DO MÓDULO NFS-e.**
>
> Decisão expressa: **prioridade absoluta à finalização do módulo NFS-e; depois começar este plano.**
> Não criar agora tabelas, APIs, telas, branches de implementação social, integrações externas nem deploys para este escopo.
>
> Especificação funcional de origem: mensagem completa do usuário na conversa de 15/11/2026, com 15 seções.
> Este arquivo preserva os requisitos/aceites, a ordem e os limites, servindo de checklist de execução.

## Meta estratégica e contexto

**Levar leitores do Facebook e do Instagram ao portal** `https://www.informativoregional.net`, reduzindo drasticamente o trabalho manual da equipe. Redes sociais devem provocar a visita à matéria original; **não virar uma segunda cópia integral do portal**. Preservar matérias completas e suas galerias no portal.

Sistema oficial: portal + controle `https://controle.altnix.com.br` + painel `https://painel.altnix.com.br` + Supabase Pro + Vercel + permissões/auditoria existentes.

A especificação recebida menciona o repositório `altnixtecnologia/site-sistema-painel`, mas, **na verificação GitHub de 15/11/2026**, esse nome retorna 404 na conexão disponível e as entregas NFS-e atuais existem em `altnixtecnologia/jornalir`, branch operacional `solicitacoes-financeiro-contratos-irc-20261031`. Usar o repositório oficial **efetivamente acessível**; reconfirmar eventual renomeação antes de programar. Nunca criar outro repo/sistema.

## Princípios invariáveis

- Reutilizar editor, matérias, capas, galerias, upload, processamento de imagens, componentes, permissões, auditoria e mecanismos de agendamento/cron existentes. Inspecionar tudo **antes** de programar, sem implementar paralelo.
- Cada divulgação deve manter vínculo inequívoco por IDs oficiais da matéria e do post, não por texto/foto aproximados.
- **Meta/Instagram/Google somente APIs oficiais** e permissões aprovadas. Nunca simular capacidade indisponível, driblar limites/privacidade ou exigir senhas pessoais dos jornalistas.
- OAuth institucional e segredos exclusivamente server-side, controles de permissão internos, autenticação de webhooks, logs sem dados sensíveis, rate-limit, idempotência, retentativas controladas, auditoria; LGPD.
- Dados reais nos relatórios; números desconhecidos viram estado vazio. Distinguir comentário, resposta aceita pela API, clique, sessão, visualização e leitura.
- Não editar automaticamente conteúdo editorial original; derivados de mídia exclusivos da divulgação; não criar publicação social real acidental durante testes.
- Minimizar custos; não contratar automação mensal sem necessidade; verificar regras e quotas atuais na data da implementação.
- UX simples, desktop e mobile; campo por matéria onde necessário e valores padrão editáveis depois.
- Preservar deploy Vercel desabilitado até marco aprovado.

## FASE 0 — Auditoria de reaproveitamento (antes de qualquer código)

- [ ] Sincronizar branches/código oficial; identificar componentes de matéria e galeria, URLs públicas, editorias, localidades, capa, usuários e permissões.
- [ ] Encontrar ferramentas já existentes para imagens, mosaicos/colagens, versões derivadas, pré-visualização, links/cópia, auditoria, notificações, webhooks, logs e cron.
- [ ] Verificar metadados OG/Twitter/X e comportamento do scraper social, redirecionamentos e URLs canônicas.
- [ ] Verificar integrações atuais com Facebook/Instagram/Meta e Google Analytics/GA4 ou métricas alternativas.
- [ ] Mapear tabelas/schemas do Supabase para **adicionar só o indispensável**; elaborar permissão/RLS e retenção de dados.
- [ ] Identificar dependências externas: Meta App, OAuth, permissões/revisão de app, Página institucional, conta profissional Instagram, propriedade GA4 e Data API; documentar o que ainda precisa de autorização.

## FASE 1 — Compartilhamento da matéria / Facebook

**Ação `Divulgar`/`Compartilhar` para cada matéria publicada**, integrada no Sistema, com modal/painel responsivo. Auto-carregar ID, título, subtítulo, resumo/chamada, imagem principal, galeria, URL pública definitiva, data, editoria e localidade. Mostrar prévia, status, opções Facebook, Instagram Feed/Stories, Direct, histórico, copiar link e preparar mídias; sem recadastro.

- [ ] Compartilhamento **assistido** usando os mecanismos oficiais do Facebook: URL pronta, chamada sugerida, copiar link, poucos cliques; não depender de automações frágeis do browser.
- [ ] Preferir publicar **post de link na Página oficial** por integração Meta Graph API quando OAuth/permissões estiverem validados; manter URL real da reportagem, não postar imagem isolada como substituto do link. Prévia, chamada editável, confirmação, registro de ID/link externo, êxito/erro/histórico/idempotência.
- [ ] Contas pessoais somente compartilhamento pelo usuário via UI oficial, sem presumir permissão API para publicar em perfil pessoal.
- [ ] Validar `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, Twitter/X, tamanho e disponibilidade pública da capa, canonical, redirects, render dinâmico e cache de prévia. Aparência final depende da Meta.
- [ ] Registrar usuário, matéria, canal, data, status, tentativas, ID/link do post e auditoria.

## FASE 2 — Instagram Feed, Stories e vínculo

**Não copiar a reportagem inteira.** Feed: sugerir capa e **3–5 fotos**, legenda jornalística curta e imagem final convidando a ler no portal. Número de fotos editável; a galeria original pode ter 38/40 imagens e **fica íntegra no portal**. Ex.: «Confira todas as 40 fotos na reportagem. Comente FOTOS para receber o link no Direct».

- [ ] Visualizar/selecionar/reordenar imagens existentes, sem alterar originais; versões derivadas próprias para Instagram, usando processamento/mídia já existentes.
- [ ] Colagens opcionais de 2+ fotos sem alteração indevida da imagem original; limites atuais da API/Feed/carrossel verificados em fonte oficial; não presumir limite fixo 20.
- [ ] Legenda sugerida curta, palavra-chave, chamada final, prévia do carrossel, ordenação e dados da matéria.
- [ ] Stories: gerar arte vertical com capa, título, identidade do jornal, chamada e área livre para adesivo de link; copiar link exato. Inserção de sticker manual no app se API não permitir automatizá-lo.
- [ ] Conectar conta **profissional institucional** via OAuth; publicação por API somente onde elegível; permitir publicação manual assistida.
- [ ] Vínculo inequívoco `instagram_media_id ↔ article_id`: publicação via API ou associação verificável de post institucional existente. Nunca deduzir apenas por título ou foto.
- [ ] Página opcional no próprio portal com lista das matérias efetivamente divulgadas no Instagram, URL fixa na bio, capa/título/data/link da notícia; complementar ao Direct.
- [ ] A seleção de imagens, arte e legendas não deve exigir reconstrução manual nem outro editor de mídia se puder reutilizar o atual.

## FASE 3 — Automação de comentários → resposta privada no Direct (ALTA PRIORIDADE)

**Escopo de cada regra é UMA matéria ↔ UMA postagem Instagram.** Palavra-chave configurável por matéria (FOTOS, SESSÃO, INSCRIÇÕES, RESULTADOS, EVENTO, MATÉRIA etc.), alternativas opcionais, ativar/desativar, modelo/mensagem personalizada e prévia do link verdadeiro. Opt-in opcional, não obrigatório em todas as publicações.

- [ ] Receber comentários por **webhook oficial Meta**, validar assinatura/autenticidade, conta e post, localizar vínculo exato de matéria.
- [ ] Idempotência/transaction/unique por evento/comentário/resposta para não duplicar envios em reentregas de webhook, falhas, retries ou cliques.
- [ ] Matching da palavra de forma controlada, com caixa/acento normalizados quando pertinente, **sem substring acidental** ou disparo fora do contexto.
- [ ] Conferir regra ativada, comentário elegível e janela/permissões/rate-limit da plataforma; enviar **uma resposta privada permitida por comentário** conforme contrato oficial vigente. Conferir limite atual e prazo de resposta (referência inicial de até 7 dias, **não pressupor sem verificação**).
- [ ] Mensagem controlada pela equipe, ex.: «Olá! Confira a cobertura completa e as fotos: {LINK_DIRETO_DA_MATERIA}». Sem IA respondendo livremente, sem spam e sem usar esse evento como permissão para campanhas futuras.
- [ ] Registrar comentário, compatibilidade, tentativa, resposta aceita pela API, erro/retry e cliques atribuídos; diferenciar **API aceitou** de mensagem recebida/lida.
- [ ] Opcional: resposta pública discreta «Confira seu Direct!» só quando permitida, sem repetição em massa.
- [ ] Mostrar por matéria: ligado/desligado, palavra, post vinculado, comentários totais/compatíveis, tentativas, respostas aceitas, falhas, cliques, visitas atribuídas (se medíveis).
- [ ] Segurança: tokens Meta cifrados ou cofre existente, rotação/expiração/reconexão, verificação webhook, permissionamento, trilha de auditoria, circuit breaker e proteção contra spam.
- [ ] Execução no backend com worker/cron existentes, independente de tela aberta. Testar respostas reais apenas com contas/comentários autorizados.
- [ ] Não declarar recurso «funcionando» antes de Meta Developer App, permissões/revisão, conexão e testes reais. Sem workaround extraoficial.

## FASE 4 — Central de Audiência integrada ao Controle

Preferir **GA4 Data API** se já existir ou for adequado. Números reais, cache/quota e credenciais seguras no backend; fuso da propriedade (preferencialmente `America/Sao_Paulo`). Não exigir que jornalista navegue ao serviço externo.

- [ ] Painel: visualizações, usuários ativos, sessões, usuários novos, tráfego diário, evolução/período anterior e matérias mais lidas — **métricas distintas**.
- [ ] Períodos: hoje, ontem, 7 dias, 30 dias, mês atual e intervalo personalizado; gráficos dia/hora e horários de pico reais.
- [ ] País, estado, cidade e ranking dos municípios da circulação, observando supressão de granularidade/privacidade; geolocalização por IP é aproximada.
- [ ] Ranking de matérias com título, data, visualizações, link e origens; detalhamento por matéria e evolução.
- [ ] Origem real: Facebook, Instagram, Google, direto, outros; não inferir rede sem evidência.
- [ ] Campanhas UTM padronizadas por artigo/canal e posição (Feed, Stories, bio, Direct/comentário), preservando URL original/canonical. Corrigir exemplo `matria_ID` para um padrão estável (ex. `materia_<id>`).
- [ ] Identificar cliques nos links compartilhados/Direct se viável, com redirect interno seguro (destino permitido, rápido, SEO e privacidade); separar cliques, sessões e acessos.
- [ ] Filtros por data/matéria/canal, gráficos, comparações, exportação CSV e dados recentes/tempo real apenas se API realmente suportar.
- [ ] Sem números inventados: indisponibilidade/quota/atraso retornam estado vazio/explicativo.

## FASE 5 — Complementos

Página bio, colagens automatizadas, modelos visuais, comparações avançadas e melhorias justificadas por resultados dos testes. Nunca adiar a automação de Direct, central no objetivo, para fazer apenas detalhes visuais.

## Modelo de dados a avaliar (NÃO CRIAR AINDA)

Somente após inspeção de schemas atuais: conexão institucional/credenciais Meta, registros de divulgação, vínculos article–external_media, configurações de palavra/mensagem por matéria, comentários/eventos idempotentes, tentativas de resposta, métricas agregadas quando necessárias. Usar tabelas/auditoria/RLS/permissions/cron existentes, sem guardar dados pessoais dos leitores desnecessariamente.

## Critérios de aceitação

**Facebook:** link/canonical corretos, imagem principal e título/descrição da prévia, navegação até matéria original, sem post duplicado e permissões respeitadas.

**Instagram:** fotos corretas e originais preservados, post corretamente vinculado, palavra exclusiva por matéria, não acionamento por comentários irrelevantes, resposta via API oficial com link correto, zero duplicatas por webhook, desligamento imediato, falha/permissão visível, Stories/link condizentes.

**Audiência:** métricas reais, datas e fusos corretos, matérias e regiões corretas quando disponíveis, origem/UTMs rastreáveis e apresentação separada de comentário, envio, clique, sessão e visualização.

**Segurança:** nenhum segredo no frontend/log; assinatura de webhook obrigatória; permissões internas, rate-limit e idempotência; evitar postagem/envio acidental nos testes; falhas de APIs externas não interrompem o funcionamento editorial.

## Quando iniciar

**Gatilho:** somente depois de concluir e validar a **programação** do módulo NFS-e (XML/XSD, assinatura, transporte SEFIN, cancelamento/consulta, DANFSe e entrega) e registrar eventuais pendências **externas** de A1/homologação/configurações. Primeiro inventário real do código; depois reutilização, implementação e PRs oficiais com CI; sem deploys automáticos.

**Em 15/11/2026 a implementação deste roadmap permanece propositalmente NÃO INICIADA.**
