# JORNAL IR — AUDITORIA GERAL DE REQUISITOS, DECISÕES E PENDÊNCIAS

**Data:** 17/10/2026  
**Finalidade:** recuperar o contexto aprovado nas conversas e documentos do Jornal IR, impedir regressões e indicar o que necessita comprovação.  
**Natureza da evidência:** síntese das conversas disponíveis, dos relatórios locais trazidos pelo usuário e dos documentos do repositório GitHub até a branch remota `release/contratos-nfse-integracao-20261016` (`24a841f`). Não representa inspeção direta do computador nem dos commits locais posteriores.  
**Escopo:** Jornal IR (portal, sistema, imprensa e integrações). Sistemas próprios do Altnix Informativo e players só entram na medida em que se integram ao cadastro/jornal.

> **REGRAS DE USO**
> 1. Antes de cada lote, consultar `CLAUDE.md`, `AGENTS.md`, `docs/ACORDOS-E-FONTE-DA-VERDADE.md`, `docs/STATUS-E-HANDOFF.md` **e esta auditoria**.
> 2. Diferenciar sempre **REQUISITO APROVADO**, **IMPLEMENTADO LOCALMENTE (RELATADO)**, **VALIDADO NO SISTEMA REAL** e **PUBLICADO**. Não concluir por inferência.
> 3. Para cada item, verificar código atual, interface e dados/migrations. A prioridade é **preservar funcionalidades e visual aprovados**, sem reintroduzir versões antigas ou fazer desenvolvimento paralelo.
> 4. O remoto GitHub pode estar ATRÁS da pasta local `Site-sistema`. Não executar `git pull`, cherry-pick, push ou deploy apenas com base neste arquivo.
> 5. Não tocar em `.env`, dados reais, Supabase remoto, WhatsApp real, cobranças, emissão/cancelamento fiscal, GitHub push ou Vercel sem autorização específica.

## 1. Fotografia do desenvolvimento, conforme relatório de 17/10

| Referência | Situação conhecida | Confirmação necessária |
|---|---|---|
| Diretório oficial `.../Informativo Regional/Site-sistema` | Repositório Git independente, branch local `consolidacao-local-20261016` | Conferir `pwd`, `git status` e `git rev-parse HEAD` a cada início |
| Último commit relatado | `61c944d` — modelos e geração automática de contratos, lote 3 | Claude reportou; ainda não houve auditoria independente dos arquivos locais |
| Backups | `Site-sistema-ANTIGO-BACKUP`, `Site-sistema-painel`, `jornalir-consolidacao-local` | Manter intocados até inventário e autorização explícita |
| Contratos, Assinador e NFS-e | Lotes 1, 2, 3 relatados concluídos localmente, com 147 testes no último lote (95+23+29) | Falta teste com Supabase real e homologação fiscal/serviços |
| Banco | Cinco migrations locais ainda não aplicadas: `20261029100600` a `20261029101000` | Auditar dependências, plano de backup/rollback e autorização antes da aplicação |
| Vercel | Produção anteriormente em `64c288a`; bloqueio 402 por cota de deploys; previews automáticos geraram muitas implantações | Verificar configuração real e evitar qualquer novo push até controlar previews |
| GitHub documentação | Existem documentos antigos, mas a documentação de governança criada posteriormente pode ainda não ter sido integrada/pushada | Confirmar presença de `CLAUDE.md`, `AGENTS.md` e docs atuais local/remoto |

## 2. Critérios e decisões globais que NÃO podem se perder

**G01 — Controle de alterações.** Usuário descreve a experiência desejada; assistente propõe melhorias tecnicamente justificadas com benefícios e impactos, sem alterar o aprovado silenciosamente. Lotes de até cinco mudanças; informar FEITO/FALTA/BLOQUEIOS; commits locais, publicação deliberada; comparar UI antes/depois e fazer teste com login real quando possível.

**G02 — Não confiar em build isolado.** Teste unitário/TypeScript/build **não** comprova UX correta, sessão autorizada, integrações externas nem produção. Em cada módulo registrar critérios de aceite manual (desktop e mobile), falhas e evidências.

**G03 — Linguagem visual sistema.** Compacto, sem espaços excessivos; feedback central por cerca de 5 segundos, erro vermelho com fechar; botões de inclusão `Novo +` dentro do próprio módulo, não menu lateral duplicado `Nova assinatura`; atualização de dados sem precisar F5. Menus mobile fecham ao clicar fora; módulo desabilitado desaparece da navegação e da autorização no servidor.

