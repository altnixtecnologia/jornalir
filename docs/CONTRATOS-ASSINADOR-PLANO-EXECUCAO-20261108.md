# Jornal IR — Contratos e Assinador: plano de execução e decisões (08/11/2026)

> **Fonte de verdade desta frente.** Decisões definidas pelo proprietário em 08/11/2026. Trabalhar em etapas fechadas, aproveitando o que existe; não misturar módulos, não publicar nem executar testes reais sem autorização operacional. Atualizar a seção **Andamento** após CADA etapa, com evidências e pendências. Esta especificação não significa implementação.

## Objetivo e experiência de uso

Partir do **cadastro único do cliente** (pessoa física/jurídica e representantes), escolher um ou mais planos/serviços, ajustar condições negociadas, selecionar modalidade de contrato, gerar/revisar PDF, formalizar assinatura de representante autorizado do Jornal IR, enviar link privado automaticamente pelo WhatsApp quando o canal estiver homologado, colher o aceite do contratante e finalizar com PDF/evidências privados, e-mail ao cliente, aviso administrativo no Telegram e verificação por QR Code.

As áreas Cadastros, Assinaturas, Comercial, Financeiro e Contratos continuam existindo; o operador deve percorrer **uma jornada simples** com vínculos consistentes. Sem cliente paralelo, contratos paralelos ou terceiro assinador.

## Decisões obrigatórias e regras de aceite

1. **Modalidade seletora**: Comercial ou Institucional no início do fluxo; seleção por lista, não vários botões. A modalidade controla modelos, partes, assinantes e campos exigidos. A interface deve ser unificada, mas respeitar os dois pipelines existentes, avaliando compartilhamento de componentes e segurança em vez de mesclar tabelas à força.
2. **Assinatura pela empresa — Comercial**: usuário vendedor/gerador poderá assinar **somente se autorizado** nas permissões individuais. Upload de PNG de assinatura exclusivamente no próprio **Meu perfil**, visível somente a quem tem a permissão; conferir também autorização em ação do servidor e política de Storage/RLS. Dados e nome de quem vendeu/gerou podem constar no documento. O PNG é visual; o ato de assinatura exige confirmação explícita do usuário autenticado, versão/hash do documento, hora/autor e evidência. Não presumir poderes de representação apenas por estar logado.
3. **Assinatura pela empresa — Institucional**: usar o **representante legal cadastrado** em Configurações → Dados da empresa, com identificação, poderes e assinatura PNG em armazenamento privado. Confirmar o ato de assinatura com a identidade/autorização do representante; nunca aplicar PNG silenciosamente como se fosse assinatura eletrônica qualificada.
4. **Preços**: usar tabela vigente como referência e permitir **valor negociado por item** antes de fechar. Mostrar preço tabelado versus negociado, justificativa e usuário/data da alteração, conforme permissão granular. Imutabilidade histórica: proposta/venda/contrato guardam snapshot, sem mudar a tabela global ou recalcular um acordo assinado. Não impor limite de desconto não aprovado.
5. **Contrato combinado**: um único PDF e assinatura para múltiplos serviços quando combinado. Cabeçalho com CONTRATADA e CONTRATANTE; cláusulas numeradas: "2. SERVIÇOS CONTRATADOS", "2.1 Assinatura anual", "2.2 Publicidade em painel LED" etc. Cada serviço com descrição, quantidade, valor, periodicidade, início, fim, entrega/veiculação, renovação e encerramento próprios (p.ex. impresso 3 meses, LED 12 meses). Cancelar um serviço não cancela os demais automaticamente. Após assinatura, mudanças por aditivo versionado, sem sobrescrever original.
6. **Modelos gerenciáveis**: Configurações → Modelos de contratos, com nome, modalidade, categoria, versão, campos/variáveis, editor de texto e possibilidade de PDF/modelo anexo conforme fluxo real suportado; modelos específicos de licitação, prefeitura, Câmara e outras condições devem ser possíveis sem modificar código. Priorizar extensão do `contract_templates` e editor existentes. Se um PDF anexo não puder ser mesclado com variáveis com segurança, oferecer fluxo de documento fixo com conferência manual, e explicitar o limite em vez de converter conteúdo arbitrário de forma insegura.
7. **Estados das minutas**: 6 minutas existentes podem ser usadas para **homologação somente**, com indicação explícita "MINUTA DE TESTE — SEM EFEITO CONTRATUAL", sem cobrança, ativação de serviço, publicação ou assinatura de obrigação real. Separar "habilitada para teste" de "ativa para produção". Produção só após **aprovação jurídica registrada por admin/owner** (aprovador, data, identificação da versão e evidência da revisão). Ativar/desativar e trocar versão geram auditoria. Não tratar o simples clique em "Ativar" como parecer jurídico.
8. **Cliente e assinatura**: convite/link individual revogável e com expiração; revisão do PDF completo; aceite expresso de uma versão imutável; OTP por e-mail/telefone conforme mecanismo disponível, sem conta administrativa. Google OAuth pode ser opção adicional, não obrigatório; `sub` não equivale a prova da identidade civil. Assinatura desenhada ou PNG não substituem as evidências técnicas. Validar o nível de garantia/provedor escolhido com advogado antes da operação real.
9. **Concluir só com todas as assinaturas requeridas**: preferencialmente a do Jornal IR antes do convite ao cliente. Guardar PDFs e hashes da versão antes/depois de cada assinatura; manter original intacto.
10. **Comunicações**: convite via Cloud API Meta já existente para mensagens transacionais, template de assinatura específico aprovado, número validado e opt-in; **não** confundir com o WhatsApp Business de atendimento que permanece separado. Se automação indisponível, informar claramente e oferecer envio manual do link, nunca simular envio. Ao concluir, e-mail com documento assinado ao cliente (template visual do Jornal IR, entrega real auditada) e aviso Telegram aos admins, com cliente/documento/hora/status, sem PII sensível ou PDF em grupo.
11. **Auditoria**: eventos de criação, edição, valores especiais, upload/troca de PNG, concessão/revogação de poderes, modelo/versão/aprovação jurídica, geração/revisão/envio do PDF, assinatura/tentativas/OTP, entrega/falha/reenvio das notificações, verificação e revogação. Eventos append-only contra usuários normais, visíveis apenas a admins autorizados; não apagar via UI. Informar política de retenção compatível com LGPD e obrigações legais; não prometer imutabilidade contra administrador do banco.
12. **Armazenamento e recuperação**: PDFs originais, assinados, comprovantes e assinaturas PNG em storage PRIVADO, caminhos versionados, sha256 e vínculo no banco; jamais sobrescrever documento concluído. Operação idempotente contra clique duplo/falha/timeout e estados recuperáveis. Cópia independente/backup verificado e teste de restauração; arquivos PDF são pequenos, priorizar segurança sem replicação excessiva. **Não declarar garantia absoluta de zero perda** antes de comprovar backup/restauração.
13. **QR Code**: no PDF final, levar a página de validação por identificador opaco; mostrar status e hash/identificação mínima, sem expor documentos ou dados pessoais. Conferir hash da cópia apresentada; recurso complementar, não substitui autenticidade jurídica.
14. **Financeiro e veiculação**: assinatura concluída, cobrança paga e serviço habilitado são estados independentes. NÃO ativar serviços, gerar cobrança, suspender anúncios ou enviar mensagens financeiras por consequência automática antes de definir e homologar regras por modalidade.
15. **Segurança e experiência**: permissões no frontend E backend/RLS, mínimo privilégio, token e segredo nunca expostos, histórico de consentimento adequado; uma rota/tela de consulta de andamento dentro do cliente para colaboradores autorizados. Mensagens claras de status e erro; finalizar somente quando banco/storage confirmarem.
16. **E-mails internos do sistema**: convites genéricos/sem identidade visual foram relatados (ex.: usuário Silas foi convidado com sucesso). Padronização visual da entrega contratual e revisão dos e-mails genéricos serão feitas em lote separado, sem bloquear o catálogo de contratos.

