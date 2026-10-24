# Jornal IR — Fechamento real dos módulos (24/10/2026)

## Regra operacional

Concluir **um módulo por vez**, sem marcar como pronto apenas porque o CI ficou
verde. Para cada módulo: preservar requisitos do usuário; conferir código,
permissões, migrations e UI desktop/mobile; testar cenário normal, erro,
concorrência e terceiros; registrar SHA/CI; homologar com dados de teste;
somente depois planejar publicação. Esta lista não autoriza merge, envio,
cobrança, migrations no Supabase remoto ou deploy.

**PR de trabalho:** #15 em
`feature/homologacao-integrada-ir-20261023`, base
`feature/abrangencias-geo-notificacoes-20261021`. Main divergente e
máquina local do VS Code **não sincronizada/comparada neste lote**.
Não usar a PR como release direta.

| Ordem | Módulo | Estado de programação | Bloqueio real para fechamento |
|---|---|---|---|
| 1 | Contratos e assinatura comercial | PDFs versionados, revisão, múltiplos signatários e comprovantes; novo registro persistente de tentativa, retomada de storage, anti-spam de OTP, download restrito após validação de e-mail, token sem indexação | Homologar SMTP/OTP e 2–3 signatários com falha injetada; aprovar modelos jurídicos; fluxo de aditivos implementado em código, pendente homologação real |
| 2 | Usuários e acesso | Nome real, recuperação de senha, permissões, novos perfis inativos e diagnósticos SMTP | Envio e recebimento real; dois nomes antigos e convites pendentes; permissões de operador testadas autenticadas |
| 3 | Financeiro e comercial | Origens de vendas, propostas, recebíveis e guardas granulares | Guardas e reexecução de parcelas/Pix codificadas; pendem sandbox Asaas/WhatsApp, créditos, baixa, locações e veiculação |
| 4 | Editor de matérias, mídias e portal | Estrela da capa, recorte desktop, lista e leitura do portal | Comparação visual aprovada, fluxo editorial com autenticação, galeria, uploads R2, página do artigo, SEO, transição de abertura e compartilhamento |
| 5 | Jornal Online e importação de PDF | Arquivo R2 e extração em rascunhos; limite atual até 100 MiB | Upload real/capa/leitor desktop-mobile, Range/CORS, duplicatas e relação com edição sem segundo upload |
| 6 | Aniversariantes | Telas e gerador existentes | Layout aprovado e mensagens personalizadas; filtros por dia/mês; instituições/CNPJ; Novo+; eliminação de duplicações/scroll e atualização sem F5 |
| 7 | Agenda/Pauta e notificações | Compromissos, tarefas e sincronização UI | Convites de reunião por pessoa com aceito/recusado/pendente; Telegram entrega real; lembretes individuais/gerais, push e sininho |
| 8 | Publicidade e planos | Slots, rotação, efeitos e imagens configuráveis | Veiculação 6 slots desktop/mobile, validade, contratos, Assine/Anuncie, inadimplência/suspensão e coerência dos dados |
| 9 | NFS-e nacional | Estrutura de certificado, XML e preparação | Ambiente oficial/município, XSD, transmissão, consulta/cancelamento; sem emissão real sem autorização |
| 10 | Cadastros integrados | Cliente mestre Jornal definido | Sincronização jornal→Altnix Informativo SOMENTE para clientes digitais, sem interferir em players, mídia/OTA |
| 11 | Homologação geral e publicação | GitHub Actions demonstram build/RLS/replay em sandbox | Comparar worktree local e branches, backups, controlar previews Vercel, plano de rollback e QA autenticado; autorização explícita para publicar |

## Bloco em execução: 1 — Contratos

Mudanças de 24/10:
- Nova migration `20261116100000_commercial_signature_attempt_recovery.sql`.
- `commercialEvidenceStorage.ts`: evidências imutáveis reutilizadas em
  retomadas, com validação de SHA e falha fechada em erros de rede.
- `sendCommercialSignatureOtpAction`: limite mínimo de 60s e 8 códigos/24h.
- `commercialDocumentAccess.ts`: token do convite **sozinho não abre PDF**;
  sessão e e-mail devem corresponder ao convite confirmado.
