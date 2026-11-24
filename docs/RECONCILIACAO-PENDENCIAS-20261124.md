# Jornal IR — Conciliação de pendências e estado REAL (24/11/2026)

Este relatório compara **repositório oficial** `altnixtecnologia/jornalir`,
branch `solicitacoes-financeiro-contratos-irc-20261031`, schema Supabase
`iqnzrpdccecgalqboeyf` e Vercel `jornalir-sistema`.
Prioridade do proprietário: **não refazer** funcionalidades já implementadas,
nem tratar código preparado como publicado/homologado.

## 1. Implementado e conferido no GitHub (não reprogramar)

| Entrega | Evidência | Fase |
| --- | --- | --- |
| Contractos institucionais redigidos externamente + arquivo de cartório | PR #127 | Código incorporado; teste real e publicação pendentes |
| Painel básico de audiência (Matérias > Audiência) | PR #128 | Código incorporado; propriedade GA4/credenciais/consentimento pendentes |
| Cadastro interno de familiares e link absoluto de complementação | PR #129 | Código incorporado; fluxo público separado abaixo |
| Encerramento de Agenda/Pauta e convites | PR #130 | Código incorporado; teste visual autenticado pendente |
| Proteções server-side Usuários e Asaas e confirmação de ações críticas | PR #131 | Código incorporado; revisão de funções com contas reais pendente |
| RPC de familiares do formulário público + consistência no autosave | PR #132 | Código incorporado; migration `20261124130000` não aplicada |
| Auditoria de permissões financeiras e visibilidade | PR #133 | Código incorporado; migration `20261124131000` não aplicada |
| Limpar notificações apenas no dispositivo do leitor | PR #134 | Código incorporado; migration `20261124132000` não aplicada |

**Revisões prévias:** máscaras de datas e cidades IBGE, aniversariantes/InDesign,
cadastros PF/PJ, Asaas e NFS-e administrativa já receberam entregas anteriores.
Checar no código e nas PRs antes de tocar de novo.

## 2. Confirmado ao vivo em 24/11 (somente leitura)

- **Vercel produção:** último deploy READY do sistema no commit
  `e1bdfa66eaacb7389be01ce6c328f8d6b6508290` (PR #126).
  Tentativa posterior no commit `461ec0a` foi **CANCELED** pela configuração
  `Ignored Build Step = exit 0`. GitHub mais recente NÃO está publicado.
- **Supabase:** migrations legadas `20261104100000`,
  `20261104101000`, `20261120300000`, `20261120310000` e
  `20261020001444` **já estão no ledger**. Não reexecutar.
- **Novas migrations** `20261124130000`, `20261124131000`,
  `20261124132000`: ainda **ausentes do ledger** na leitura de 24/11.
- A versão atual de `public_complete_add_family_member` ainda grava
  `family_members_confirmed_empty = true` após a inclusão. A correção
  é incremental; não editar migração antiga.
- Ainda não há chaves GA4 `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL` e
  `GA4_PRIVATE_KEY` configuradas no projeto `jornalir-sistema`
  no inventário Vercel; tampouco foi identificada configuração GA4 no portal.
- A central de notificações do portal é identificada por token **anônimo
  de dispositivo**, não por login de usuário; `Limpar` deverá manter
  esse escopo, sem apagar eventos globais nem avisos de outros leitores.

## 3. Validação de alterações novas sem risco

- CI em PostgreSQL 16 **descartável**, fixture
  `tests/security/pending-migrations-20261124-sandbox.sql`, valida
  as três migrações sem tocar em banco real: token/consentimento e
  familiares, trilha de auditoria com antes/depois, e coluna de limpeza
  mantendo registros históricos.
- Revisar resultado do CI antes de aplicar no Supabase. Em ambiente real,
  validar backup, RLS/grants, versão existente e ordem das migrações:
  família → auditoria → notificação.
- Não usar CPF/CNPJ real, clientes reais, envios, contratos vinculantes,
  cobrança Pix ou emissão fiscal para testar.

## 4. Pendências dependentes de ambiente, autorização ou homologação

- [ ] **Configurar publicação consolidada** em `jornalir-sistema`, sem
  desligar para sempre o mecanismo de `Ignored Build Step`. Validar SHA,
  SQL pendente, domínio `controle.altnix.com.br`, acesso e rollback.
  Portal/site tem projeto próprio e deve ser testado/publicado de forma
  independente quando necessário.
- [ ] **Migrações SQL novas:** após sandbox verde, backup, aplicação
  controlada e verificação do ledger, triggers e colunas; nenhuma linha
  de negócio deve ser alterada pela migration.
- [ ] **GA4:** criar/identificar propriedade oficial, configurar Data API,
  service account de leitura e variáveis em cofre Vercel, fuso horário,
  coleta somente com política LGPD/consentimento apropriados.
  Sem GA4 histórico pré-existente, não é possível recuperar visitas passadas.
- [ ] **NFS-e:** certificado do emissor, serviços SEFIN, XML/DANFSe e homologação;
  manter flag de emissão bloqueada até concluir. Chave de criptografia no
  ambiente não equivale a certificado A1 cadastrado/autorizado.
- [ ] **Assinaturas:** cadastro da empresa, representantes legais, revisão
  jurídica de modelos, assinatura real de teste não vinculante e entregas;
  contratos cartoriais devem ficar somente como arquivo físico digitalizado.
- [ ] **Asaas:** testes de reentregas e conciliação apenas no Sandbox autorizado.
- [ ] **Meta/Instagram/Facebook:** o roadmap de central de compartilhamento
  prevê conexão OAuth institucional, revisão de APIs, webhooks assinados e
  automação por comentário; **não automatizar envios/posts sem acesso
  oficial, permissões e homologação**. O compartilhamento assistido atual
  do portal não equivale a automação Meta.
- [ ] **Portal/Android/PWA:** homologação real de leitor PDF privado,
  PWA/instalação, som e push com permissões da plataforma, notificações
  (incluindo limpeza por dispositivo) e comportamento responsivo.
- [ ] **Pauta/Agenda e perfis:** testar proprietário, co-gestor, administradores,
  operador e TV, sem reescrever eventos antigos por conta de divergência
  de status visual.
- [ ] **Cadastros/aniversariantes:** fluxo externo de complementação e
  relatório InDesign, CNPJ alfanumérico, familiares, consentimentos, cidades
  e testes no PC e celular.
- [ ] **Altnix Informativo:** integração com projeto/repositório oficial
  e financeiro/cadastro mestres, **sem migrar dados ou alterar players
  ativos inadvertidamente**.
- [ ] **Demais itens do checklist original:** revisão visual, responsividade,
  itens legados e integrações de terceiros; confirmar com testes de sessão
  própria antes de marcar concluído.

## 5. Regra permanente

Não reabrir PR já incorporada para implementar novamente a mesma feature.
Separar rigorosamente **código pronto**, **migração aplicada**,
**versão publicada**, **funcionando com dados reais** e
**homologado por usuário autorizado**. Registro matriz:
`docs/PENDENCIAS-HOMOLOGACAO-JORNALIR-20261110.md`.