17. **Rubricas e posicionamento no PDF**: a rubrica gráfica deve aparecer integrada ao PDF consolidado somente após cada signatário efetivamente confirmar a assinatura eletrônica. Para modelos próprios, posições automáticas de rubrica no rodapé de páginas intermediárias, assinaturas das partes na última página, data/hora e QR Code, sempre respeitando margens. Para modelos especiais, licitações e PDFs importados, permitir posicionamento visual manual de cada campo (tipo, signatário, página, coordenadas, tamanho), com prévia e salvamento **por versão do modelo** para reutilização, sem modificar o documento assinado original. A rubrica visual não substitui hash, aceite, autenticação ou demais evidências. Verificar viabilidade antes da Etapa 3 para não refazer o editor de modelos.

## Estado técnico confirmado na revisão de 08/11/2026 (somente leitura)

- Repositório `altnixtecnologia/jornalir`, branch de trabalho `solicitacoes-financeiro-contratos-irc-20261031`, commit-base `5d136e150daa92e37979cf1df2f810d655fb4b0a`.
- Já existem `clients`, `subscriptions`, `commercial_products`, `commercial_proposals`, `commercial_sales`, `receivables`, `contract_templates`, modelo comercial combinado e snapshot por serviço.
- Dois fluxos de assinaturas: institucional (`contract_signature_*`, rota `/assinar-contrato`) e comercial (`commercial_signature_*`, rota `/assinar-contrato-comercial`). O segundo painel hoje instrui a copiar links e informa que não há envio automático.
- `ProfileSettings.tsx` já existe; `UsersManager.tsx` já gerencia permissões de módulo/financeiro; `configuracoes/page.tsx` centraliza atalhos. Reusar esses locais.
- No Supabase de produção: **6** linhas em `contract_templates`, todas `active=false`; **0** solicitações de assinatura comercial, **0** convites institucionais e **0** documentos comerciais. As migrations do seed estão registradas como aplicadas — não reaplicar. Nenhum contrato de teste foi criado neste levantamento.
- O envio do modelo de convite institucional existe em `whatsappCloudProvider.ts` e exige template aprovado `WHATSAPP_SIGNATURE_INVITE_TEMPLATE`; o fluxo comercial só tem compartilhamento manual atualmente.
- Consultar `docs/MODELOS-DE-CONTRATO-MINUTAS-BLOCO3-20261101.md`, `docs/CONTRATOS-ASSINADOR-OS-SEGURANCA.md`, `docs/CONTRATACOES-INTEGRACAO-E-ETAPAS.md`, `docs/STATUS-E-HANDOFF.md`; verificar versão remota antes de implementar.

## Sequência imutável de execução por partes (não pular fases)

