# REGISTRO DE PENDÊNCIAS E HOMOLOGAÇÕES — Jornal IR

Atualizado: 10/11/2026. Checklists devem receber data, resultado e evidência
(captura/log/commit) após cada teste. **Implementado não é homologado**.

## Prioridade atual: Pauta e Agenda

- [ ] Conferir edição de matéria simples: título, prazo opcional, hora, colaboradores, observações
- [ ] Conferir edição de pauta legada/vinculada (ex.: Câmaras), sem perder sessão na Agenda
- [ ] Conferir exclusão lógica de matéria simples; não apagar artigos publicados
- [ ] Conferir exclusão de pauta vinculada à Agenda; compromisso original permanece intacto
- [ ] Conferir permissões: proprietário, administrador habilitado, operador sem autorização
- [ ] Conferir ícones discretos, alinhamento e layout responsivo desktop/mobile
- [ ] Organizar cartões da Pauta pela alça discreta entre a borda colorida e o título, sem arrastar o restante
- [ ] Conferir ordem salva para outros usuários, após F5 e na Pauta TV (sem mudar layout TV)
- [ ] Conferir 3 colunas no desktop, 2 na tela intermediária e 1 no celular
- [ ] Abrir o detalhe da Pauta como painel flutuante ancorado ao cartão, sem alterar as linhas das 3 colunas
- [ ] Apenas uma pauta aberta: abrir outra fecha a anterior; clicar na mesma fecha
- [ ] Ícone editar abre a pauta correta e fecha a anterior; sem perder funcionalidades internas
- [ ] Conferir alinhamento dos painéis em cada coluna e rolagem para conteúdos longos
- [ ] Testar teclado Enter para expandir e setas para reordenar pela alça
- [ ] Conferir título da pauta em peso normal e com quebra de linha integral, sem cortes
- [ ] Não arrastar quando clicar nos botões, links ou preencher formulário
- [ ] Bloquear arrastar quando houver filtro de colaborador; impedir reordenação concorrente
- [ ] Verificar que arrastar não gera lembretes/notificações nem altera prazos ou datas
- [ ] Conferir títulos dos cartões da Pauta em peso normal, sem negrito
- [ ] Conferir seleção de responsáveis em iniciais quadradas, com legenda elegante do nome completo ao passar mouse ou focar teclado
- [ ] Conferir todos os responsáveis visíveis em linhas, sem rolagem horizontal, em pautas antigas e matérias novas
- [ ] Conferir seleção/deseleção, marcação visual, botão Selecionar todos e limite de 16 responsáveis
- [ ] Conferir tooltip no celular, sem cortar nome e sem interferir no salvamento
- [ ] Conferir lado a lado: prazo da matéria à esquerda e ativação da Agenda à direita (desktop)
- [ ] Conferir botão Ativar agendamento: revela data e hora apenas da Agenda
- [ ] Conferir × dentro do conjunto data/hora da Agenda: limpa ambos, cancela agendamento e mantém intacto o prazo da matéria
- [ ] Conferir empilhamento no celular e ausência de agendamento quando o × foi utilizado
- [ ] Transferir pauta pendente para a próxima semana, sem duplicar o ID
- [ ] Conferir transferência com e sem prazo e quando já existem compromissos na Agenda
- [ ] Impedir transferência de pauta concluída e evitar conflito de edição simultânea
- [ ] Conferir edição 777 na semana 05 a 11/11/2026, 778 na próxima, 776 na anterior
- [ ] Conferir exceção manual do número da edição, retorno ao automático e auditoria
- [ ] Conferir período especial sem mudar o padrão das outras semanas
- [ ] Criar pauta sem agendamento; nenhum compromisso novo aparece na Agenda
- [ ] Criar pauta COM agendamento: data/hora, 2 colaboradores e 2 compromissos individuais
- [ ] Agendar colaboradores restantes em pauta antiga; sem duplicar evento já vinculado
- [ ] Editar o compromisso de apenas um colaborador e verificar independência total
- [ ] Operador editar seu próprio compromisso; não poder editar o de outra pessoa
- [ ] Conferir lembrete/no horário, cancelamento, fusos, Android e app IR Controle (quando liberado)
- [ ] Conferir sincronização e comportamento da Pauta TV sem nomes duplicados
- [ ] Conferir navegador após publicação em produção e observar erros Vercel/Supabase

