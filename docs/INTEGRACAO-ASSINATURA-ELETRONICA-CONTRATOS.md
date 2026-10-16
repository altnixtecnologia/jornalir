# Integração de contratos assináveis — Jornal IR / Assinador Altnix

**Data-base:** 16/10/2026. **Status:** levantamento e plano técnico registrados; nenhuma integração ativada.
**Referências do código:** `altnixtecnologia/jornalir` (branch de trabalho) e `altnixtecnologia/assinador-os` (main, 142d6a5).
**Regra:** nenhuma assinatura gerada automaticamente; somente documentos finais aprovados podem ser enviados para assinatura.

## 1. Objetivo e casos de uso

Gerar PDF contratual com dados já existentes no cadastro mestre Jornal IR e solicitar assinatura de pessoas identificadas, com evidências preservadas, status no Sistema e opção de envio por WhatsApp:

- **Assinatura anual do jornal impresso:** dados da pessoa, endereço de entrega, exemplares, período, vigência, valor, forma de pagamento e condições;
- **Publicidade no impresso:** anunciante/representante, formato e dimensões, edição/período de veiculação, material, prazo de entrega da arte, valor, aprovação e condições de cancelamento;
- **Painel LED:** praça/local do painel, quantidade e período de inserções, duração do vídeo, padrão de arquivo, regras de veiculação, valor, disponibilidade, cancelamento e responsabilidades;
- **Combinação de serviços:** itens discriminados, inclusive descontos, sem perder origem ou preços de cada item.

Os dados de pessoas/empresas permanecem em `public.clients`. As assinaturas em `subscriptions`; vendas em `commercial_sales` e propostas em `commercial_proposals`. Não duplicar cadastro mestre nem criar contratos pagos automaticamente ao receber o link.

## 2. Estado real do repositório assinador-os

É um aplicativo estático HTML/JS consumindo Supabase, com:

- `painel.html` + `js/admin.js`: upload manual de PDF, PDF.js, marcação de áreas de assinatura, registro de `documentos`, link `/assinar.html?id=<id>`;
- `assinar.html` + `js/assinar-v2.js`: OAuth Google, leitura/aceite visual do PDF, CPF/CNPJ digitado, assinatura manuscrita em canvas, envio para a Edge Function `salvar-assinatura`;
- `js/supabaseService.js`: gravação/leitura de `documentos`, `assinaturas`, Supabase Storage e chamada da Edge Function;
- `validar.html`: **só** calcula dígitos verificadores de CPF/CNPJ; não valida criptograficamente uma assinatura eletrônica;
- `template-os.html`: ordem de serviço da Altnix, **não** modelo jurídico de contratação do Jornal IR.

### Lacunas e riscos observados (não presumir que o backend os resolva)

1. `checkIfSigned` consulta qualquer registro em `assinaturas` pelo documento e bloqueia o restante: inadequado à assinatura de ambas as partes ou múltiplos representantes.
2. O JavaScript do painel não impõe controle de acesso administrativo antes de operar; a autorização pode depender da RLS e funções externas, não auditadas nesta revisão.
3. O link expõe UUID de `documentos` como localizador e a interface envia `documento_id`; exigir token aleatório, expiração, autorização por destinatário, controle de estado e revogação server-side. UUID não deve ser tratado como segredo suficiente.
4. `getPublicUrl` é usado para documentos; revisar privacidade do bucket e substituir por URLs temporárias autorizadas quando aplicável.
5. A tela permite deletar documentos e linhas de assinaturas; preservar evidência final e aplicar política de retenção/arquivamento e auditoria.
6. Não existe fluxo verificado de hash imutável, carimbo temporal confiável, PDF final criptograficamente assinado, validação de identidade forte, OTP ou prova de entrega no código consultado.
7. O botão WhatsApp do painel é declarado e apresentado, mas `js/admin.js` não registra `addEventListener` para `whatsappBtn`: falta comportamento.
8. `getNextContractNumber` usa `count+1`; pode repetir números sob concorrência e após exclusões. Usar sequência atômica no banco.
9. `uploadForm` exige `currentFile`, enquanto a importação `url-to-pdf` define `currentFile=null`; caminho do ERP precisa de correção se for reutilizado.