### Etapa 0 — Inventário e especificação
- [x] Registrar regras do proprietário e ordem de execução.
- [x] Conferir bases existentes de perfil, permissões, templates e dois assinadores; documentar pontos de integração.
- [x] Confirmar estado das 6 minutas de produção por consulta somente leitura.
- [x] Complementar inventário remoto/SQL de permissões, tabelas, RLS e buckets; localizar componentes e assinadores dos projetos antigos.
- [x] Conferir também a árvore de arquivos **no PC local** e o histórico de migrations antes de criar novas (feito por Claude em 08/11/2026: branch sincronizada em fa03075f, stashes/worktrees preservados, última migration local era 20261122130000; ledger remoto sem pendências além das 3 desta etapa).

### Etapa 1 — Configurações, perfil, poderes e modelos (primeiro lote de CÓDIGO)
- [x] Configurações → Dados da empresa e representante(s) legal(is), regras de representação e PNG privado, com upload/atualização autorizados e auditados. *(código + testes; migrations não aplicadas)*
- [x] Permissão granular de **assinar contratos comerciais** (`publicidade.contratos_assinar`) — **concessão explícita para TODOS, inclusive admin e owner** (ajuste de 08/11/2026: função SQL `staff_can_sign_commercial_contracts`, painel em Usuários, auditoria) — no editor do usuário; quando negada, não mostrar configuração PNG em Meu perfil e negar acesso em Server Actions/Storage/RLS. Quando concedida, habilita o PNG no perfil. *(a confirmação eletrônica explícita do ato de assinar fica na Etapa 3)*
- [x] Configurações → Modelos de contratos com seletor, editor, anexo (documento fixo PDF), categorias, versões, ativar/desativar, modo teste e registro de aprovação jurídica; reaproveita `contract_templates` e o gerenciador existente. *(código + testes; migrations não aplicadas)*
- [x] Testes de permissões, acesso direto negado, tipo de arquivo, armazenamento privado, auditabilidade, versionamento, minutas teste ≠ produção. *(unitários/estruturais + banco em transação com ROLLBACK; testes com usuários reais e Storage real dependem de aplicar as migrations e de login)*
- **Critério de encerramento**: configurações completas e isoladas, demonstráveis sem disparar assinatura/envio/cobrança real. Código/testes aprovados e commit local; não publicar automaticamente. **Atingido em 08/11/2026 (código e testes); falta aplicar migrations e validar com login real antes de publicar.**

### Etapa 2 — Montagem de contratação e documento combinado
- [x] Abrir contratação a partir de cliente mestre; selecionar Comercial/Institucional e múltiplos serviços; aplicar valores especiais auditados. *(`/sistema/publicidade/contratacao?clientId=`; valores negociados com tabela original + justificativa + auditoria; sem permissão granular própria de valor especial)*
- [x] Um PDF com cabeçalho das partes, itens 2.1/2.2..., preço e vigência próprios *(minuta com marca visível; também disponível ao documento oficial via `{{servicos.clausulas}}` quando a empresa está cadastrada)*; [ ] anexos e licitações: modelos específicos selecionáveis, mas documento fixo em PDF não mescla variáveis e não gera minuta aqui.
- [~] Fluxo de revisão, snapshot imutável, versão/aditivo, seleção de representante autorizado; documento teste separado do real. *(fluxo existente proposta → venda → pacote → revisão → emissão preservado; minuta de teste é efêmera e separada do documento real; representante = padrão válido na data — escolha explícita e contratação institucional persistida ficam pendentes)*
- [~] Testar não duplicação, edição de valores pré-fechamento, modificações posteriores do catálogo (preço de tabela relido do servidor), alterações parciais e conflitos. *(unitário/estrutural + banco em transação com ROLLBACK; teste com login real pendente)*

### Etapa 3 — Assinatura eletrônica e auditoria probatória
- [ ] Reaproveitar assinadores existentes sob UX compartilhada; manifestação explícita e assinatura do representante comercial autorizado/institucional legal.
- [ ] Convite individual, leitura, OTP e Google opcional se não trouxer atrito, aceite do cliente; PDF assinado acumulativo e comprovante/hashes.
- [ ] Rubricas e campos de assinatura integrados ao PDF consolidado: posicionamento automático nos modelos internos e manual/reutilizável por versão em PDFs e contratos especiais.
- [ ] Revisão jurídica da solução técnica e critérios de prova, privacidade, poderes e testemunhas onde houver exigência.
- [ ] Testar expiração, reenvio, revogação, concorrência, 2+ assinantes, adulteração de PDF e controle de acesso.

### Etapa 4 — Integrações e retenção segura
- [ ] Convite WhatsApp com template aprovado e consentimento; fallback manual honesto.
- [ ] E-mail final com PDF ao cliente e identidade visual; Telegram só com resumo à equipe; status/erros/reenvios auditados.
- [ ] QR Code/página de verificação sem vazamento de PII; armazenamento com backup independente, checagem de hashes e restauração testada.
- [ ] Testar desconexões, timeouts, webhooks, duplicidade e tentativas não entregues.

### Etapa 5 — Homologação ponta a ponta e autorização de produção
- [ ] Demo isolada usando minutas marcadas **TESTE**, sem obrigação ou cobrança; incluir advogado como testador para revisão jurídica prática.
- [ ] Revisar parecer e versões, registrar aprovação jurídica humana; só então liberar modelo específico para produção.
- [ ] Teste com equipe e dispositivos reais: do cadastro à assinatura, armazenamento, e-mail, Telegram, QR; autorização de ativação/pagamento por serviço separada.
- [ ] Plano de backup/rollback e publicação controlada apenas mediante autorização; relatório final por módulo.