## Módulo 1 — Portal / Leitor (segurança antes do lançamento)
- [ ] Homologar abertura real de PDFs privados R2 no computador e celular
- [ ] Homologar leitor de notícias, editorias, busca, links e compartilhamento
- [ ] Homologar cadastro/assinatura do leitor, permissões e cobrança quando liberados
- [ ] **PENDENTE DO USUÁRIO:** auditoria completa de segurança e reforço antes do domínio público ir ao ar
- [ ] Revisar rate limits, Auth/RLS, uploads, headers, logs, segredos e acessibilidade
- [ ] **SOLICITADO 10/11:** botão discreto "Limpar" nas notificações do Portal; apagar apenas notificações do leitor autenticado, não eventos de outros usuários; verificar contadores e multi-dispositivos

## Módulo 2 — Cadastros (PR #40 publicado, testes reais pendentes)
- [ ] Criar/editar PF e PJ e revisar validações dos campos obrigatórios
- [ ] Testar CPF/CNPJ duplicados, CNPJ numérico e CNPJ alfanumérico em todas as integrações
- [ ] Testar filtros por tipo, papel, status, busca e ordenação em PC/celular
- [ ] Testar cadastro fiscal: inscrição estadual/municipal, ICMS, município IBGE, e-mail fiscal
- [ ] Testar CEP, alteração de endereço, validações em cidades sem código retornado
- [ ] Testar inativação sem destruir histórico de títulos, contratos e assinaturas
- [ ] Conferir familiares e pessoas relacionadas na ficha permanente (não preview)
- [ ] Conferir aniversários e consentimento: não criar publicação editorial automática
- [ ] Testar convite/complementação de cadastro com link seguro/expiração
- [ ] Testar permissão dono/admin/operador e acesso direto às RPCs
- [ ] Confirmar cadastro mestre compartilhado com Financeiro, Comercial e Assinaturas
- [ ] Conferir fuso, máscara, teclado celular e visual responsivo
- [ ] Verificar compatibilidade de CNPJ alfanumérico com Asaas e emissão fiscal antes de transações reais

## Módulo 3 — Financeiro
- [ ] Fluxo de propostas/parcelas idempotente; cobranças PIX/Asaas
- [ ] Recebimentos, baixas, cancelados/expirados, conciliação e auditoria
- [ ] Permissões granulares para criar, enviar, baixar e cancelar
- [ ] Integração única com cadastros, assinaturas e contratos
- [ ] Verificar não cobrar cortesia/proposta cancelada/valor inválido

## Módulo 4 — Assinaturas e contratos
- [ ] Modelos, rubricas, anexos, PDF, assinatura digital, OTP e registro de evidências
- [ ] Convites/expiração, WhatsApp/e-mail, acompanhamento e conclusão de contrato
- [ ] Vínculo de contratos assinados ao cliente e ao financeiro

## Módulo 5 — WhatsApp e comunicação
- [ ] Atendimento compartilhado web para 7+ usuários com autenticação via sistema
- [ ] Cloud API automática independente do atendimento web
- [ ] Templates, opt-out, logs e notificações administrativas

## Módulo 6 — Platform / Altnix Informativo
- [ ] Migração autorizada de clientes, mídias digitais, exibições e acesso ao financeiro
- [ ] Equipamentos, playlists, contagem, dispositivos, sincronização e permissões
- [ ] Não interromper player/painel/LED enquanto integrar

## Módulos transversais
- [ ] Editorial: fluxo PDF fechado → Jornal Online → rascunhos → notificação 07:00h
- [ ] NFS-e: validar SEFIN/DPS, reconciliação e cancelamento; flag continua OFF
- [ ] Android IR Controle: versão 0.00.02, alarmes nativos, vibração e atualização no app
- [ ] Publicidade/comercial: propostas, contratos, locações e faturamento
- [ ] Segurança geral: usuários, redefinição de senha, RBAC, auditoria e backups

## Resultados técnicos já executados (10/11/2026)
- [x] Suíte de Pauta: edição 777, períodos quinta–quarta, TV, navegação,
  lembretes, TypeScript e build — GitHub Actions 42878041661 (sucesso)
- [x] Regressões de Pauta e cobertura — execuções 42878041695
  e 42878041068 (sucesso)
- [x] Migration SQL exercitada em transação BEGIN/ROLLBACK: dois
  agendamentos, atualização individual, recusa de alteração de outra pessoa,
  transferência de semana, exclusão de pauta legada preservando a Agenda
  e ajuste manual da edição
- [x] Migration 20261122340200 aplicada no Supabase, com versão do histórico verificada
  e funções sem EXECUTE para anon