- `CommercialSignatureRequestsPanel`: status de tentativas para revisor.
- Correção da corrida de revogação de convite durante assinatura.
- Cabeçalhos de segurança e não indexação de páginas de token.
- Novos testes em `apps/sistema/test/commercial-evidence-recovery.test.ts`
  e `commercial-document-access.test.ts`; verificações RLS no sandbox.

**Não marcar módulo 1 totalmente homologado** sem assinatura real em
homologação, SMTP, revisão jurídica e aditivos. Código verde não valida o
processo externo. Depois de fechar, avançar módulo 2 e registrar novo estado.

## Regras visuais e funcionais aprovadas a preservar

- Títulos jornalísticos em MAIÚSCULAS; data com dia da semana + (dia);
  horas HH:MMh.
- Botões `Novo +` dentro de módulos, não menus duplicados.
- Mensagens centrais breves, erro vermelho com fechamento; mobile sem
  regressão e módulo invisível quando sem permissão.
- Editor de aniversariantes aprovado não pode voltar para layout antigo.
- Contrato gerado a partir do tipo de serviço; combinado ou individual
  conforme a venda, sem gerar PIX ou recebedor duplicado.
- Cadastro mestre único Jornal IR; outros sistemas só consomem
  clientes digitais autorizados.

### Emissão de PDF original idempotente — 24/10/2026

- `commercialDocumentId(packageId, serviceId)` deriva UUID v8 determinístico
  por pacote e serviço (ou documento combinado), evitando criar novo
  caminho em cada retry. Nenhum serviço de cobrança é acionado.
- `issueCommercialContractDocumentsAction` usa `persistCommercialEvidence`
  no bucket privado `contract-documents`: recupera PDF de emissão anterior
  cujo upload concluiu mas o INSERT falhou, valida PDF, grava o hash real e
  recusa alterações destrutivas. Se outra requisição registrou o documento,
  só aceita idênticos serviço, modelo, versão, SHA e caminho.
- Rastreia `recovered=true` na auditoria complementar. Teste de UUIDs
  estáveis e de separação por serviço/contratação integrado ao CI.
- **Limitação:** arquivos órfãos criados por versões antigas que usavam
  UUIDs aleatórios continuam exigindo conciliação manual; a mudança
  não apaga nem varre storage histórico automaticamente.


## 24/10/2026 — Contratos: aditivos comerciais após o PDF original

- Migration `20261118100000_commercial_contract_addenda.sql`: registra
  `commercial_contract_addenda`, histórico `commercial_contract_addendum_events`
  e adiciona `addendum_id` a `commercial_contract_documents`. Apenas
  documentos originais contam para os índices únicos da modalidade combinada
  ou individual. Aditivos podem coexistir sem alterar o original.
- A criação exige permissão `publicidade.contratos_preparar`,
  pacote jurídico aprovado e documento original emitido. SQL numera o
  aditivo por contrato e preserva origem; não aceita origem em outro
  pacote nem utilizar aditivo como documento original.
- Rascunho pode ser editado, depois encaminhado a revisor autorizado.
  A aprovação exige texto legal suficiente, CONTRATANTE/CONTRATADA,
  indicação de ADITIVO e justificativa humana de 20 a 1000 caracteres.
  Devolução preserva justificativa na trilha e a exibe ao preparador.
  Depois da aprovação o texto é imutável.
- Prévia PDF identificada claramente como **MINUTA — NÃO ASSINAR**
  com acesso interno, antes de aprovação.
- Emissão após aprovação: PDF novo separado com texto aprovado,
  referência e SHA-256 do original, caminho privado e ID determinístico
  por aditivo. Arquivo/registro são reutilizados ou verificados na
  reexecução, sem apagar evidência nem criar cobrança.
- Após emitir, o PDF aparece junto aos documentos da venda e pode ter
  preparação de signatários, OTP, aceite e comprovante **exclusivamente
  no assinador comercial já implementado**.
- Contratos antigos emitidos/assinados não são editados; aditivo
  também não altera valores, parcelas, PIX ou cobrança por conta própria.
  Qualquer efeito financeiro exige fluxo comercial/financeiro explícito.