**G04 — Padrões editoriais.** TÍTULOS EM MAIÚSCULAS; horas `HH:MMh`; datas por dia da semana e dia entre parênteses, ex. `quarta-feira (07)`; relato jornalístico objetivo, sem destacar fala individual indevidamente. Para sessões legislativas, preservar narrativa com abertura pela presidência, ata anterior, matérias/discussão/aprovação, vereadores presentes e encerramento.

**G05 — Dados e auditoria.** Operações financeiras/contratuais e editoriais rastreáveis; preferir cancelamento/arquivamento e versões imutáveis, não deleção destrutiva. Sem segredos no frontend/logs. Permissões fail-closed.

## 3. Inventário por domínio — regras aprovadas e lacunas

### 3.1 Editorial / CMS / matérias / mídias

**E01 — Matérias:** título obrigatório; subtítulo, fotos/galeria e outros campos opcionais; corpo editável; editoria obrigatória e abrangência/localidade configurável; rascunho/em ajuste/programada/publicada/arquivada; programação com data/hora, destaque e notificação. Capa selecionada pelo operador; galeria ordenável; fotos nunca cortadas editorialmente (usar contain), lightbox unificado de capa/galeria. Não publicar automaticamente material importado.

**E02 — Destaques e posições:** manter decisão histórica de capa principal 8 vagas, faixa de destaques 3, últimas notícias 7 e Nossa Região 4, ressalvadas alterações posteriormente aprovadas no layout atual. Destaque extra não remove artigo de sua editoria. Urgente é separado e tem regras próprias. Conferir visual atual antes de ajustar números.

**E03 — Portal jornalístico:** evitar aparência de grade de cards SaaS como linguagem central; hero/editorial amplo, tipografia, hierarquia, navegação desktop/mobile. Header aprovado evoluiu entre uma e duas faixas — prevalece a tela aprovada mais recente, não copiar layout antigo sem comparação. Títulos, leitura e galeria devem continuar legíveis. `Voltar` em matérias segue a editoria real.

**E04 — Ordenação e acesso a acervo:** publicações mais recentes primeiro, `published_at DESC` com desempate estável; não ordenar por data da migração. Listagens/busca paginadas com cobertura do acervo completo, blocos de 10 páginas e `Ir para página`, preservando filtros. Estado do documento `POST_MIGRATION_PENDING` confirma migração histórica concluída; não rodá-la novamente.

**E05 — Upload editorial:** múltiplos arquivos com fila e miniaturas, ordem, X por hover desktop/visível mobile conforme contexto; informar nome, duração/tamanho original→final. Novos arquivos otimamente no R2, sem regredir mídias históricas. Conferir suporte às extensões realmente desejadas, inclusive MOV no produto Altnix quando cruzar integração. Limites de upload e compressão variaram por produto e devem ser verificados por área antes de unificar.

**E06 — Importação de matérias do PDF:** fidelidade ao impresso; pré-extrair título/subtítulo/texto/ordem/imagens e vínculos edição/página; operador pode juntar/separar candidatos, descartar publicidade, revisar e gerar rascunhos — nunca publicar automaticamente. Conferir se processo completo e vínculo à matéria estão funcionais, não somente uploads.

**PENDENTE DE VERIFICAÇÃO:** workflow autenticado de redação real, galeria, upload e editor, usuários e permissões, filtro de listas, paginação, push no momento da publicação.

### 3.2 Jornal Online e acervo histórico

**J01 — Fonte vigente mais recente:** PDF de edições novas no **Cloudflare R2**, banco Supabase só metadados, capa WebP da página 1, upload browser→R2 por URL pré-assinada para não passar PDF grande pela Function; `docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md` (12/10) prevalece sobre notas antigas que indicam Drive para PDFs novos.

**J02 — Leitor:** flipbook desktop otimizado sem pré-renderizar todas as páginas; mobile PDF.js com rolagem contínua, zoom por pinça, páginas lazy, indicador X/Y e opção de abrir/baixar. Capa não pode ficar em branco. Uma edição alimenta jornal online + extração para rascunhos, sem segundo upload.

**J03 — Legado:** migração de artigos 2015–2026 indicada como concluída nos docs; manter 19 grupos candidatos a duplicata, 50 `needs_review`, 30 itens em quarentena/classificados e 7 exceções de data para revisão humana, sem excluir/importar em massa. Os números são snapshot do documento e devem ser reconferidos, não comandos de limpeza.