- [x] Sistema publicado: commit da6e27c, deploy dpl_Fu1ss2EZsNJsTSicio8cc3MNicSt,
  READY em controle.altnix.com.br; varredura de erros Vercel sem ocorrências
  no período consultado
- [ ] Homologação visual em sessões autenticadas — ainda não executada

## Método de trabalho
1. Conferir o que já existe; não reimplementar em paralelo.
2. Rodar testes automatizados e integração em transação com ROLLBACK.
3. Publicar uma versão consolidada por módulo; registrar commit e migration.
4. Homologar com usuário no ambiente oficial, sem gerar cobranças reais de teste.
5. Marcar item concluído somente com evidência; avançar um módulo por vez.

## Gestão — Maiquiu Cardoso (autorizado em 10/11/2026)
- [ ] Confirmar concessão operacional no banco sem criar segundo owner
- [ ] Confirmar que o Maiquiu aparece como “Coproprietário — Gestão” no sistema
- [ ] Confirmar acesso completo aos módulos operacionais e à Pauta/Agenda (salvar e excluir)
- [ ] Confirmar gestão de outros administradores/operadores e trilha de auditoria
- [ ] Confirmar que nem coproprietários nem administradores podem alterar o proprietário técnico
- [ ] Confirmar que código, bancos, GitHub, Vercel, certificados e segredos permanecem separados
- [ ] **Acesso real depende de confirmação do e-mail** no Supabase Auth — não confirmar artificialmente
- [ ] Conferir em sessão autenticada com o Maiquiu (teste visual, sem usar credenciais compartilhadas)
- [ ] Poder jurídico de assinar contratos em nome da empresa exige concessão explícita própria

---

## Revisão concentrada AO FINAL da lista de módulos — anotação de 23/11/2026

Pedido do proprietário: seguir a sequência dos módulos agora e reservar as revisões detalhadas
e homologações para o encerramento geral. Não confundir código incorporado com publicado
nem com homologação de uso real. Anotar evidências e conferir uma só vez ao final.

- [ ] Publicação Vercel do sistema: PR #127 (contratos externos/cartório) e PR #128
  (Audiência/GA4) incorporadas à branch operacional. A configuração Ignored Build
  Step = exit 0 cancelou o deploy de 21/11. Planejar publicação consolidada com teste
  de domínio/versão, sem remover silenciosamente a proteção global.
- [ ] Analytics: propriedade GA4 oficial, Data API, credenciais de leitura na Vercel,
  horário America/Sao_Paulo, resultados reais por matéria e região; definir e aplicar
  política de privacidade/consentimento antes de instalar rastreamento novo no portal.
- [ ] Assinatura eletrônica de contratos: cadastro jurídico da empresa, representantes,
  revisão das minutas, aprovação, OTP/QR/PDF e fluxo de convites; teste fictício sem
  obrigações contratuais. Contratos externos: validar upload privado sem assinar no IR.
- [ ] Asaas: homologação de eventos fora de ordem, duplicidade e concorrência em Sandbox
  isolado; não gerar cobranças reais para teste.
- [ ] NFS-e: certificado A1, SEFIN/DANFSe/XML e liberação após homologação; manter
  emissão bloqueada enquanto faltarem dependências.
- [ ] Cadastros/aniversariantes: homologar PF/PJ, CNPJ alfanumérico, permissões,
  cidades IBGE, datas, relatório InDesign, responsáveis, links de complementação
  e visual no PC/celular. Sem publicar aniversários por presunção de consentimento.
- [ ] Família na complementação pública: a função já aplicada
  public_complete_add_family_member (migração 20261120310000) ainda marca
  family_members_confirmed_empty = true quando adiciona um familiar, contrariando
  o sentido de 'confirmado que não há familiares'. Ajustada nesta etapa a ação
  administrativa; o fluxo público exigirá migration incremental própria e teste
  transacional antes de alterar o banco. NÃO editar migration histórica aplicada.
- [ ] Agenda e Pauta, permissões, portal/PWA, Meta/Instagram, central de audiência
  e integração futura Altnix Informativo/Platform: reunir pendências restantes
  e validar sem duplicar bases, programação, players ou cobranças.

## Item 5 — execução parcial em 23/11/2026

- Cadastro interno: ao incluir familiar, limpar a confirmação anterior de
  inexistência de familiares, preservando consentimentos e vínculo cadastral.