**Limitação de auditoria:** as Edge Functions `salvar-assinatura` e `url-to-pdf`, políticas RLS, esquema completo, conteúdo do PDF final, logs e bucket do Supabase do assinador NÃO estão no GitHub. A conexão Supabase disponível não autorizou o acesso a esse projeto. Não declarar conformidade jurídica ou segurança operacional com base apenas no frontend.

## 3. Modelo de arquitetura recomendada

**Jornal IR** conserva a fonte de verdade do cliente, produto, contrato, cobrança e estado da contratação. **Motor de assinatura** é um serviço separado com API autentificada e webhooks; não faz escrita direta no banco do Jornal, não compartilha `service_role`, e pode ser evoluído a partir do código `assinador-os`, após auditoria.

Fluxo ideal:

1. Operador salva assinatura anual ou venda comercial como **rascunho/pendente de contrato**.
2. Clica em **Gerar contrato**. Servidor valida permissão e campos obrigatórios, reúne snapshots de cadastro, serviço, datas, preço e condições aprovadas.
3. Servidor gera PDF A4 **determinístico** por template versionado e guarda o original em R2 privado, SHA-256 e identificação da versão. Não alterar o PDF depois do início da assinatura.
4. Operador visualiza e confirma. Sistema cria solicitação de assinatura e signatários previstos (cliente titular/representante; representante do Jornal, se necessário), com ordem configurável.
5. Motor emite token criptograficamente aleatório, acesso por HTTPS, validade curta e renovável; cada destinatário vê apenas seu documento e só pode assinar no estágio correto. Para reduzir atrito, preferir link + OTP por e-mail/SMS/WhatsApp; login Google **opcional**, não obrigatório. Definir modalidade de evidência proporcional ao risco jurídico.
6. Cliente lê integralmente, aceita expressamente os termos e assina. Motor grava prova server-side: identidade/contatos verificados, consentimento, eventos/UTC, IP e user-agent conforme LGPD, hash do PDF original e final, método de autenticação e comprovante de conclusão.
7. Webhook assinado (HMAC) e idempotente atualiza `sent/viewed/signed/declined/expired/cancelled`. Somente confirmação autenticada do motor marca a operação `signed` no Jornal IR.
8. PDF final + trilha de auditoria ficam em armazenamento privado com política de retenção; visualização/baixar por acesso autenticado e URLs expiráveis. Versões anteriores não podem ser sobrescritas.
9. E-mail ao destinatário e botão **Enviar por WhatsApp**; envio manual via `wa.me` pode ser primeira fase. Meta Cloud API automática somente com template próprio aprovado, consentimento e controle de entrega.

**Não** ativar entrega de publicidade/assinatura paga automaticamente ao criar PDF; a regra operacional entre `signed`, `paid`, `approved`, `active` deve ser expressa e aprovada.

## 4. Contratos e PDFs: três templates editáveis, mas versionados

- `annual_print_subscription_v1`
- `print_advertising_v1`
- `led_advertising_v1`

Metadados mínimos por versão: CNPJ/razão social do Jornal corretos, representante legal; nome/CPF/CNPJ cliente, representante e poderes; objeto; produto e especificações; quantidade; início/fim; valor e parcelas; forma de pagamento; materiais e responsabilidades; entrega ou veiculação; regras de cancelamento/inadimplemento/arrependimento aplicáveis; solução de conflito; ciência/aceite da modalidade de assinatura; data e signatários; versão das cláusulas.

O texto jurídico de cada template **deve ser revisado e aprovado por advogado brasileiro**. O código do Assinador não contém cláusulas contratuais próprias do Jornal IR e não oferece base para declarar qualquer modelo contratual já válido.

## 5. Interfaces técnicas sugeridas

Jornal (Server Actions protegidas):
- `createSigningDocument({sourceKind,sourceId,templateVersion})` -> `signingRequestId`;
- `sendSigningInvitation({signingRequestId,channel})` -> evento de envio, com confirmação antes do WhatsApp;
- `revokeSigningInvitation(signingRequestId)` (não apagar evidências);
- `getSigningStatus(signingRequestId)` -> versão/participantes/status/trilha;
- `GET /api/signing/documents/:id/download` autenticado, sem PDF público.

