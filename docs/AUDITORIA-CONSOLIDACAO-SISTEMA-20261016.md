# Auditoria de consolidação do Sistema Jornal IR — 16/10/2026

**Propósito:** não manter áreas antigas ao lado de interfaces novas, nem liberar mudanças isoladas que dependam de migrations/serviços pendentes.

## Referência única

- Produção verificada: commit `44346e02fc1e6c374ba89dd45357e77d6eef30af`.
- Branch integrada de desenvolvimento: `release/finance-permissions-guards-20261015` (inclusive padronização dos menus).
- Comparação com produção antes dos últimos ajustes: **26 commits à frente, sem commits atrás; 62 arquivos diferentes**. Múltiplos módulos aparecem na prévia mas **não** na produção.
- Site público e acervo histórico de matérias são definitivos; **não modificar nem reimportar o acervo** para resolver problemas do sistema administrativo.
- Não usar `docs/CURRENT-STATE.md` como diagnóstico atual: documento reflete uma fase anterior e contém avisos obsoletos. Alguns outros handoffs históricos também descrevem a infraestrutura antiga; confirmar sempre contra código/DB atuais.
- O `docs/ALTNIX-INFORMATIVO-PREFLIGHT-CLIENTES-20261016.md` é fotografia anterior à importação de quatro clientes e ao arquivamento dos testes. Não tomar seus números como estado atual.

## Navegação: regra de produto

- Menu desktop e mobile = **destinos de módulos/subáreas**, jamais comandos de cadastro.
- **Um** CTA principal `+ Novo(a) ...` na página responsável, com autorização RBAC compatível.
- Mantêm-se URLs `/nova`, `/novo` para links internos e acessos por rotas já autorizadas; não excluir páginas.
- Menus derivados de `apps/sistema/src/lib/navigation.ts` (fonte única). Desktop usa `AdminHeader`; mobile usa `MobileNav`. Assinaturas com um único destino usam link direto no desktop.
- Não criar atalhos de cadastro paralelos em menus móveis, home e cabeçalhos quando já houver CTA na página.
- Testar o menu em PC e celular para owner, admin e operator com visibilidade restrita.

## Achados por subsistema — código e banco (não confundir build com homologação)