## Andamento (atualizar ao encerrar CADA etapa)

**08/11/2026 — Etapa 0, registro inicial (ChatGPT, acesso GitHub conectado):**
- **Concluído:** inventário inicial de reuso; decisões detalhadas e checklist de 5 etapas; consulta somente leitura da situação das minutas e pipelines.
- **Falta:** inventário local completo de tabelas/RLS/storage, toda a implementação da Etapa 1, testes autenticados, avaliação jurídica, Etapas 2–5.
- **Próximo:** Claude Code no VS Code sincroniza a branch oficial com GitHub, confirma stashes/worktrees, lê este plano e executa **somente Etapa 1** em um worktree/branch próprio, testes e relatório; não aplicar migrations, não publicar, não enviar mensagens reais sem autorização específica.
- **Limitação:** ChatGPT não tem acesso direto ao sistema de arquivos do PC Windows do proprietário; os commits feitos por GitHub só estarão no PC após `git fetch`/fast-forward (ou cherry-pick) pelo Claude/VS Code. Não declarar "salvo localmente" antes de verificar isso.

**08/11/2026 — Etapa 1 (Claude Code, VS Code local): CONCLUÍDA em código e testes; NÃO publicada, migrations NÃO aplicadas.**

```
Etapa: 1 — Configurações, perfil, poderes e modelos
Branch e SHA local/remoto: solicitacoes-financeiro-contratos-irc-20261031 — base fa03075f (inclui 60502ec0); SHA final no commit abaixo, enviado ao GitHub
```

**CONCLUÍDO (arquivos/telas, evidência):**
- **Permissão individual** `publicidade.contratos_assinar` ("Assinar contratos comerciais pela empresa"): catálogo (`staffPermissionsCatalog.ts`, crítica, nunca padrão) aparece sozinha no editor de usuário (Comercial). Migration `20261122140000` recria a CHECK `staff_module_actions_known_pair` a partir do catálogo e **corrige a divergência já existente** (`assinaturas_ativar` e `solicitacoes_gerenciar` estavam no catálogo mas faltavam na CHECK de produção). Trigger audita toda concessão/revogação (`audit_events`, `entity_type=staff_permission`, `grant|revoke`, `critical=true` para este poder). Teste de paridade catálogo × CHECK evita nova divergência.
- **Meu perfil → assinatura PNG** (`SignatureSection`, `perfil/signature-actions.ts`): só aparece se o servidor confirmar `contratos_assinar`; cada ação confere a permissão ANTES de qualquer acesso; o usuário só mexe na própria imagem (id vem da sessão). Bytes do PNG inspecionados (assinatura, chunks, CRC, IEND, sem APNG, ≤512 KB, ≤2000×2000), caminho por hash (`profiles/<id>/<sha256>.png`, nunca sobrescreve), URL assinada de 60 s. Tabela `staff_signature_images` com RLS (dono + permissão; sem policy de escrita para usuários) e bucket privado novo `signature-images` (PNG, 512 KiB, sem policy em `storage.objects`). O bucket JPEG `contract-signatures` NÃO foi alterado.
- **Configurações → Dados da empresa e representante legal** (`/sistema/configuracoes/empresa`, só admin/owner; link em Configurações): tabelas `company_profile` (singleton, separada do emissor NFS-e) e `company_legal_representatives` (nome, CPF validado, cargo, regra de representação individual/conjunta, poderes, documento comprobatório, vigência, ativo/padrão único, PNG privado versionado, sem DELETE — só desativar). Validação de CNPJ/CPF/UF/CEP/e-mail na aplicação e no banco. Auditoria por trigger sem PII (só nomes de colunas, hash e tamanho).
- **Configurações → Modelos de contratos** (`/sistema/configuracoes/modelos-contratos`, mesmo gerenciador e mesma tabela `contract_templates` de Financeiro → Modelos; nenhum cadastro paralelo): modalidade obrigatória (Comercial/Institucional), "específico para" (licitação, prefeitura, Câmara, outra condição — sem alterar código), documento de texto com `{{campos}}` OU **documento fixo em PDF** (bucket privado `contract-template-files`, hash, limite explícito na tela: sem mesclagem de variáveis, conferência manual), versões imutáveis (trigger), estados por versão **Rascunho / TESTE ("MINUTA DE TESTE — SEM EFEITO CONTRATUAL") / PRODUÇÃO**. Teste e produção são independentes. Produção exige aprovação jurídica registrada por admin/owner (aprovador, data, nota ≥10 caracteres, evidência, hash do conteúdo) — **imposto pelo banco** (CHECK `not active or legal_approved_at is not null` + RPCs), ativar desativa as outras versões do grupo, só a versão mais recente pode ser aprovada/ativada, revogar desativa a produção na mesma transação. Todo evento (criar, nova versão, teste on/off, aprovação, revogação, ativar, desativar) vai para `audit_events` dentro da própria função/trigger.
- **Defeito latente corrigido:** `set_contract_template_active` era SECURITY INVOKER e a tabela não tem policy de UPDATE (ativar/desativar pela tela falharia); agora é a única porta, SECURITY DEFINER com as regras acima. Novos modelos deixam de nascer `active=true` (default passou a `false`; INSERT sempre força estado seguro). As 6 minutas seed continuam `active=false`; nada é ativado.
- Migrations geradas (não aplicadas): `20261122140000_contract_signing_permission_and_permission_audit`, `20261122150000_company_profile_representatives_signature_images`, `20261122160000_contract_template_governance`.