Motor de assinatura (contrato de integração a especificar, **não existe API auditada ainda**):
- `POST /v1/signing-requests`: PDF e signatários, `externalReference`, hash, idempotency key;
- `POST /v1/signing-requests/:id/invite` / `revoke`;
- `GET /v1/signing-requests/:id/status`;
- `POST /api/integrations/signing/webhook`: ID único, timestamp, HMAC, proteção replay, status e arquivos.

Tabelas futuras no Jornal (não criar antes de auditoria de segurança):
- `contract_template_versions`: template versionado e revisão jurídica;
- `signing_requests`: sourceKind/sourceId, clientId, templateVersion, pdfOriginalKey/hash, externalRequestId, status, timestamps, ID do operador;
- `signing_participants`: sequência, destinatário/snapshot, verificationMethod, status; não expor CPF no link;
- `signing_events`: append-only, sem payload secreto, idempotency key, status e evidência;
- `signed_documents`: signedPdfKey/hash, evidenceKey/hash, retenção, originalSigningRequestId.

Aplicar RLS/servidor/RBAC (módulo Assinaturas ou Comercial), restringir documento ao próprio cliente/operador autorizado e ao signatário correto. Nunca usar JS frontend com `service_role` ou URL de PDF permanente.

## 6. Aspectos jurídicos (triagem, NÃO parecer)

- MP 2.200-2/2001 art. 10, §2º: admite outros meios de comprovação de autoria/integridade, quando aceitos pelas partes.
- Lei 14.063/2020 art. 4º: distingue simples, avançada e qualificada. Não presumir que uma imagem manuscrita em PDF seja assinatura digital qualificada.
- CPC art. 784, §4º (Lei 14.620/2023): para títulos eletrônicos, assinatura de testemunhas pode ser dispensada quando a integridade é conferida por provedor de assinatura; executividade não é automática.
- CDC art. 46/49: transparência e direito de arrependimento de sete dias nas situações de contratação fora do estabelecimento, quando aplicável.
- LGPD: minimização, finalidade e segurança dos dados pessoais, retenção e acesso controlado.
- ITI VALIDAR afere modalidades e infraestruturas por ele reconhecidas; uma assinatura eletrônica simples/privada pode ter valor probatório, mas não deve ser anunciada como certificação ICP-Brasil nem como validável no ITI sem verificação técnica.

Fontes oficiais: 
- https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm
- https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm
- https://normas.leg.br/?urn=urn:lex:br:federal:lei:2023-07-13;14620@2023-07-13!art34_cpt_alt1_art784
- https://validar.iti.gov.br/
- https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html

## 7. Ordem de execução / liberação

**Lote 1 — auditoria obrigatória:** obter leitura autorizada do projeto Supabase `assinador-os`, migrations, Edge Functions, RLS, Storage, modelo de evidências e um PDF final de teste; executar teste de falsificação de link/signatário/CPF e concorrência. Não alterar o serviço original em produção.

**Lote 2 — jurídico e templates:** consolidar dados oficiais do Jornal, cláusulas por produto, aprovação jurídica, desenho de versão e PDF; identificar representante legal e assinatura do Jornal.

**Lote 3 — motor:** autorização server-side, signatários múltiplos, tokens de convite, OTP opcional, hash SHA-256, auditoria imutável, status e revogação, entrega segura de PDF. Testes e relatório técnico da modalidade de assinatura.

**Lote 4 — Jornal:** integrar aos módulos `assinaturas` e `publicidade/vendas`; botões `Gerar contrato / Prévia / Copiar link / Enviar WhatsApp / Acompanhar / Baixar assinado`; segregar permissões por função.

**Lote 5 — homologação:** testes reais controlados para impresso, publicidade impressa e LED, 2 signatários, e-mail, WhatsApp, expirado/rejeitado, assinatura repetida, auditoria, PDF, versão e webhook. Publicação somente após validação funcional, segurança e texto jurídico.

**Critérios de aceite:** nenhum PDF confidencial publicamente acessível; usuário diferente não assina; ninguém finge identidade alterando CPF em formulário; assinado não pode ser apagado silenciosamente; document hash verificável; nenhuma veiculação ou cobrança é iniciada apenas por gerar um link; WhatsApp não transmite sem confirmação/template válido.