- Testes: novo índice original-vs-aditivo, RLS de aprovação/eventos,
  guardas, compilação TypeScript/Next e reconstrução integral de migrations.
  O ensaio humano ainda precisa confirmar rascunho→devolução→aprovação→
  emissão→assinatura de aditivo com usuário preparador e revisor distintos.
- O texto jurídico precisa de revisão responsável; regex e CI não
  constituem aprovação legal. Nenhuma emissão/assinatura real autorizada.


## 24/10/2026 — Módulo 2: controles de acesso e convites (homologação)

- `20261119100000_staff_membership_authorization.sql` cria
  `staff_memberships` para separar operadores/administradores de
  signatários externos do Auth; somente o fluxo administrativo com
  service_role cria membership. Backfill conservador de owner/admin
  e contas já convidadas via Supabase Auth.
- `is_active_staff`, `is_active_admin`, `is_active_owner` e
  `is_active_admin_or_owner` passam a exigir perfil ativo,
  membership e e-mail confirmado. Helpers de menu/financeiro continuam
  usando essas autorizações centrais.
- Middleware autentica com `getUser`, exige autorização da RPC,
  falha fechada se não houver Supabase e evita loop entre login/painel.
  UI distingue `pendente` de `inativo`.
- `inviteUser` só é aceito por owner/admin confirmado, com autorização
  criada antes de ativar conta; nome, papel e status na mesma atualização.
  Lista administrativa filtra memberships; não expõe signatários externos.
  E-mail/reenvio/recuperação respeitam membership de destino.
- `AuthProvider` só apresenta conteúdo interno para staff confirmado.
  Administrador não pode ativar colaborador sem confirmação de e-mail;
  RLS exige a mesma condição.
- `staff-access-policy.test.ts` testa ausência de sessão, OTP externo,
  confirmação pendente, perfil desativado e acessos por papel.
  O sandbox cria conta externa com metadata falsa, verifica ausência
  de membership e impede acesso mesmo se `profiles.active=true`.
- **Não alterar cadastros reais**: nomes derivados do início do e-mail
  precisam ser informados pelo responsável, sem suposições. O projeto
  `site-system-ir` possuía dois convites não confirmados na última
  consulta de leitura.
- **SMTP ainda é pendência de homologação operacional**: escolher
  provedor, configurar SMTP e autenticação de domínio no Supabase Auth,
  URLs de convite/recovery, teste de entrega em caixa controlada.
  `docs/USUARIOS-AUTH-EMAIL-CHECKLIST-20261024.md` contém roteiro.
- Sem merge/deploy, sem envio real e sem alteração no Supabase remoto.

## Proteção do OTP externo sem desconexão indevida

`RootProviders` envolve o app inteiro, inclusive a rota pública de
assinaturas; **não** executar `auth.signOut()` automaticamente quando
um usuário autenticado não pertence a `staff_memberships`.
O `AuthProvider` marca o acesso interno como `inactive`, o
`AuthGate` bloqueia a UI e o middleware/RLS negam rotas
`/sistema/*` e `/agenda/*`, mas o signatário mantém sua sessão
Auth confirmada para completar `/assinar-contrato-comercial/:token`
e ver o PDF pelo endpoint que exige `verified_user_id`.

Checklist indispensável de homologação: signatário externo confirma OTP,
consegue visualizar/assinar PDF e receber status de conclusão; uma tentativa
de abrir o painel pela mesma sessão é negada. Administrador pode revogar
permissões sem derrubar sessões válidas de signatários.

## 24/10/2026 — Financeiro/Comercial: proteção de cobrança e recuperações

- A geração do financeiro da venda agora é restrita a venda aprovada,
  ativa ou concluída, sem cortesia, parcelas zeradas ou data inválida;
  a data de emissão/vencimento usa o calendário de São Paulo.
- Reexecução após falha parcial reconhece parcelas da mesma venda,
  cliente, número, valor e vencimento sem duplicar. Título cancelado não
  é substituído, e histórico impede alteração da identidade financeira
  original, mesmo se todas as parcelas foram canceladas.
- Cancelar Pix exige vínculo verificado entre cobrança/título/cliente e
  justificativa. Timeout do Asaas só é reconciliado após consulta da
  situação remota; pagamento confirmado nunca vira cancelamento.