**TESTADO:**
- Unitário/estrutural: `apps/sistema` 416/416 (inclui 6 arquivos novos/atualizados: PNG, validação de empresa/representante/PDF, paridade catálogo × CHECK, invariantes de segurança de Server Actions/migrations/buckets, seeds), `packages/core` 210/210 (serviço de modelos: modalidade obrigatória, documento fixo, estado seguro, teste × produção, aprovação), `apps/site` 44/44, `pdf-extraction` 47/47, `tsc` limpo (sistema e site), `next build` limpo (rotas novas presentes).
- **Banco (produção, somente em transação com ROLLBACK, nada persistiu):** as 3 migrations foram aplicadas e exercitadas numa transação revertida: CHECK nova aceita as 3 ações e recusa par desconhecido; auditoria grant/revoke sem duplicar; empresa singleton e CNPJ inválido recusados; representante padrão único e assinatura incompleta recusada; auditoria sem PII; PNG upload/replace/remove auditados; modelo nasce rascunho mesmo forçando `active/teste/aprovação` no INSERT; ativar sem aprovação bloqueado (RPC e UPDATE direto); conteúdo imutável; não-admin não aprova nem altera teste; aprovação exige nota/evidência; uma versão ativa por grupo; revogação desativa; documento fixo exige anexo completo; seeds intactas. Verificado depois: tabelas/colunas não existem em produção e o ledger continua sem as 3 migrations.
- **NÃO testado:** interface autenticada (sem login), Storage real (upload/URL assinada, `SUPABASE_SERVICE_ROLE_KEY` só existe no ambiente Production), RLS por usuário real (operador sem permissão tentando ler/gravar), fluxo completo no navegador. Testes de permissão com usuários reais só depois de aplicar as migrations.

**FALTA:**
- Aplicar as 3 migrations (autorização específica) e, **antes de publicar o código**, garantir que estejam aplicadas: o repositório de modelos passa a ler colunas novas — publicar sem migrar quebra a listagem de modelos.
- Teste manual com login: operador sem/com `contratos_assinar` (Meu perfil, upload PNG, acesso direto negado), admin cadastrando empresa/representante/PNG, fluxo de modelos (teste → aprovação → produção → revogação), PDF fixo.
- Confirmação eletrônica explícita da assinatura (Etapa 3); consumo dos dados da empresa/representante nas variáveis `contratada.*` e no signatário (Etapa 2/3); uso das minutas em modo teste com a tarja "MINUTA DE TESTE" na geração do documento (Etapa 2/5) — hoje a emissão comercial continua exigindo `active`; o modo teste ainda não gera documento.
- Posicionamento de rubrica/campos por versão do modelo (item 17 — viabilidade avaliada para a Etapa 3: as colunas de versão do modelo comportam um `signature_layout` jsonb sem refazer o editor; não implementado agora).
- Política de retenção/limpeza de PNGs antigos (hoje cada troca mantém a imagem anterior no bucket privado — versionadas por hash; a retenção deve ser decidida com o jurídico/LGPD) e backup/restauração do bucket (Etapa 4).
- Aprovação jurídica de verdade das 6 minutas (advogado) — Etapa 5.

**BLOQUEIOS/RISCOS:**
- Admin e owner passam em `contratos_assinar` por regra do sistema (`staff_can_module_action`), logo veem a seção de PNG no Meu perfil. O ato de assinar continuará exigindo confirmação explícita (Etapa 3); se o proprietário quiser exigir a concessão explícita também para admin, é decisão a tomar antes da Etapa 3.
- Edição de permissões continua gravando direto do navegador (RLS); a auditoria agora é por trigger (não depende da tela), mas o salvamento não passa por Server Action.
- Gerenciar modelos continua protegido pela permissão financeira `contratos_editar` (+ visibilidade do módulo Financeiro); operadores só do Comercial leem modelos `commercial_*` mas não os gerenciam.
- Upload de PNG/PDF usa o cliente admin, desativado fora do ambiente Production da Vercel (política existente): em Preview/local o envio falha com mensagem, por segurança.
- O PNG é só imagem; Lei 14.063/MP 2.200-2: nenhuma tela afirma "assinatura avançada/qualificada".

**Migrations geradas/aplicadas:** 3 geradas, **0 aplicadas** (validadas só em transação com ROLLBACK).
**Banco, mensagens e deploy real alterados?:** Banco: não (somente leituras e transação revertida). Mensagens (WhatsApp/e-mail/Telegram): não. Deploy/Vercel: não. NFS-e, financeiro e demais módulos: não alterados.
**Próxima etapa:** Etapa 2 — montagem da contratação e documento combinado (aguarda autorização; não iniciada).

**08/11/2026 — Ajuste da Etapa 1 + Etapa 2 (Claude Code, VS Code local): CONCLUÍDOS em código e testes; NÃO publicados, migrations NÃO aplicadas.**

```
Etapa: ajuste da 1 (concessão explícita de assinar contratos comerciais) + 2 — Montagem de contratação e documento combinado
Branch e SHA local/remoto: solicitacoes-financeiro-contratos-irc-20261031 — base 9bfa652b (Etapa 1); SHA final no commit abaixo, enviado ao GitHub
```

