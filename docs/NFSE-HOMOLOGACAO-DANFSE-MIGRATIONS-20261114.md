# NFS-e — pré-homologação fiscal e DANFSe (14/11/2026)

**Status: NO-GO para emissão fiscal de produção e para DANFSe definitivo.**
Este documento registra a revisão do código da PR #61, dependente da PR #60,
e o confronto com o **documento oficial** da Secretaria-Executiva do Comitê Gestor da NFS-e.

**Fonte oficial:** [Nota Técnica SE/CGNFS-e nº 008/2026, versão 1.02, 14/07/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf), especialmente §§ 2.1, 2.2, 2.3, 2.4 e Anexo I (página 25 do documento). [Atualização do portal da NFS-e em 14/07/2026](https://www.gov.br/nfse/pt-br/noticias/danfse-novos-ajustes-de-leiaute-e-prorrogacao-do-prazo-para-adequacao). **DANFSe é NFS-e, não DANFE de NF-e de produtos**; não confundir as respectivas notas técnicas nº 008.

## 1. Confronto do DANFSe atual com o modelo nacional

Arquivos revisados:
- `apps/sistema/src/lib/nfse/danfsePdf.ts`;
- `packages/core/src/nfse/danfse-data.ts`;
- `apps/sistema/src/app/sistema/nfse/notas/[id]/danfse/route.ts`;
- `apps/sistema/src/lib/nfse/archiveNfseDocuments.ts`.

### O que está encaminhado
- A4 em retrato, única página;
- título DANFSe v2.0, chave e QR Code com URL de consulta pública;
- aviso vermelho para homologação e marca d'água de cancelamento;
- extração de dados persistidos/XML, sem usar valores escolhidos pelo navegador;
- PDF e XML privados no R2, com SHA-256 e histórico.

### Diferenças **bloqueantes** antes de aprovar um PDF fiscal definitivo
| Referência NT 008/2026 v1.02 | Situação no gerador atual | Ação |
| --- | --- | --- |
| § 2.1.3 — prestador/fornecedor | Falta bloco da situação no Simples Nacional na competência e regime de apuração pelo SN | Extrair do XML oficial e imprimir descrição correta |
| § 2.1.4 — tomador | Tel. e e-mail não são apresentados no bloco atual | Completar a partir do XML, sem inventar campos |
| § 2.1.7 — serviço prestado | Não apresenta código NBS, descrição do código tributário e localização completa | Adicionar apenas valores oficiais e tratar ausência conforme regras |
| § 2.1.8 — ISSQN | Só mostra base, alíquota e valor; faltam tipo, incidência, retenção e condicionais | Aplicar campos e regras de supressão da NT |
| § 2.1.9 — tributação federal | Bloco ausente | Extrair IRRF, contribuição previdenciária e retenções; condições para PIS/COFINS |
| § 2.1.10 — IBS/CBS | Bloco ausente | Mapear CST/cClassTrib, incidência, bases, alíquotas e totais efetivamente presentes |
| § 2.1.11 — valores totais | Sem discriminação de descontos, IBS/CBS e valor final com IBS/CBS | Completar sem atribuir total aproximado/fictício |
| § 2.1.12 — informações complementares | Bloco ausente | Mostrar dados presentes no XML, inclusive observações e totais aproximados quando aplicáveis |
| §§ 2.4.3 e Anexo I — cabeçalho | Logomarca oficial da NFS-e não é desenhada; texto QR está em quatro linhas, em vez de três | Usar arte oficial e estrutura do Anexo I |
| § 2.4 — fontes/labels | O código usa Helvetica e coloca todos os labels em caixa alta; NT pede Arial para labels, Microsoft Sans Serif para conteúdos e capitalização específica | Readequar fontes e títulos; avaliar licenciamento de fontes antes de incorporá-las ao repositório |
| § 2.2.2 — margens | `MARGIN=20pt` equivale a aproximadamente 0,706 cm; a NT descreve tolerância lateral de 0,15–0,20 cm | Conferir origem das medidas no formulário e readequar pelas coordenadas do Anexo I |
| § 2.4.5 e Anexo I — geometria | Posições são aproximação do gerador; truncamento por 90 caracteres não verifica largura em pontos | Construir geometria e teste de não sobreposição/recorte, especialmente descrição longa |
| § 2.4.5 — Emitente/Finalidade | “Emitente da NFS-e” usa nome do prestador; “Finalidade” é texto fixo | Derivar `tpEmit` e `finNFSe` do XML/enum oficial; não presumir finalidade |

Alguns blocos são sujeitos a **supressões previstas na NT**; a solução não é imprimir campos vazios aleatórios. Implementar a decisão de exibição por dados oficiais, mantendo as regras de ausência. Validar também o cenário de NFS-e cancelada e os efeitos no DANFSe.

**Proteção adicionada na branch de revisão:** `DANFSE_OFFICIAL_LAYOUT_APPROVED=false`, constante de código **não configurável por env**, com assert na geração e na rota de leitura (inclusive arquivo já arquivado). Em homologação visual, PDF marcado como **SEM VALIDADE JURÍDICA** ainda poderá ser gerado. A liberação do documento definitivo exige nova revisão, testes e autorização do proprietário.

## 2. Migrations e estado do Supabase oficial (consulta somente leitura)

Projeto oficial: `iqnzrpdccecgalqboeyf`. Checagem em 14/11/2026:
- **Aplicada:** A `20261114000402_nfse_delivery_history_tables.sql` (tabelas `nfse_document_assets`, `nfse_delivery_attempts`).
- **Pendentes da PR #60:** `20261122340400` troca atômica do certificado A1; `20261122340500` trava de edição fiscal em rascunho; `20261122340600` unicidade de cancelamento incerto.
- **Pendentes da PR #61:** B `20261122340700` enfileiramento automático após a nota ser inserida; C `20261122340800` permissões de consultar/enviar documentos; D `20261122340900` claim e backoff de arquivamento R2.
- A função antiga `set_nfse_certificate_actor` existe; as novas RPCs `replace_nfse_certificate_atomic`, `guard_nfse_draft_fiscal_edit`, `claim_pending_nfse_archive`, `defer_nfse_archive_failure` não estão aplicadas. Os respectivos triggers novos também não estão ativos.
- `NFSE_AVAILABLE_IN_THIS_RELEASE=false`. Flags de entrega e arquivamento continuam desativadas; não há autorização de emissão por esta revisão.

**Sequência técnica a ensaiar no banco descartável e na futura sandbox**, preservando os arquivos em ordem: dependências já existentes → `40400` → `40500` → `40600` → `40700` → `40800` → `40900`. A migration A já deve constar do ledger e **não deve ser reaplicada no oficial**. Em sandbox criada do zero, reconstruir o histórico completo numa ordem válida. Preparar backup, pré-checagem de colunas, índices/constraints, RLS, grants e reversão por etapa. Não executar migrations no Supabase oficial sem aceite específico.

**Atenção:** a migration B instala trigger em `nfse_issued_notes` para notas de produção; não faz sentido usá-la como artifício para enviar e-mail real em uma sandbox fiscal. O gate de arquivamento `isNfseArchiveEnabled` exige `VERCEL_ENV=production`, e portanto o cron real de e-mail/R2 não roda numa Preview. Planejar teste isolado com mocks ou um adaptador de homologação segregado, sem afrouxar a trava de produção, sem reutilizar e-mails ou credenciais reais.

## 3. Próximos critérios de aceite (sem autorizar transmissão)

1. **Sandbox isolada:** aprovação expressa de novo Supabase de homologação, custo e Preview Vercel, banco/usuários/chaves próprios; auditar flags e variáveis que possam apontar para produção. Não copiar cadastros reais.
2. **Sem A1:** revisar schemas, DPS/XSD, interface, validação de rascunhos e dados de teste; corrigir o DANFSe segundo o Anexo I e emitir PDFs **apenas fictícios e marcados**, renderizados para inspeção.
3. **A1, quando disponível:** inserir somente em formulário protegido da sandbox, nunca em chat/GitHub/log; senha e chave mestra separadas do oficial. Validar CNPJ, validade e mTLS. Confirmar parâmetros tributários com a contabilidade.
4. **SEFIN Produção Restrita:** somente com autorização específica e integração segura da Preview, conferir resposta, chave, XML, consulta, timeout sem retransmissão automática e eventuais divergências manual × XSD.
5. **DANFSe:** testar contra XML de homologação oficial, cada bloco condicionado aos dados existentes, tamanho A4, margens/fontes, 50 dígitos da chave, QR legível, não sobreposição, cancelamento, termos e impressão física. Aprovação visual e técnica documentada.
6. **R2/Resend:** testar isoladamente com arquivos sintéticos; arquivamento independente do e-mail; entrega e webhook sem usar dados reais antes do aceite. Manter retenção/backup de XML e DPS e revisar política aplicável.
7. **GO/NO-GO:** jamais mover `NFSE_AVAILABLE_IN_THIS_RELEASE` nem `DANFSE_OFFICIAL_LAYOUT_APPROVED` para true por simples variável de ambiente. Publicação fiscal requer autorização distinta da homologação.

**Não executado nesta etapa:** provisionamento de sandbox pago, deployment, migration de produção, envio fiscal, e-mail real, upload R2 real, merge na oficial ou uso de A1. O webhook da PR #62 já está em produção e foi validado anteriormente; não repetir testes desnecessários.