**CONFLITO DOCUMENTAL:** `docs/POST_MIGRATION_PENDING.md` pede upload novo no Drive; `docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md` determina R2. Atualizar o documento antigo para refletir decisão vigente antes de usá-lo como instrução.

**PENDENTE DE VERIFICAÇÃO:** upload real, capa, abertura mobile/desktop, Range/CORS, integridade, fluxo de extração, vínculos edição/página, tratamento de erro e PDF órfão.

### 3.3 Aniversariantes / pessoas e instituições

**A01 — LAYOUT APROVADO PROTEGIDO.** Já houve reversão visual. Estrutura com agrupamento/árvore expansível de pessoa/empresa/instituição e pessoas vinculadas. Instituição/CNPJ é agrupador e pode ter dado de fundação próprio; **fundação não é aniversário pessoal**. Cada pessoa vinculada possui nome/nascimento/cidade/vínculo e possibilidade de publicação individual.

**A02 — Filtros:** período editorial padrão quinta→quarta; filtros dia/mês (independente do ano), Todos/Hoje/Semana do Jornal/mês/período/cidade/publicação/origem e busca. Dados de nascimento dia/mês/ano no cadastro. Lista editorial permite ajustes sem alterar indevidamente cadastro mestre.

**A03 — Mensagens:** aproximadamente 36 modelos aprovados, textos de 2–3 frases, personalizados conforme pessoa/função (prefeito, empresário etc.), evitando repetições na edição; gerar para o conjunto semanal, editar manualmente, destacar com foto quando houver; vários cadastros têm somente data e devem continuar suportados.

**A04 — Operação:** `Novo +` excepcional dentro do módulo; miniaturas e remoção X apenas hover desktop, permanente em mobile; NÃO duplicar `Retirar` e X; remover antes de salvar; evitar registros duplicados, scroll interno desnecessário e botão/versão antiga reaparecendo. Atualização da tela sem F5.

**ALTA PRIORIDADE DE ACEITE VISUAL:** comparar com imagens e descrições aprovadas, autenticado em desktop e mobile. Relatório de branch/base não comprova o estado final mostrado ao usuário.

**VERIFICADO EM 17/10/2026 (auditoria de código, sem sessão autenticada):** A01 (agrupamento/árvore/publicação individual), A02 (filtros, período quinta→quarta, dia/mês independente de ano) e A04 (Novo +, X hover/mobile, sem duplicar Retirar+X, sem F5) **conferem exatamente com o código atual** — `BirthdaysList.tsx`/`page.tsx`/`actions.ts`, ambas branches `release/aniversariantes-*` já são ancestrais do HEAD local. Dois achados que exigem decisão/registro, não resolvidos automaticamente:
- **A01 — dado de fundação de instituição NÃO existe no banco.** A constraint `clients_identity_by_kind` (`20261014110000_clients.sql`) bloqueia qualquer data para `kind='company'`. Não há conflação (PJ nunca aparece como aniversariante), mas o direito concedido em A01 ("pode ter dado de fundação próprio") está ausente, exigindo nova coluna/migration — fora do escopo deste lote (migrations não tocadas).
- **A03 — CONTRADIÇÃO DOCUMENTAL confirmada**, registrada na seção 5 abaixo: a migration `20261025100200_birthday_edition_messages.sql` declara "decisão final do módulo removeu" destaque com foto e edição manual de texto — direto em conflito com a redação de A03 aqui. Nenhuma das duas foi escolhida unilateralmente; aguardando esclarecimento do usuário.
- Contagem real de modelos de mensagem: **44** (não ~36) — drift de número, não regressão (nunca ficou abaixo do mínimo).
- Corrigido (sem mudança de comportamento): comentários desatualizados em `packages/core/src/aniversariantes/birthday-repository.ts` e `apps/sistema/src/providers/supabase/birthdayRepository.supabase.ts` afirmavam falsamente que a tela ainda era "100% em memória" — a persistência real já existe via `actions.ts`, direto no Supabase, sem passar por essas duas camadas (hoje órfãs/não chamadas). Risco real de regressão futura se alguém confiasse nesse comentário; comentário corrigido, arquivos não removidos (decisão de remoção não tomada nesta sessão).

### 3.4 Menus, usuários, permissões e autenticação