- A Server Action de confirmação demonstrativa está bloqueada fora
  do preview; recuperação de cobrança já paga pelo Asaas grava referência
  e espera webhook autenticado, sem usar baixa por sessão do operador.
- CI cobre guarda de venda, datas, duplicação e retorno de chamada Pix
  sob falha de rede. Nenhuma cobrança Asaas ou WhatsApp real disparada.
- **Pendente operacional:** Asaas sandbox com webhook, Meta WhatsApp
  de teste, permissões granularmente exercitadas com perfis de operador,
  conciliação de saldo/crédito, locações e anúncios; cuidados de
  concorrência e idempotência de efeitos externos constam em
  `docs/FINANCEIRO-COMERCIAL-HOMOLOGACAO-20261024.md`.
- PR #15 aberta; sem merge, deploy, aplicação de migrations no remoto.

### Editorial PC — seleção de capa por estrela na miniatura

- A ação `onSetCover` já existia, mas a estrela estava na fileira de ações lateral e não sobre a foto; a ação foi movida para dentro de cada miniatura vinculada à matéria.
- Estrela tem `aria-pressed`, preenchimento amarelo na capa selecionada, texto acessível e mantém `setCoverMedia` como a única rotina de mudança. Capa anterior vira galeria, sem duplicatas; ordem preservada, e salvamento da matéria utiliza o payload editorial atual. Testes existentes `article-cover-choice.test.ts` continuam cobrindo unicidade, capa anterior, legenda e crédito.
- Não muda o fluxo de crop mobile, upload, tipos de mídias ou backend. Novo crop com seleção direta no PC continua pendente para outro commit isolado; não considerar issue #16 concluída apenas com a estrela.

### Editor de recorte direto — somente PC (24/10)

- Adicionado `DesktopArticleImageCrop`, acionado exclusivamente por `matchMedia('(min-width: 768px) and (pointer: fine)')` ao editar imagem já enviada. A seleção aparece diretamente sobre a foto: arrastar área nova, mover quadro, redimensionar pelos quatro cantos, proporções livre/1:1/4:3/16:9/3:4/9:16, prévia sem distorção e confirmação/cancelamento explícitos.
- A geometria utiliza coordenadas normalizadas referentes à **foto original** e produz uma derivada JPEG sem sobrescrever original ou outras galerias. Arquivo somente substitui o vínculo após o upload existente confirmar a derivada. Testes de geometria no CI verificam aspect ratio, limites e extração correta de pixels.
- O componente `PreUploadImageCrop` permanece inalterado para celular/tablet/toque e em contextos que não são PC. O novo editor não instala pacote npm nem altera migrações ou Storage.
- Teste de UI em navegador real (mouse, resize, upload, salvar, reabrir, recortes verticais e horizontais) ainda exige homologação manual antes do deploy.


## Plano de conclusão 5–10 por menor esforço (sem criar escopo novo)

Ordem operacional de **fechamento**, não da lista numérica:
1. **Módulo 6 Aniversariantes** — bloco A: datas sem ano, duplicatas, atualização imediata, filtros e relatório; bloco B: layout aprovado, Novo+, mensagens/modelos e teste de uso. Só marcar fechado depois de B e de QA visual.
2. **Módulo 8 Publicidade/Assine** — bloco A: chave Assine/Anuncie, slots e regras de apresentação; bloco B: veiculação/vigência/contratos/suspensão e QA.
3. **Módulo 5 Jornal Online/PDF** — bloco A: upload/duplicidade/importação; bloco B: leitor desktop/mobile e Range/CORS.
4. **Módulo 7 Agenda/Pauta** — bloco A: tarefas/reuniões/convites; bloco B: alertas, notificações, Telegram/push.
5. **Módulo 10 Clientes integrados** — contrato de dados, regras de cliente digital, sincronização segura e testes cruzados com Altnix Informativo. Sem tocar players ou OTA.
6. **Módulo 9 NFS-e Nacional** — mais complexo por município, certificado e homologação fiscal externa: deixar por último, sem emissão real sem aprovação.

Evitar declarar um módulo encerrado só porque a infraestrutura de CI está verde. As alterações abaixo são **correções de requisitos já combinados**, sem recursos extras.

