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
| 3 | Financeiro e comercial | Origens de vendas, propostas, recebíveis e guardas granulares | Jornada com parcelas, PIX homologado, créditos, baixa, Asaas/webhooks, locações sem duplicidade, cobranças e suspensão de veiculação |
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
