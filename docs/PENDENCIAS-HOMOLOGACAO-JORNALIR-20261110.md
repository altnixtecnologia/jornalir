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

## Método de trabalho
1. Conferir o que já existe; não reimplementar em paralelo.
2. Rodar testes automatizados e integração em transação com ROLLBACK.
3. Publicar uma versão consolidada por módulo; registrar commit e migration.
4. Homologar com usuário no ambiente oficial, sem gerar cobranças reais de teste.
5. Marcar item concluído somente com evidência; avançar um módulo por vez.