### Módulo 6 — bloco A: integridade editorial (24/10/2026)

- O banco já aceitava `birth_year NULL`, mas formulário exigia ano; inclusão/edição agora usa DD/MM e ano opcional. `2000` é apenas projeção bissexta para cálculo da semana, e `birthYearKnown=false` grava NULL de verdade. Um nascimento real em 2000 continua distinguível. Uma data 29/02 com ano real não bissexto é rejeitada.
- Edição dos registros existentes não deve preencher o ano NULL com 2000 acidentalmente. O nome/dia/mês da instituição no cadastro mestre continuam separados e somente leitura no módulo editorial.
- Banco bloqueia inclusões ou reativações concorrentes de pessoa editorial com mesmo grupo, nome normalizado e dia/mês; não mexe em duplicatas legadas automaticamente. Identidades diferentes com mesma data são permitidas.
- Ao confirmar salvamento, estado React é atualizado sem exigir F5; `router.refresh()` reconcilia IDs e snapshots. Listagem expandida respeita filtros também nas pessoas filhas, evitando exibir aniversariantes de fora da semana selecionada.
- Testes de função, duplicidade em PostgreSQL temporário e build geral adicionados ao CI. **Ainda falta bloco B (layout/mensagens) e teste visual antes de marcar o módulo 6 concluído.**

### Módulo 6 — bloco B: layout aprovado e cadastros sem perda de dados

- Importado e aplicado o CSS modular `BirthdaysList.module.css` ao container real. A malha compacta e responsiva já prevista passa a funcionar sem recriar o layout antigo. A árvore não tem scroll interno; apenas o formulário modal de edição mantém sua própria rolagem, preservando botões de salvar.
- Botão único `Novo +` integrado na linha da Semana do Jornal; formulário já inclui criação independente/extraordinária e vínculo a PF/PJ. Removida a antiga faixa redundante `+ Novo aniversariante`.
- Ação de retirar em cada linha aparece ao passar mouse/foco no PC e permanece fixa/tocável em celular. Arquivamento não exclui `clients`, respeita soft-delete.
- Gerenciamento dos modelos de homenagem exibido apenas a admin/owner; operador ainda pode usar modelos permitidos, mas não editar bibliotecas administrativas. A proteção server-side por permissão permanece.
- Inclusão extraordinária e familiar passa a aguardar **confirmação do servidor** antes de fechar formulário; em duplicidade/erro, nome/data e demais informações continuam preenchidos para correção. Botões de salvar/cancelar ficam bloqueados durante o envio, evitando duplo clique.
- Mensagens existentes e seus modelos (incluindo modelos personalizados) foram **preservados**, sem alterar textos aprovados. Relatório segue DATA | NOME | CIDADE; fotos de destaque e filtros da Semana do Jornal permanecem.
- Código deve passar CI do sistema e schema descartável. Homologação manual do layout real (PC/mobile, impressão e histórico com dados legados) continua como verificação final do módulo antes do release.

### Módulo 8 — bloco A, verificação de configurações e patrocinadores (24/10)

- A página pública Assine/Anuncie já possui `getSiteAssineEnabled` com leitura fail-closed, bloqueio de submissões no banco e trigger de acesso somente admin/owner para modificar `assine_enabled`; **não foi recriada nem duplicada** essa infraestrutura.
- As seis posições de anúncios já existem com configuração por grupo e imagem, rotação, efeitos, formatos, upload otimizado e lista de imagens. A revisão encontrou um problema localizado: `MediaSettingsRow` exibia `Salvo ✓` **antes do resultado da Server Action**.
- A configuração por imagem agora aguarda resposta confirmada: o protocolo original da action é `void` em sucesso e `{error}` em falha. O indicador de sucesso só aparece após a conclusão, a ação desabilita o botão durante o envio e informa falha sem mentir sobre gravação. Não alterou o tipo de arquivo, temporizador, rotação ou quantidade de posições.
- Ainda falta no bloco A homologar PC/mobile as seis posições e ativação/desativação do Assine contra a configuração aplicada no site. Bloco B posterior: vigência, vinculação comercial, inadimplência/suspensão e contratos. Não criar cobrança automática nem alterar dados remotos.