**CONCLUÍDO — ajuste da Etapa 1 (concessão explícita para TODOS, inclusive admin e owner):**
- `publicidade.contratos_assinar` deixa de ser presumida pelo papel. Nova função SQL `staff_can_sign_commercial_contracts()` (migration `20261122170000`) só libera com linha `allowed=true` para o próprio usuário ativo, qualquer que seja o papel (operador ainda precisa enxergar o módulo Comercial). A regra geral de acesso administrativo dos demais módulos (`staff_can_module_action`) **não foi alterada** (teste trava isso).
- A RLS do PNG (`staff_signature_images`) passa a usar essa função: sem concessão o campo não aparece no Meu perfil e o servidor bloqueia (`checkContractSigningGrant` em todas as ações de assinatura; o papel não vale).
- Administração da concessão em **Usuários** (`ContractSigningGrantsPanel` + `setContractSigningGrantAction`): o proprietário concede/revoga para qualquer usuário ativo (inclusive admin e ele mesmo); o administrador, somente para operadores. Escrita com a sessão (RLS é a barreira; políticas novas só para esta ação e só do proprietário para admin/owner). Auditoria por trigger (`grant`/`revoke`, `critical=true`).

**CONCLUÍDO — Etapa 2:**
- **Entrada pelo cadastro único**: botão "Nova contratação" na ficha do cliente e atalho no Comercial → `/sistema/publicidade/contratacao?clientId=` (`ClientPicker` existente). Seletor **Comercial/Institucional** e **modelo em lista** (estado de cada modelo visível; rascunho, documento fixo e modalidade errada aparecem desabilitados com o motivo). Permissão: Comercial = `contratos_preparar`; Institucional = permissão financeira `contratos_criar`.
- **Vários serviços no mesmo documento**: itens do catálogo (publicidade jornal/painel LED/etc.), assinatura do jornal e serviço avulso, até 30; cada um com quantidade, periodicidade, início/término, descrição, entrega/veiculação, renovação e encerramento próprios.
- **Valores negociados por item sem perder o original**: o preço de **tabela** do catálogo é lido no SERVIDOR (o navegador não decide o original); negociado ≠ tabela exige justificativa (validada no cliente e no servidor); desconto/acréscimo e % calculados; histórico (tabela × negociado × justificativa × quem × quando) vai para a auditoria (`negotiated_values_recorded`) e, na proposta, para as notas internas. Na proposta o preço de tabela fica em `unit_price` e o negociado vira `discount_amount` (total = negociado) — reaproveita `commercial_proposals`/`commercial_proposal_items`, sem tabela nova.
- **Cláusulas "2. SERVIÇOS CONTRATADOS" → 2.1, 2.2…** com valor de tabela × negociado, justificativa, vigência e demais condições independentes, mais cláusula de independência ("cancelar um serviço não cancela os demais") — `{{servicos.clausulas}}` (e `{{servicos.resumo}}` por compatibilidade); se o modelo não usa a variável, o bloco é acrescentado ao final com aviso.
- **PDF com cabeçalho CONTRATADA/CONTRATANTE** (dados da Etapa 1: empresa + representante padrão **dentro da vigência dos poderes**; contratante do cadastro mestre; campo ausente vira `[PENDENTE: …]` e aparece em "Pendências" — nunca presume CNPJ/endereço/poderes) e **marca visível em todas as páginas** (faixa no topo e no rodapé + tarja diagonal). Reaproveita `buildContractTemplatePdf` (aditivo: `parties`/`watermark` opcionais; documentos antigos saem iguais).
- **Minutas TESTE sem ativar produção**: modelo habilitado para teste → "MINUTA DE TESTE — SEM EFEITO CONTRATUAL"; modelo em produção → "MINUTA PARA CONFERÊNCIA — NÃO ASSINAR" (não é emissão oficial); rascunho nunca gera. A minuta é gerada na hora e **não é gravada**, assinada, enviada nem cobrada; gerar minuta não ativa nem aprova modelo (teste estrutural). Cada geração é auditada (`contract_draft_generated`, com modelo/versão/estado, serviços, totais, hash do PDF, `persisted:false`).
- **Criar proposta** com os itens (serviço de propostas existente; só catálogo; bloqueia acréscimo acima da tabela) — o fluxo comercial existente (aprovar → venda → pacote → revisão → emissão) segue como estava.
- **Integração no documento OFICIAL** (aditiva, só quando os dados da empresa estão cadastrados): `contratada.*` vêm das Configurações (prevalecem sobre texto digitado por documento), `servicos.clausulas` fica disponível a modelos que a usem (numeradas a partir do snapshot da venda: preço original = unitPrice, negociado = total ÷ quantidade) e o PDF emitido recebe o cabeçalho das partes. Sem cadastro (ou antes das migrations) o fluxo anterior é idêntico. A emissão continua exigindo modelo `active` e versão mais recente.
- **Função de leitura da CONTRATADA** `get_contract_contractor_profile()` (migration `20261122180000`): empresa + representantes ativos **sem** imagem/hash de assinatura, só para admin/owner ou quem prepara/revisa contratos ou gerencia contratos no Financeiro; a RLS dos representantes (admin/owner) não mudou.
- **Bug real encontrado e corrigido**: o gerador de PDF lançava erro ao desenhar caracteres que a fonte padrão não codifica (ex.: "→"), derrubando a geração; agora substitui por equivalente seguro ("->") ou "?" (acentos preservados) — vale também para os documentos antigos.
- Migrations geradas (não aplicadas), além das 3 da Etapa 1: `20261122170000_explicit_contract_signing_grant`, `20261122180000_contractor_profile_for_contract_preparers`.