**U01 — Navegação:** menu apenas módulos, `Novo +` dentro das telas (assinaturas e outros); mobile claro e recolhível ao clicar fora; módulo desativado não aparece nem é acessível via URL direta.

**U02 — Acesso:** admin/owner total; operadores configuráveis por módulo, com acesso/gravação condicionados à atividade/perfil e RLS, login e recuperação de senha. Permissões **granulares do Financeiro** permitem criar/acessar/enviar PIX sem poder baixar/cancelar/estornar, entre outras combinações. Não confiar apenas em botão oculto.

**U03 — Conflitos técnicos:** branches `release/consolidacao-permissoes-20261016-lote1` e `release/finance-permissions-guards-20261015` diferem e não foram fundidas. Preservar e revisar **por último**, sem desfazer proteção que já existe, mas não deixar rotas vulneráveis enquanto espera.

**U04 — Acesso de signatários:** cadastro criado para confirmar OTP de contrato não recebe automaticamente perfil de staff ativo. Testar realmente Auth trigger, middleware e RLS antes de produção.

**VERIFICADO EM 17/10/2026 (auditoria de código):** U01, U03 e U04 **conferem exatamente** — menu só módulos, sem "Novo +" duplicado em nenhum lugar; `middleware.ts` bloqueia módulo desativado tanto no menu quanto por URL direta via RPC `staff_can_see_module` (nunca só client-side); mobile fecha ao clicar fora (`<dialog>` + handlers dedicados); as duas branches de permissões financeiras continuam genuinamente não mescladas, sem código misto/meio-aplicado no branch atual; `account_purpose=contract_signer` confirmado `profiles.active=false` ponta a ponta. **U02 — permissão granular do Financeiro continua ausente** (só um switch único `financeiro: true/false` em `staffPermissionsCatalog.ts`, sem flags separadas para criar/enviar PIX vs. baixar/cancelar) — isso é exatamente o que U03 já registra como deliberadamente adiado, não uma regressão nova; não implementado neste lote por estar fora do escopo autorizado. Item G03 "mensagens centrais ~5s" não tem componente de toast/snackbar compartilhado no código (cada tela mostra mensagem inline própria) — observação registrada, não corrigida (fora dos 3 tópicos autorizados deste lote).

### 3.5 Clientes, contatos e integração Altnix Informativo

**C01 — Fonte única:** `public.clients` Jornal IR é cadastro mestre para clientes, contratos, vendas e financeiro. Altnix Informativo/TV LED consome apenas informações comuns de clientes digitais vinculados e continua administrando mídias/playlist/dispositivos próprios. Não criar um segundo mestre, não alterar UX/player ou excluir operação existente. Não liberar acesso no Altnix a todos os clientes do jornal; somente aos contratantes com divulgação digital.

**C02 — Importação:** usuário delimitou lista específica de clientes a aproveitar (houve relatório local de quatro); registros testes fora da seleção devem ser tratados com arquivamento e verificação de vínculos, sem exclusão cega. Alterações refletidas na interface imediatamente.

**C03 — Mecanismo futuro:** sincronização Jornal→Altnix via ID mestre, upsert controlado, sem apagar dados de equipamentos/operacionais. `docs/ALTNIX-INFORMATIVO-SYNC-FUTURO.md` registra explicitamente **não implementado** no snapshot remoto; só liberar após contratos/assinatura e testes reais, sem interromper TVs.

### 3.6 Financeiro, Asaas, PIX, crédito e cobrança

**F01 — Visão geral:** filtro de calendário unificado início/fim, visualizações hoje/semana segunda–domingo/mês; métricas vencidos, recebidos, títulos abertos. Não repetir entradas `Nova...` nos menus.

**F02 — Formas de recebimento:** dinheiro, PIX, transferência, cheque, cartão crédito/débito, boleto, permuta, comodato e outros. Baixa parcial/pingada, histórico por parcela/origem, recibos imprimíveis selecionados ou todos ativos; cobrança PIX é distinta da baixa/recibo.

**F03 — Crédito do cliente:** crédito da mesma assinatura/contrato aplica automaticamente; de outra origem só manual. Liquidar título mais antigo por regra aprovada, sem fundir títulos; RPC atômica e testes de concorrência/idempotência obrigatórios.

**F04 — Inadimplência:** aviso de fatura antes do vencimento, lembrete no vencimento; tolerância de 2 dias e suspensão de publicidade no 3º dia de atraso, com aviso correspondente (confirmar regras específicas por contrato). Evitar mensagens automáticas insistentes; gerar notificações internas para atrasos persistentes, suspensões e falhas.