- Link de complementação: exibir endereço completo (não apenas caminho relativo);
  envio permanece manual, pelo canal existente (WhatsApp próprio ou e-mail).
- Conferidos: DD/MM de aniversariantes, cidades IBGE, relatório TSV/InDesign e
  campo Origem/Vínculo nas PRs #101–103; não refazer implementações.
- Homologação autenticada do conjunto e correção do fluxo público: pendentes
  para a revisão final, junto com o estado de produção e pendências de migrações.


## Item 6 — Agenda e Pauta: status e encerramentos (24/11/2026)

- Fonte verificada em leitura no Supabase oficial, sem editar compromissos:
  16 eventos ao todo; 7 concluídos e 9 agendados ocultos da Agenda
  (`show_in_agenda = false`); nenhum evento agendado visível no momento
  da consulta. As 16 pautas incluem 9 pendentes, todas vinculadas a
  eventos ainda agendados; não há pauta pendente associada a evento
  já encerrado nos dados presentes.
- Dois eventos de Câmara encerrados ainda possuem atribuições
  individuais sem baixa: encerramento final prevalece para o status
  visual do evento e do cartão, sem manipular as baixas pessoais.
- Confirmação importante: o contador `Hoje` **já** usa `filteredEvents`,
  que exclui registros `showInAgenda=false`. Não alterar esse filtro.
- Ajustado no código: normalizar o status efetivo ao carregar Agenda,
  respeitando `completed_at` e `workflow_closed_at` mesmo que o status
  persistido ainda seja `scheduled`. As ações que consultam `item.status`
  não devem oferecer conclusão novamente.
- Ajustado no código: cartão da Pauta vinculado a evento concluído deve
  mostrar `completed` também em cobertura por equipe; manter baixas
  individuais e cartão cancelado independentes do evento.
- Ajustado no código: não apresentar convites pendentes de reunião para
  evento com baixa/encerramento final.
- [ ] No **fechamento da lista**, homologar com contas autorizadas no PC
  e celular, conferir os dois eventos de Câmara com responsáveis e
  autorização, Pauta/Agenda/TV, contagens e cores. Não atualizar eventos
  históricos automaticamente para forçar estado visual.
- [ ] Conferir que a implementação já incorporada ao GitHub esteja
  também publicada no `jornalir-sistema` no deploy consolidado.



## Item 7 — Usuários, permissões e configurações sensíveis (24/11/2026)

- Inventário de leitura do banco: 1 perfil `owner`, 2 `admin` e 2 `operator` ativos.
  Nenhuma conta, regra de permissão ou dado financeiro foi alterado.
- A matriz `STAFF_MODULES` **já possui** o módulo `configuracoes` no editor
  por usuário, com patrocínios e valores de Assine concedidos por ação.
  Preservar essas exceções previamente autorizadas aos operadores;
  a gestão de usuários, dados jurídicos e integração Asaas são administrativas.
- A RPC existente `is_active_admin_or_owner()` valida `staff_memberships`,
  `profiles.active`, papel `owner/admin` e confirmação de e-mail:
  reaproveitar a função, sem criar contas ou sistemas paralelos.
- Melhorias deste lote: guarda server-side na página Usuários e na página de
  configurações de cobranças; guarda ANTES de obter chave ou chamar a API do
  Asaas nas três Server Actions (salvar, testar conexão, configurar webhook).
- No painel Usuários, marcar individualmente `recebimentos_estornar` ou
  `pix_cancelar` abre confirmação explícita, como já acontece na seleção
  em lote. Não grava ao confirmar diálogo: continua exigindo
  `Salvar permissões`. Desmarcar continua simples.
- Banco mantém RLS no registro de configurações e concessões. Guard da
  interface é defesa adicional, não substitui proteção de banco.
- [ ] **Na revisão final:** verificar em sessões reais proprietário,
  administrador, coproprietário de gestão e operador, incluindo acesso
  por URL direta, alterações proibidas e auditoria; não utilizar segredos,
  senhas ou conta de terceiros nos testes.
- [ ] Confirmar que a publicação consolidada na Vercel inclua este lote e
  todos os anteriores, após revisão da configuração de Ignored Build Step.
- [ ] Rever permissões de patrocinadores e preços para operadores e decidir
  se devem permanecer delegáveis, sem revogar silenciosamente concessões
  existentes.
- [ ] Homologar o teste de conexão Asaas **apenas em Sandbox com permissão
  administrativa explícita**, em etapa separada; nenhuma chamada externa
  para testar autorização neste lote.