**TESTADO:**
- Unitário/estrutural: `apps/sistema` 458/458 (inclui 4 arquivos novos: núcleo da composição, documento com **PDF real lido de volta** — marca em cada página, cabeçalho, cláusulas, pendências —, segurança/estrutura e a concessão explícita), `packages/core` 210/210, `apps/site` 44/44, `pdf-extraction` 47/47, `tsc` e `next build` limpos (rotas novas presentes).
- **Banco (produção, somente em transação com ROLLBACK, nada persistiu), com papéis reais (`authenticated`/`anon`, RLS ativa):** concessão explícita (owner sem concessão negado; concede a si pela RLS; revoga; PNG só do dono e só com concessão; operador não lê PNG alheio; operador sem módulo visível negado; operador não concede; admin simulado: recebe do owner, não concede a admin/owner, concede a operador; regra geral de owner/admin intacta; auditoria de grant/revoke) e `get_contract_contractor_profile` (operador sem permissão negado; anon negado; operador com `contratos_preparar` lê empresa + representantes ativos sem nenhum dado de assinatura; tabela de representantes continua ilegível ao operador; empresa ausente → null; auditoria sem PII). Verificado depois: nenhuma das funções/tabelas existe em produção e o ledger segue com 5 migrations pendentes (`…140000` a `…180000`).
- **NÃO testado:** interface autenticada (sem login), geração real no navegador (download/abertura do PDF), Storage real, fluxo completo cliente → proposta → venda → emissão com dados reais, e-mails/WhatsApp (nada é enviado).

**FALTA:**
- Aplicar as 5 migrations (autorização específica); teste manual com login (Comercial e Institucional, operador com/sem concessão, proposta criada, PDF aberto).
- **Persistir a contratação institucional composta** (hoje a modalidade Institucional gera só a minuta e leva ao contrato institucional existente) e o vínculo "modelo escolhido → pacote/atribuição" no fluxo comercial (hoje o modelo é escolhido para a minuta; a atribuição oficial segue no painel do pacote).
- **Minuta de teste dentro do pacote da venda** (conferência por serviço com modelo em teste): o trigger `validate_commercial_template_assignment` exige modelo ativo — exigiria migration; evitado nesta etapa. Documentos de teste **persistidos** (com `is_test` e bloqueio de assinatura/cobrança) também não foram criados: a minuta é efêmera por desenho.
- Assinatura do jornal como item **persistido** em contrato comercial (fica só na minuta; a assinatura segue a entidade `subscriptions`) e a integração de preço de tabela das assinaturas (valor digitado).
- Seleção explícita de **qual** representante legal assina (hoje usa o padrão válido na data), aditivos pela nova tela, permissão granular de "valor especial" (hoje bastam as permissões de preparar contratos/criar propostas) e atualização dos modelos seed para usar `{{servicos.clausulas}}` (nova versão + aprovação jurídica — Etapa 5; os seeds não foram tocados).
- Etapas 3, 4 e 5 (assinatura eletrônica, integrações/retenção, homologação ponta a ponta) — **não iniciadas**.

**RISCOS:**
- **Ordem de publicação:** aplicar as 5 migrations ANTES de publicar o código (modelos leem colunas novas; a função de leitura da contratada e a concessão explícita dependem de `170000`/`180000`). O carregador da CONTRATADA tolera a ausência da função (devolve "não configurado"), mas a listagem de modelos não.
- **Dados da empresa prevalecem** sobre `custom_values` na emissão oficial quando cadastrados (decisão explícita: cadastro mestre vence texto livre, como já ocorre com `cliente.*`); avaliar antes de cadastrar a empresa em produção.
- Minuta de teste não é prova de nada; "MINUTA PARA CONFERÊNCIA" de modelo em produção também não substitui a emissão oficial.
- Admin/owner sem concessão **perdem** acesso à imagem de assinatura (a imagem não é apagada). Conceder a si mesmo exige ser proprietário.
- Upload/URL assinada de PNG/PDF só funciona no ambiente Production da Vercel (política existente do cliente admin).

**Migrations geradas/aplicadas:** 5 geradas na frente (`140000`–`180000`), **0 aplicadas** (validadas só em transação com ROLLBACK).
**Banco, mensagens e deploy real alterados?:** Banco: não (somente leituras e transações revertidas). Mensagens (WhatsApp/e-mail/Telegram): não. Deploy/Vercel: não. NFS-e, financeiro e demais módulos: não alterados; nenhuma cobrança gerada.
**Próxima etapa:** Etapa 3 — assinatura eletrônica e auditoria probatória (aguarda autorização; **não iniciada**).

**Formato obrigatório dos próximos encerramentos:**
```
Etapa:
Branch e SHA local/remoto:
CONCLUÍDO (arquivos/telas, evidência):
TESTADO (unitário/integrado; ambiente):
FALTA:
BLOQUEIOS/RISCOS:
Migrations geradas/aplicadas:
Banco, mensagens e deploy real alterados?:
Próxima etapa:
```

## Observações jurídicas e de privacidade para homologação