**F05 — Asaas:** PIX QR/copia-e-cola e envio autorizado, cancelamento/expiração sincronizados, webhook idempotente para confirmação de pagamento; auditoria dos eventos e permissão de ação. Notificar por WhatsApp usando template aprovado, sem reutilizar indevidamente template de pagamento para assinatura.

**F06 — Comercial:** vendas/publicidade, produtos/canais, parcelas e recibíveis vinculados a clientes; propostas/orçamentos e contratos, anexos e veiculações; assinaturas comerciais e financeiro devem compartilhar histórico, sem dados duplicados.

**PENDENTE DE VERIFICAÇÃO:** sessão de operador real com permissões por ação, baixa parcial, PIX webhook e concorrência, suspensão/retomada de anúncios, descontos/créditos, relatórios e notificações internas.

### 3.7 Contratos, modelos de documentos, assinador eletrônico

**K01 — Upload privado, originais imutáveis:** contrato, aditivos/empenhos/parcelas, documentos por cliente; PDF original preservado. Modelos cadastráveis categorizados, versionamento imutável, variáveis do cadastro, conferência antes de gerar, PDF paginado e arquivado sem HTML/script arbitrário; upload manual continua válido.

**K02 — Último lote local relatado:** commit `61c944d`: `/sistema/financeiro/modelos-contrato`, cadastro/duplicação/versões, placeholders, geração PDF com `pdf-lib` e integração a `contract_documents`. **147 testes totais reportados** (95+23+29), typecheck/build, sem E2E Supabase; não considerar homologado até inspecionar local.

**K03 — Assinaturas:** convites individuais criptográficos, expiração/revogação/reenvio com novo token, OTP e-mail, consentimento, canvas, comprovante com hash, assinatura de vários participantes em cadeia PDF, estado por participante, documento consolidado final, auditoria. Não atribuir a isso certificação ICP-Brasil/PAdES.

**K04 — E-mail/WhatsApp:** envio via Meta só com template aprovado de assinatura e opt-in, distinguir API aceitou/entregou/leu; mailto/manual não é serviço transacional. Confirmar OTP real, status, reenvio e notificação ao responsável.

**K05 — Banco pendente (relatório Claude local):**
- `20261029100600_contract_multi_signer.sql`
- `20261029100700_contract_signature_resend_link.sql`
- `20261029100800_nfse_transmission_concurrency_guard.sql`
- `20261029100900_nfse_cancellation_preparation.sql`
- `20261029101000_contract_templates.sql`

**CRÍTICO:** validar schema/aplicação em ambiente de teste apropriado antes de declarar fluxo multiassinado disponível para uso real. Preparar rollout/rollback e verificar invariantes de concorrência.

### 3.8 NFS-e Nacional

**N01 — Prontidão fiscal:** município São João do Sul/SC, dados fiscais, competência explícita, código nacional e parâmetros municipais oficiais, série DPS, XSD oficial, assinatura XML, certificado A1, criptografia e mTLS. Não hardcodar alíquotas ou criar nota autorizada fictícia.

**N02 — Recuperações locais relatadas:** SHA `f8a3783` (service_role server-only/fingerprint/cert bag/validade), `36e3276` (consulta parâmetros ADN por ambiente, mocks e painel), `c4c02d5` (GET DPS/NFS-e offline, mutex/idempotência, bloqueio de uncertain, preparo cancelamento). **Não equivale a teste certificado ou portal oficial real**.

**N03 — Emissão/consulta/cancelamento:** consulta real SEFIN/ADN exige autorização/certificado e confirmação do formato oficial. Emissão e cancelamento reais bloqueados até homologação. A resposta de GET DPS/NFS-e foi mantida bruta em mocks, não ligada ao provider real; endpoint/formato do evento `e101101` para cancelamento ainda precisa confirmação. Não preencher lacunas com suposições.

### 3.9 Agenda, Pauta, reuniões, Telegram, notificações

**T01 — Agenda:** compromissos com título/descrição/data/hora; convidados específicos ou todos, responsável(is), recorrência, edição, histórico, alerta individual e geral, convites para reunião com estado por pessoa `aceito/recusado/pendente` visível ao organizador.

**T02 — Pauta da Semana:** tarefas por pessoa, riscar ao concluir sem apagar, registro/histórico, integração Agenda↔Pauta↔Matéria (possibilidade de rascunho); não recriar módulos independentes que não conversam.

