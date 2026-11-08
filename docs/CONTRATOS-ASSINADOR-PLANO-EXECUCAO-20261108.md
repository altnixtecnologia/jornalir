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
- [ ] Complementar inventário local/SQL preciso de todas as permissões, schemas, storage, callbacks e migrations **antes de criar novas**; preparar matriz de arquivos/reuso para Etapa 1.

### Etapa 1 — Configurações, perfil, poderes e modelos (primeiro lote de CÓDIGO)
- [ ] Configurações → Dados da empresa e representante(s) legal(is), regras de representação e PNG privado, com upload/atualização autorizados e auditados.
- [ ] Permissão granular de **assinar contratos comerciais** no editor do usuário; quando negada, não mostrar configuração PNG em Meu perfil e negar acesso em API/Server Actions/Storage/RLS. Quando concedida, habilitar perfil e confirmação eletrônica de assinatura.
- [ ] Configurações → Modelos de contratos com seletor, editor, anexo, categorias, versões, ativar/desativar, modo teste e registro de aprovação jurídica; reaproveitar `contract_templates` e modelos existentes.
- [ ] Testes de permissões, acesso direto negado, tipo de arquivo, armazenamento privado, auditabilidade, versionamento, minutas teste ≠ produção.
- **Critério de encerramento**: configurações completas e isoladas, demonstráveis sem disparar assinatura/envio/cobrança real. Código/testes aprovados e commit local; não publicar automaticamente.

### Etapa 2 — Montagem de contratação e documento combinado
- [ ] Abrir contratação a partir de cliente mestre; selecionar Comercial/Institucional e múltiplos serviços; aplicar valores especiais auditados.
- [ ] Um PDF com cabeçalho das partes, itens 2.1/2.2..., preço e vigência próprios; anexos e licitações específicas quando aplicável.
- [ ] Fluxo de revisão, snapshot imutável, versão/aditivo, seleção de representante autorizado; documento teste separado do real.
- [ ] Testar não duplicação, edição de valores pré-fechamento, modificações posteriores do catálogo, alterações parciais e conflitos.

### Etapa 3 — Assinatura eletrônica e auditoria probatória
- [ ] Reaproveitar assinadores existentes sob UX compartilhada; manifestação explícita e assinatura do representante comercial autorizado/institucional legal.
- [ ] Convite individual, leitura, OTP e Google opcional se não trouxer atrito, aceite do cliente; PDF assinado acumulativo e comprovante/hashes.
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