- MP 2.200-2/2001 art. 10, §2º: admite outros meios de comprovar autoria/integridade desde que aceitos nas condições legais; PNG isolado não é autenticador.
- Lei 14.063/2020 distingue assinaturas simples, avançadas e qualificadas; não anunciar "assinatura avançada" ou "ICP-Brasil" sem satisfazer os requisitos específicos.
- LGPD, art. 6º: necessidade/finalidade/segurança; guardar somente provas pertinentes com acesso restrito, retenção justificada e política aprovada.
- O advogado deve revisar especialmente representação, contratos específicos de órgãos públicos/licitações, força probatória/executividade, necessidade de testemunhas e cláusulas de cancelamento.


## Comparação adicional — projetos anteriores Altnix (08/11/2026, ChatGPT)

Repositórios privados **consultados somente leitura** pelo GitHub conectado:
- `altnixtecnologia/altnix` (`main`): site corporativo anterior, não é base de assinador; aproveitar apenas identidade/conteúdo visual se necessário, sem copiar login/infra.
- `altnixtecnologia/assinador-os` (`main`): assinador anterior, UI `assinar.html`, `validar.html`, `js/assinar-v2.js`, `pdfHandler.js`. Não compartilha schema nem regras de autorização com Jornal IR.
- `altnixtecnologia/NixSign` (`main`): provável nome correto do repositório chamado informalmente de "NixGen"; evolução com Google OAuth, LGPD, Edge Functions `salvar-assinatura` e `gerar-pdf-assinado`, trilha de auditoria e configuração de marca/tenant. Reaproveitar *ideias* de experiência, visualização de PDF, comprovante, QR/validação, Google opcional e checklist jurídico, não copiar código privilegiado sem auditoria.

**Lacunas e riscos técnicos concretos encontrados no NixSign:**
- `supabase/sql/security_hardening.sql`: seção RLS está comentada como opcional; não assumir políticas seguras em produção. A política sugerida de documento com `link_assinatura is not null` é ampla demais para contratos privados.
- `supabase/functions/salvar-assinatura/index.ts`: existe autenticação de usuário, mas o comentário permite por padrão e-mail do signatário diferente do destinatário; NÃO adotar tolerância automática nem assumir que login Google comprova CPF.
- `supabase/functions/gerar-pdf-assinado/index.ts`: gera URL pública via `getPublicUrl`, registra upload `upsert: true` e tem retorno com mensagem "PDF assinado e email enviado" mesmo quando a chamada de email pode falhar. Não copiar estes comportamentos; exigir armazenamento privado, versões imutáveis, checagem de autorização, entrega confirmada separadamente e reenvio seguro.
- `js/pdfHandler.js` depende de PDF.js 2.10.377 via CDN; Jornal IR já tem seu próprio leitor/proxy PDF e não deve regredir.
- `supabase/sql/legal_signature_hardening.sql` tem exemplos de trilha probatória; no Jornal IR usar `audit_events` e tabelas de assinatura existentes, evitar nova tabela sem necessidade.
- Não mover arquivos de NixSign/assinador-os ao repositório Jornal IR sem avaliação de licença, dependências, segurança e compatibilidade.

**Inventário real do Supabase Jornal IR (somente leitura):**
- `public.contract_templates`: id, group_id, version, title, description, category, content, variables, active, created_by, created_at. **6 modelos inativos** em produção.
- `public.profiles`: id, name, role, active; ainda não contém campo de assinatura nem autorização explícita.
- `public.staff_module_action_permissions` tem PK(profile_id,module_key,action_key) e CHECK fechada `staff_module_actions_known_pair`. Para nova permissão comercial é obrigatório atualizar essa CHECK e o catálogo TS `staffPermissionsCatalog.ts`, além dos guards de backend. Não basta só inserir no frontend.
- `public.audit_events` já oferece id, user_id, entity_type, entity_id, action, metadata, created_at e RLS ligada; para trilha append-only revisar grants e políticas.
- `public.contract_documents`/`commercial_contract_documents` guardam PDF e referência; assinadores institucionais e comerciais têm tabelas distintas de convite/solicitação/evidência.
- Buckets existentes: `contract-documents` privado, aceita só PDF (10 MiB); `contract-signatures` privado, aceita só **image/jpeg** (1 MiB) e por isso **não** recebe PNG diretamente; `article-media` é PÚBLICO e não pode abrigar assinaturas. A Etapa 1 deve criar ou adaptar armazenamento de PNG privado de forma controlada sem alterar o tipo permitido do bucket existente às cegas.
- RLS está ligada em `profiles`, `contract_templates`, `staff_module_action_permissions`, `staff_finance_action_permissions`, `audit_events` e tabelas de assinatura consultadas. RLS ligada NÃO implica políticas já suficientes para a permissão nova; validar com operador.
- UI real de reuso: `apps/sistema/src/features/perfil/ProfileSettings.tsx`, `features/usuarios/UsersManager.tsx`, `lib/permissions/staffPermissionsCatalog.ts`, `features/financeiro/ContractTemplatesManager.tsx`, `features/comercial/CommercialContractPreparationPanel.tsx`, `app/sistema/configuracoes/page.tsx`, `app/sistema/financeiro/modelos-contrato/`.

**Etapa 0 — encerramento da parte de ChatGPT:**
- **CONCLUÍDO:** documentação central versionada, cinco fases e decisões, inventário GitHub/Supabase remoto e comparação dos três repositórios anteriores.
- **FALTA:** sincronizar VS Code e confirmar inventário local; implementar/testar Etapa 1; Etapas 2–5; revisão jurídica e homologação real.
- **Nenhum** arquivo de produção, banco, credencial, WhatsApp, e-mail, Telegram ou Vercel foi alterado durante este levantamento.