| Área | Situação | Fechamento obrigatório |
|---|---|---|
| **Rotas antigas de anúncios/patrocinadores** | Antigos editores de `@ir/mocks` em `/sistema/anuncios` e `/sistema/patrocinadores`. Foram substituídos por redirects para Comercial e Configurações → Patrocinadores do site. | Verificar links antigos e as permissões aplicadas nas rotas de destino. |\n| **Menu desktop/mobile** | Antes: rotas de criação duplicadas no menu. Agora removidas das opções de navegação e preservadas nos módulos. | Testar visualmente e por perfil de acesso, inclusive pesquisa do menu e atalhos. |
| **Aniversariantes** | Cliente mestre e entradas editoriais persistem no banco. A página real combina **LiveBirthdayTree** e **EditorialBirthdayPanel**, que ainda são **duas apresentações da mesma área**. Exemplos do antigo `BirthdaysList` só aparecem no modo de visualização local. | Consolidar árvore, modelos e botões em uma só interface sem duplicar `+ Novo`; validar mensagens de semana, edição, arquivamento, casos excepcionais, instituições, data do cliente e print; remover componentes temporários só após comparação funcional. |
| **Financeiro/usuários** | Permissões granulares e visibilidade de módulos no código/DB base. Migração final `20261030100000_finance_granular_enforcement.sql` **ainda não aplicada**. | Revisar impacto em APIs, RPC, crédito, cobrança e integração Asaas; aplicar em staging e testar owner/admin + perfis de operadores (criar/Pix/enviar x baixar/cancelar). |
| **Contratos eletrônicos** | Página de conferência, minutas e estrutura de arquivos adicionadas à branch; `contract_document_settings` e `client_contract_documents` **não existem ainda no banco de produção**. Envio de assinatura permanece bloqueado. | Homologar migrations `20261031100000`, `20261101000000` após segurança; dados legais/modelos aprovados; PDF versionado, R2 privado, token/OTP, motor de assinatura, webhook e e-mail/WhatsApp. |
| **Assinador antigo** | Frontend acessível em `altnixtecnologia/assinador-os`; as funções finais `salvar-assinatura`/`url-to-pdf` não estão no GitHub e o backend separado ainda não foi auditado. | Auditar Edge Functions/RLS/Storage/arquivo final antes da integração. Não classificar imagem desenhada como assinatura qualificada ICP-Brasil. |
| **NFS-e** | Interface fiscal, certificados/perfis e rascunhos presentes; `NationalNfseProvider` ainda lança `RealTransmissionNotReadyError` na transmissão real. | Homologar provedor nacional, certificado, XSD, regras municipais/RTC, retornos e autorização de transmissão — sem atalho ou simulação disfarçada de emissão. |
| **Agenda / pauta / notificações** | Fluxos e tabelas reais já presentes, incluindo Telegram e notificações; confirmação individual de convidados/convites é extensão distinta ainda não concluída. | Homologar envios/cron/push e definir/implementar RSVP individual sem quebrar pauta e recorrência. |
| **Portal/Jornal Online** | Código para edições/capa/PDF R2 e leitor desktop/mobile; acervo editorial definitivo preservado. | Testes reais de PDF, leitura mobile, capas, extração em rascunho e URLs/armazenamento dos arquivos antigos. |
| **Comercial / site** | Solicitação aprovada → conferência de minuta, propostas, vendas e assinaturas usam cadastro mestre. | Testar ponta a ponta e regras de conversão sem duplicar cliente/cobrança; o documento assinado ainda não é retorno operacional. |
| **Altnix Informativo** | Branch separada conserva telas, playlists, mídia e relatório; quatro anunciantes acordados, demais registros de teste arquivados, não apagados. | Após a assinatura digital, fazer vínculo por ID mestre e financeiro somente leitura no Altnix; nenhuma migração de players ou media assets antes dos testes. |
| **Módulos só planejados** | WhatsApp de atendimento completo, Entrevistas e Relatórios gerenciais seguem como módulos de apresentação. | Implementar somente após núcleo integrado/homologado; não confundir envio WhatsApp financeiro com central de atendimento. |

## Migrations no Supabase Jornal IR — 16/10/2026

A lista remota termina em `20261029100500_nfse_rtc_ibs_cbs_fiscal_model`, e a migration `20261015222852_staff_module_visibility_and_finance_actions` está aplicada. Pendentes na branch:

1. `20261030100000_finance_granular_enforcement.sql` — proteção de funções e RLS (risco em cobrança).
2. `20261031100000_contract_document_settings_draft.sql` — dados/modelos de contrato.
3. `20261101000000_client_contract_document_records.sql` — arquivos, signatários, evidências e entrega.

**Nenhuma** das três deve ser executada só para fazer desaparecer um aviso de tela: testar scripts, permissão e compatibilidade primeiro.

## Lotes de consolidação — sequência operacional

1. **Navegação uniforme** (este lote) → nenhum link de criação nos menus; CTA nos módulos; build de preview + QA desktop/mobile.
2. **Aniversariantes único** → escolher e manter **uma** interface operacional, unindo árvore e editor/mensagens; corrigir eventuais regressões dos modelos antigos, testar cadastro, CPF/CNPJ e instituições.
3. **Financeiro + usuários** → aplicar e testar guardas e políticas no staging; validar acesso servidor, APIs, exportações e Pix/Asaas.
4. **Contratos e assinatura** → migrations, revisão jurídica, PDF e serviço seguro; conferência→envio→assinatura→retorno e reenvio.
5. **Homologação transversal** → site, CMS, R2, Agenda, Comercial, Assinaturas, NFS-e e integrações autorizadas, depois **publicação coordenada**. A integração Altnix/IR só começa após assinatura homologada.

## Regra de aceite antes de produção

- A produção não deve receber apenas *uma parte* do novo sistema: fechar dependências, RLS, migrations e permissões antes da publicação coordenada.
- Build `READY` confirma compilação, **não** valida login, banco, fluxo de dinheiro nem assinatura.
- Nunca reimportar, apagar ou alterar o acervo histórico de matérias para resolver a navegação.
- Registrar checklist de funções por perfil (owner/admin/operador), mobile, limites de API e regressões.
- Arquivar/limpar código legado **somente** após uso confirmado da versão substituta.
