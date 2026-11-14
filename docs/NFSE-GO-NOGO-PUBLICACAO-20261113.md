# NFS-e — parecer de liberação, 13/11/2026

## Resultado: NO-GO para homologação fiscal e publicação funcional da NFS-e

**Referência:** PR #60, branch `fix/nfse-cancelamento-consulta-prehomologacao-20261112`, base `solicitacoes-financeiro-contratos-irc-20261031`.

A CI do código passou nos seis workflows do commit `d22e58ca`; uma correção posterior no atalho do cadastro para a sandbox aguarda revalidação. A CI certifica build/testes automatizados, **não** comprova a comunicação real com a SEFIN.

### Constatações verificadas sem alterar dados

- A implantação **production** de `jornalir-sistema` na Vercel ainda usa o commit operacional `0123a3d8`, não a PR #60. Domínio operacional: `controle.altnix.com.br`.
- A Preview desse projeto tem `NEXT_PUBLIC_SUPABASE_URL=https://supabase-preview-disabled.invalid`. Trata-se de um endereço **intencionalmente desativado**, não de um banco de testes funcional. **Não substituir pela URL do Supabase de produção.**
- Os projetos Supabase vinculados não incluem um projeto dedicado de homologação da NFS-e. O Supabase oficial `site-system-ir` tem referência `iqnzrpdccecgalqboeyf`; a política de isolamento `previewIsolationPolicy` o rejeita mesmo que alguém ligue as flags.
- A Preview da Vercel possui nomes de variáveis de `SUPABASE_SERVICE_ROLE_KEY` e `ASAAS_API_KEY_PRODUCTION`. Não se verificou seu valor; sua simples presença exige auditoria **antes** de ativar um ambiente de teste. Remover/substituir credenciais de produção no escopo Preview, sem mexer nas variáveis da produção.
- A Preview **não** possui atualmente o conjunto completo confirmado de `IR_HOMOLOGATION_ENABLED`, `IR_NFSE_PRODUCAO_RESTRITA_ENABLED`, `IR_HOMOLOGATION_SUPABASE_REF`, nem chave mestre A1 independente comprovada. Não habilitar até haver sandbox e aceite.
- As migrations de A1, trava de edição e unicidade de cancelamento `20261122340400`, `20261122340500`, `20261122340600` estão **apenas no GitHub**, sem aplicação no Supabase oficial.
- `NFSE_AVAILABLE_IN_THIS_RELEASE=false` e o provider oficial inoperante impedem emissão de produção. Publicar o código no site oficial antes do aceite **não tornaria a NFS-e utilizável**; só adicionaria código dormente e superfície de regressão ao sistema em uso.

### Checklist objetivo para colocar a homologação pronta ANTES do A1

1. [ ] Aprovar a criação de um novo Supabase de **homologação NFS-e**, isolado, com custos/plano verificados. **Nunca usar o banco do Jornal IR nem copiar integralmente dados pessoais reais.**
2. [ ] Aprovar um deployment de **Preview** isolado do `jornalir-sistema`; configurar nele `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` próprias do novo projeto de teste. Auditar/remover `ASAAS_API_KEY_PRODUCTION` do Preview.
3. [ ] Revisar a ordem das migrations, fazer snapshot/backup da sandbox e aplicar NELA o esquema inicial e as migrations ainda pendentes, com verificação de RLS, índices e RPCs. Nenhuma DDL no Supabase oficial.
4. [ ] Configurar no Preview `VERCEL_ENV=preview` (fornecido pela Vercel), `IR_HOMOLOGATION_ENABLED=true`, `IR_NFSE_PRODUCAO_RESTRITA_ENABLED=true` e `IR_HOMOLOGATION_SUPABASE_REF=<ref do projeto isolado>`. As três últimas são server-side; nunca `NEXT_PUBLIC_`.
5. [ ] Criar no ambiente isolado logins administrativos de teste, perfis de serviço revisados, emitente fictício ou cadastrado mediante autorização e série DPS dedicada. A1 real ainda não é necessário para conferir a interface, mas será obrigatório para mTLS.
6. [ ] Executar smoke tests em computador/celular: acesso, selecionar cliente, preencher dados, salvar/editar rascunho, status, relatório de pendências e mensagens de erro. Não disparar SEFIN sem A1 e consentimento expresso.
7. [ ] Conferir isolação pelo host/referência e provar que o deployment oficial continua com NFS-e bloqueada.

### No recebimento do certificado A1

1. [ ] Receber o arquivo exclusivamente no formulário protegido do sistema **de homologação**, nunca em chat, GitHub, issue, log ou variável pública. Senha exclusivamente na interface segura.
2. [ ] Configurar `NFSE_CERTIFICATE_MASTER_KEY` própria da sandbox, validar CNPJ, validade, assinatura, mTLS e cofre. Confirmar IM/IBGE, regime tributário, cTribNac e série com a contabilidade.
3. [ ] Conferir contrato de request/response e XSD **efetivamente vigentes** na SEFIN Produção Restrita. O identificador do evento e101101 possui incompatibilidade conhecida entre manual e XSD; continuar falhando fechado até a fonte oficial resolver.
4. [ ] Autorizar explicitamente uma DPS de teste (sem efeitos fiscais em produção), consultar chave, XML e DANFSe, exercitar rejeição/timeout/conciliação; somente depois testar cancelamento, consulta de evento e UX mobile.
5. [ ] Registrar evidências de aceite. Publicação no domínio operacional com emissão de produção exige **nova autorização e novo gate**, independente da homologação.

### Decisão de publicação no momento deste documento

**Não mesclar a PR #60 nem promover novo deployment a produção** até verificar sandbox funcional, regressão e necessidade real do rollout. A autorização condicional "se estiver tudo ok" não autoriza contornar o estado de NO-GO nem iniciar recursos possivelmente faturáveis.

**Próxima ação dependente de decisão do responsável:** autorizar **apenas** provisionamento de sandbox Supabase e Preview isolada, sem produção e sem transmissão fiscal. O certificado A1 pode chegar depois.