### Módulo 8 — bloco B: vigência e suspensão manual (Jornal IR apenas)

- Nova edição por imagem dos campos **já existentes** `site_ad_media.active`, `active_from`, `active_until`, inclusive limpar as datas por NULL, sem criar outra tabela/playlist. Validação real de datas, sem impedir períodos passados nem alterar mídia de outros grupos.
- O estado editorial exibido diferencia `ativa`, `agendada`, `encerrada` e `pausada manualmente`. A view pública passa a considerar **dia de São Paulo**, inclusive na virada do dia, preservando o coalesce por imagem para duração/efeito/formato e as seis posições.
- Alteração exige ação `publicidade/vendas_editar` no servidor; trigger no Postgres impede que usuário sem essa permissão modifique ativo/vigência por API REST direta. Não altera clientes nem baixa Pix.
- **Futuro Altnix Informativo: somente após Jornal IR estabilizado.** O benefício do site e a venda comercial são domínios separados. Suspensão por inadimplência *não pode* se basear em dívida genérica do cliente. Exigir contrato/serviço/venda/título + mídia/playlist/tela com vínculo inequívoco, tolerância de atraso explicitamente aprovada, intervenção/override humano, logs, reversão após pagamento confirmado, idempotência e sincronização segura com equipamento OFFLINE. Nada a enviar aos players nesta fase.
- Módulo 8 ainda requer testes manuais do portal, financeiro comercial e contratos antes da publicação; não declarar integração com Altnix concluída.

### Patrocinadores — fechamento das permissões (24/10)

- As seis Server Actions de configurar grupo, ativar grupo, enviar, editar imagem, retirar e reordenar agora exigem `publicidade/vendas_editar` (mesma permissão que a pausa manual nova).
- A página administrativa valida essa permissão antes de renderizar. Migration restringe INSERT/UPDATE/DELETE de `site_ad_media` e UPDATE de `site_ad_slots` pela RLS; consultas públicas das views ficam intactas.
- Isso impede um operador apenas autenticado de contornar o menu do sistema e modificar anúncios pela API direta. Testar especificamente owner/admin, operador habilitado, operador sem publicidade e cliente anon antes do release.

### Correção de escopo — patrocinadores são somente bônus gratuitos (24/10/2026)

A confirmação do Jornal IR prevalece sobre o plano anterior: **os seis espaços de patrocinadores no portal não pertencem ao financeiro, não exigem cadastro do cliente e são incluídos/removidos manualmente.** A tela não apresenta agendamento nem expiração por data. Apenas o indicador manual `active` de cada imagem e de seu grupo governa a vitrine. A migration `20261120220000_site_ads_manual_only.sql` preserva o conjunto atualmente visível ao migrar: prazos já vencidos/futuros passam a pausa; campos antigos de data são limpos, e a view pública publica apenas o que for explicitamente marcado ativo. Não cria cobrança, contrato, notificação nem vínculo no Altnix Informativo. Gestão de cobranças do Altnix continua **exclusivamente futura**, na issue #18 para mídias pagas vinculadas ao respectivo serviço.

### Módulo 5 — bloco A, integridade no upload e acesso a edições

- Fluxo já existente: navegador→PUT assinado R2 (PDF/capa)→validação HEAD→metadados da mesma edição; sem novo storage.
- Corrigida possibilidade de `abandonEditionR2UploadAction` apagar o PDF oficial existente por receber qualquer chave com o mesmo prefixo. Limpeza aceita somente par PDF+WebP de um **mesmo UUID gerado pelo upload** e nunca apaga arquivo atualmente vinculado. Erro ambíguo após finalização deixa o arquivo intacto até conferir o vínculo no banco, evitando perda irreversível.
- Criar/editar/inativar edição e preparar/finalizar/cancelar upload agora exigem a mesma permissão `editorial/edicoes_gerenciar`, inclusive diretamente na RLS do acervo, não só no menu. A leitura pública não muda.
- Teste `edition-direct-upload-keys.test.ts` verifica isolamento por UUID e edição, recusa chaves legadas/arbitrárias e prevenção de exclusão por caminho genérico.
- Ainda faltam homologação de envio de PDF e capa no R2 de testes, importação/duplicidade, reader mobile/flipbook e Range/CORS.