**T03 — Telegram:** grupo dedicado `Jornal IR | Agenda e Pauta`, notificações gerais no grupo e individuais personalizadas por responsável, horário e assunto. Verificar credenciais, agendamento real e entrega; relatório antigo não prova ativação.

**T04 — Sininho/push:** usuário reportou clique no sininho causando erro; notificação normal/urgente, canais móveis e web, sons/vibração para urgente; agenda com alarmes. App Android/iOS para leitores e equipe é etapa futura. Verificar execução em navegador e com segundo usuário, permissões de push, assinaturas e notificações.

### 3.10 Publicidade do site, comercial e planos

**P01 — Posição:** seis slots laterais — três por lado no desktop — e adaptações mobile; anúncios do lado esquerdo e do lado direito com posições e ordem gravadas, sem confundir a posição do upload. Miniaturas por arquivo, múltiplas imagens, rotação e ativação/validade por posição.

**P02 — Rotação:** padrão de referência anterior 10 segundos, mas usuário também pediu **tempo configurável por imagem**; editor global de efeitos/transições (aproximadamente 10 opções). Arte original vs esticada/ajustada conforme escolha; não distorcer preview sem configuração. Botão X por hover desktop e visível mobile; manter upload múltiplo e R2 público para publicidade.

**P03 — Cobertura e medidas:** 1.000 exemplares às quintas e cobertura impressa de São João do Sul, Praia Grande, Passo de Torres, Santa Rosa do Sul (SC); Mampituba, Morrinhos do Sul, Torres (RS). Medidas comerciais descritas em `docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md`: folha `25×36 cm`; meia `25×18`; 1/4 `12,5×18`; padrão `8,4×12`; cartão `8,4×6`. **Não confundir** com medida especial de arte eleitoral `26×16,7 cm`.

**P04 — Solicitações e propostas:** fluxo Assine/Anuncie integrado ao comercial, contratos e financeiro; acompanhar solicitação, lançamento, cliente, parcelas, anúncio e resultado, sem criar formulário que desaparece sem registrar.

**VERIFICADO E PARCIALMENTE CORRIGIDO EM 17/10/2026 (auditoria de código):**
- **P01 confere integralmente** — 6 posições fixas, esquerda/direita com `slot_number`/`sort_order` nunca confundidos, miniaturas, múltiplo upload, ativação/validade por imagem.
- **P02 — gaps confirmados, parcialmente corrigidos sem migration:**
  - Rótulo "Tempo por imagem" corrigido para "Tempo de rotação desta posição" + texto explicativo (`SiteAdSlotsPanel.tsx`) — o campo sempre controlou a posição inteira (coluna `rotation_interval_ms` em `site_ad_slots`), nunca por imagem individual; o rótulo antigo induzia a erro. **Duração/efeito/ajuste por imagem individual continuam pendentes — exigem nova coluna em `site_ad_media` e migration, fora do escopo autorizado deste lote.**
  - Confirmado: só 6 das 10 opções de transição (`SiteAdTransitionEffect`, com CSS já implementado para as 10) estão liberadas na UI/constraint do banco (`SiteAdSlotTransitionEffect`, 6 valores) — "editor global de ~10 opções" não existe como editor único; é por posição, com 6 opções. Ampliar exige alterar a constraint (migration) — não feito.
  - `fit_mode` (original/esticada) também é por posição, não por imagem — mesma limitação de granularidade.
- **P04 — gap de rastreabilidade confirmado e mitigado sem migration:** nenhuma coluna liga `commercial_sales`/`commercial_proposals` ao banner real (`site_ad_slots`/`site_ad_media`) — uma venda `channel='website'` paga não aponta pra nenhuma posição configurada. Mitigação aplicada: `CommercialSaleDetail.tsx` agora mostra um link direto para `/sistema/configuracoes/patrocinadores` quando `channel` é "website", como lembrete ao operador. **Vínculo estrutural (FK) continua pendente — exigiria migration.**
- **ACHADO NOVO, CRÍTICO, NÃO CORRIGIDO (migrations não tocadas por instrução explícita deste lote):** as migrations de publicidade/comercial têm **ordem de arquivo incompatível com suas dependências reais** — `20261029100200_site_ad_slots.sql` (adicionado ao git em 11/10) faz `CREATE TABLE site_ad_slots`/`site_ad_media`, mas os arquivos de 14-15/10 (`20261014015734`, `20261014022359`, `20261014124630`, `20261014124907`, `20261015030545`) fazem `ALTER TABLE` nessas mesmas tabelas com nomes de arquivo **anteriores** ao `CREATE TABLE` — em ordem de timestamp, as `ALTER` tentariam rodar antes da tabela existir e falhariam. Mesmo padrão entre `20261013043920_site_interest_conversion_links.sql` (referencia `commercial_proposals`) e `20261029100000_commercial_proposals.sql` (cria a tabela). **Nenhuma dessas migrations foi aplicada a nenhum banco real ainda** (confirmado pelos próprios comentários de cabeçalho "NÃO aplicada ainda") — mas precisam ser renomeadas/reordenadas antes de qualquer aplicação futura, em um lote dedicado a migrations, com autorização específica.

