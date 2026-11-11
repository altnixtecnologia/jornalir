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

## Ideias registradas em 11/11/2026 — não implementar agora

- **Atualização de matéria já publicada:** estudar uma notificação opcional de “Matéria atualizada” (portal/app), distinguindo correções pequenas de atualizações relevantes, com ação editorial explícita, controle de preferências, deduplicação, limite de frequência e registro de quem autorizou. Não reenviar automaticamente push a cada edição ou correção sem critério e testes.
- **Cartola nas matérias:** verificar se o editor, banco e exibição pública já possuem o campo cartola (antetítulo/chamada curta acima do título). Se ausente, propor implantação compatível com matérias existentes e importação; não confundir cartola com campo de **fonte/origem da matéria**, que deve ser verificável e rastreável para auditoria editorial. Preservar o conteúdo e a apresentação atuais.

**Status:** anotado para análise futura a pedido do proprietário; sem código, migração, publicação ou alteração de matérias nesta etapa.