### Módulo 5 — importação PDF, segurança e concorrência

- As ações de extrair/reprocessar lotes verificam permissão `editorial/edicoes_gerenciar`; divisão, mescla, descarte, restauração e edição de candidato verificam `editorial/materias_editar`; converter candidato em **rascunho** exige `editorial/materias_criar`. Nada é publicado automaticamente.
- Revisadas RPCs `SECURITY DEFINER` para repetir a mesma checagem de permissão no banco, não só na Server Action. RLS para POST de lotes/candidatos e PATCH de candidato exige permissão granular. Sem alterar algoritmo de extração nem conteúdo dos rascunhos.
- `create_pdf_import_batch` ganhou forma com argumento explícito `p_force`; chamada antiga de 7 argumentos permanece compatível e delega para `force=false`. O banco trava por edição+SHA-256 durante inserção e bloqueia corrida entre importações do MESMO arquivo, mas permite **reprocessar mesmo assim** mediante confirmação intencional na interface. Preservada gravação atômica de lote + candidatos.
- Ainda exigem homologação R2 real, revisão de importação textual e leitor final PC/mobile. 

### Proteção contra reenvio do PDF oficial (edição já possui capa)

- O navegador calcula SHA-256 antes de pedir PUT assinado do R2. O servidor compara o hash com o PDF oficial da mesma edição e evita criar mais objetos quando a capa já está arquivada. Edição com capa ausente pode ser reenviada para reparo. Teste de SHA e ausência de capa foi incluído no CI.
- A finalização faz conferência adicional do hash; se o vínculo falhar, tenta limpar apenas as duas chaves de upload geradas para aquela tentativa, nunca o PDF vinculado. Não houve leitura nem apagamento no R2 real.

### Módulo 5 — bloco B, acervo e leitores (revisão de regressões)

- Listagem do Jornal Online deixou de descartar acervo Drive/local assim que R2 devolve uma edição. Agora consulta R2 e Drive em paralelo, acrescenta PDFs locais e prefere a edição oficial se houver número coincidente. Números apenas inferidos por padrões explícitos de “Edição 700” ou “IR 700”; título genérico não causa deduplicação indevida. Teste com acervo misto no CI.
- Página da edição também utiliza a mesma mesclagem; se ambas as APIs falharem não confunde indisponibilidade com edição inexistente. PDFs legados permanecem acessíveis por seus links antigos.
- O leitor mobile deixa de manter todos os canvas em memória: páginas fora do viewport expandido voltam a placeholders e liberam a imagem; ao aproximar, renderizam outra vez. Isso protege Android com pouca RAM em jornal de dezenas de páginas.
- O carregamento PDF.js dos leitores mobile e desktop agora cancela a tarefa de rede ao trocar de edição ou desmontar o componente; não deixa download pendente consumindo recursos.
- **Pendente para homologação completa:** navegação/zoom/tela cheia real no PC/Android, configuração CORS/Range no R2 de edições e PDFs do acervo de produção. Não declarar testes manuais concluídos por CI.

### Módulo 7 — bloco A: convite e confirmação de reunião (24/10/2026)

- Mantidas as tabelas/funções existentes de tarefas e `agenda_event_assignees`; criado `agenda_event_invitees` separado com resposta individual `pending/accepted/declined`, data, autor e trilha. Concluir responsabilidade **não** equivale a confirmar presença.
- Gestão de participantes de compromisso geral existente na tela Agenda, com caixa de seleção da equipe ativa; salvar por RPC transacional sem remover respostas de quem permanece convidado. O organizador consulta status por nome e cada convidado responde com o próprio login.
- RLS de leitura apenas colaborador convidado ou gestor; INSERT/UPDATE/DELETE diretos vedados e RPCs `set_agenda_event_invitees` e `respond_agenda_event_invitation` verificam gestor/identidade no banco. Compromissos cancelados/concluídos não aceitam novos convites nem novas respostas.
- **Não emite mensagens**. A notificação interna, Telegram, push e lembretes individualizados continuam no bloco B; aqui a tela informa explicitamente que o convite ainda não é um e-mail enviado. Não altera sessão de Câmara, pauta semanal nem status de tarefas.