### 3.11 Apps, experiência mobile e Altnix Informativo

**M01 — Portal e Sistema:** UX mobile clara, menus e permissões equivalentes ao desktop; apps Android/iOS futuros com push normal e alerta urgente com som/vibração, alarmes da agenda; acesso segmentado por perfil.

**M02 — Integração com Altnix:** manter fluxo de TV/LED funcionando sem ruptura; sistema de mídia/players e OTA são outro produto e não devem ser refatorados no Jornal IR para compensar integração de cadastro. Quando houver comunicação, sincronizar somente clientes habilitados/dados comuns, não estrutura operacional.

### 3.12 Governança de código, segurança e deploy

**D01 — Vercel:** foi observado consumo elevado de deploys por preview automático de branches e commits, e resposta 402 de limite diário. **Não foi comprovado que previews automáticos foram desativados**. Priorizar controle operacional antes de voltar a enviar commits. GitHub e Vercel são operações diferentes, mas um push pode causar build/deploy automaticamente.

**D02 — Fonte de verdade:** GitHub armazena histórico compartilhado, mas os commits `ba3955f`, `f8a3783`, `36e3276`, `1c32734`, `c4c02d5`, `61c944d` foram **reportados como locais**, não inferir que estão no remoto. `CLAUDE.md` e arquivos de governança precisam existir local e depois sincronizados deliberadamente.

**D03 — Diagnóstico da UX 404:** relatório local disse que certas páginas dinâmicas com `notFound()` renderizam o texto 404 mas podem responder HTTP 200 sob streaming no Next 14.2.33; checar `noindex` e comportamento real antes de alterar versão/framework.

**D04 — Backups e OneDrive:** preservados, nunca limpar automaticamente; `.env.local` ignorado no Git ainda pode estar sincronizado pelo OneDrive. Evitar logs de segredo e renomeações de worktree sem reparo.

## 4. Pendências priorizadas para trabalho efetivo

| Prioridade | Próxima ação | Dependência/aceite |
|---|---|---|
| P0 | Conferir se arquivos de governança estão integrados no `Site-sistema` e atualizados para commit `61c944d` | Arquivos lidos antes de cada lote; nenhum push acidental |
| P0 | Auditar 5 migrations locais e preparar plano de aplicação em ambiente apropriado | Não aplicar produção sem autorização; testar Auth/RLS/RPC, modelos e concorrência |
| P0 | Provar visualmente Aniversariantes, menus, patrocinadores e fluxo usuário (desktop/mobile) | Comparar tela aprovada vs tela atual, com usuário autenticado; não regressar |
| P0 | Controlar preview deploys Vercel antes de novos pushes | Verificar os dois projetos e política de deploy; não alterar sem aprovação |
| P1 | E2E de contratos/modelos/multiassinatura com banco de teste apropriado | Versionamento, OTP, signatários, comprovantes, histórico e isolamento |
| P1 | Testes reais do Financeiro/Asaas, permissões e suspensão de anúncios | Valores/baixas/créditos/webhook/alertas; sem pagamento real involuntário |
| P1 | Confirmar processo de Jornal Online R2, capa, leitor e extração | Revisar conflito documental Drive→R2; teste UI/editor autenticado |
| P1 | Teste funcional Agenda/Pauta/Sininho/Telegram/Push | Reuniões com convidados e aceite/recusa, recorrência e falhas |
| P1 | Testar publicidade e comercial completos | Slots, playlists por posição, rotação, efeitos, validade, Assine/Anuncie |
| P2 | Configurar com autorização WhatsApp template assinatura e e-mail OTP/transacional | Templates aprovados, opt-in, falhas e entrega verificável |
| P2 | Homologar NFS-e no ambiente oficial com certificado real e validação XSD | Dependência fiscal externa; produção bloqueada |
| P2 | Revisar manualmente exceções e duplicatas históricas | Não rodar nova migração nem remover conteúdo automaticamente |
| P2 | Integrar cadastro Jornal IR→Altnix Informativo após estabilizar jornal | Sem perda de cliente/player/playlist; acesso apenas clientes digitais |
| Final | Conciliar branches divergentes de segurança/permissões financeiras | Revisão completa e testes de perfis, sem merge cego |

## 5. Contradições/versões antigas que exigem aviso explícito

1. **Google Drive versus R2** para *novos* PDFs de edições: prevalece decisão posterior de R2 (`docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md`). Documento `POST_MIGRATION_PENDING` precisa revisão.
2. **GitHub remoto versus código local:** os documentos no remoto e branch do item 5 podem estar atrasados em relação ao `Site-sistema` local. Não fazer checkout para “atualizar” sem comparar.
3. **Aniversariantes antigo versus layout aprovado:** não tratar compilação ou branch mais nova como prova do layout correto; exigem screenshot/teste real.
4. **Permissões financeiras em duas linhas de desenvolvimento:** não escolher branch pelo número de commits; comparar diff por regra de negócio e testes.
5. **Meta WhatsApp:** `accepted_by_meta` não é entregue/lido; `mailto:` não envia e-mail via backend.
6. **NFS-e:** mocks e PDF/testes de XML não equivalem à emissão, consulta ou cancelamento homologados.
7. **Medidas editoriais/comerciais:** dimensões para arte eleitoral específica não substituem formato comercial padrão do jornal.
8. **Fases antigas no `AI_HANDOFF`/`CURRENT-STATE`:** snapshots históricos úteis, não estado atual automaticamente.
9. **NOVO (17/10/2026) — Aniversariantes: destaque com foto / edição manual de mensagem.** Esta auditoria (A03, seção 3.3) e `docs/ACORDOS-E-FONTE-DA-VERDADE.md` listam "destacar com foto quando houver" e "editar manualmente" como requisitos aprovados. A migration `supabase/migrations/20261025100200_birthday_edition_messages.sql` (comentário da tabela) declara que a "decisão final do módulo" **removeu** as duas funcionalidades, e o código atual (`BirthdaysList.tsx`) de fato não tem nem campo de foto nem texto editável — só "Trocar mensagem" (sorteia outro modelo) e "Copiar". **Não resolvido nesta sessão** — nenhuma das duas versões foi escolhida; precisa de confirmação direta do usuário sobre qual é a decisão vigente.
10. **NOVO (17/10/2026) — ordem de arquivo das migrations de publicidade/comercial incompatível com dependências reais.** Ver seção 3.10 (P02/P04) — `20261029100200_site_ad_slots.sql` é alterado por arquivos com nome de data anterior (`20261014*`/`20261015*`); `20261013043920_site_interest_conversion_links.sql` referencia uma tabela só criada por `20261029100000_commercial_proposals.sql`. Nenhuma foi aplicada a banco real; precisam ser reordenadas/renomeadas antes de qualquer aplicação futura, em lote dedicado.

## 6. Roteiro de validação para cada lote do Claude

Ao iniciar: ler docs, confirmar `Site-sistema`, branch e HEAD, estado Git limpo, mapear a jornada do usuário afetada e capturar o critério de aceite anterior.  
Durante: selecionar até cinco mudanças; preservar componentes aprovados; testes unitários e integração segura; não acionar serviços reais sem autorização.  
Ao terminar: registrar no `docs/STATUS-E-HANDOFF.md` commit local e migrations; atualizar esta auditoria se surgiu decisão nova; mostrar qual tela foi efetivamente conferida e o que permanece não testado.  
Antes de publicar: lista de ambientes/segredos/migrations, bloqueios Vercel, backup/rollback, smoke test de usuário, aprovação explícita e aferição pós-release.

---

**Nota final:** Este documento é um *inventário de obrigações e riscos*, não um comando para implementar tudo simultaneamente. Requisitos pedidos não podem ser marcados “feitos” sem verificação de código, comportamento e/ou operação real. Nenhuma alteração no GitHub, Vercel, Supabase ou pastas locais do usuário foi efetuada nesta auditoria.
