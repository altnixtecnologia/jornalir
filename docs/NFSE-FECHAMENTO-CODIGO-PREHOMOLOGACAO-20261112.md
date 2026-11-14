# NFS-e Jornal IR — entrega do código pré-homologação

Atualização: 12/11/2026. Documento para revisão interna — não é parecer fiscal nem autorização para operar.

## Objetivo fechado

Preparar e testar **toda a lógica de cadastro, rascunho, DPS, assinatura, transmissão, consulta e cancelamento em Produção Restrita** sem necessitar do A1 real no desenvolvimento. Não publicar no site oficial enquanto houver pendências.

### Fluxo operacional previsto (desktop e celular)

1. Acessar o cadastro existente do cliente e selecionar **Nova NFS-e**; o servidor recarrega dados fiscais do Cadastro Único. Não existe segundo cadastro de tomador.
2. Escolher perfil de serviço/cTribNac, conferir valor em reais/centavos e competência local, revisar e salvar rascunho. Mudança de cadastro não altera snapshots históricos silenciosamente.
3. Em ambiente isolado de Produção Restrita, conferir pendências: emitente, CNPJ/IM, município, regime, série DPS, A1 e códigos do serviço. DPS assinada é validada contra o XSD oficial **antes** de qualquer POST.
4. Enviar explicitamente em **Produção Restrita**. O código cria tentativa durável `pending`, trava o rascunho e só aceita autorização quando identificador e XML oficiais estiverem completos; rejeição sem detalhes, timeout ou erro ao persistir autorização = `uncertain`, SEM retransmitir.
5. Consultar a nota pelo **ID do registro interno**, que resolve a chave fiscal no servidor (não aceitar chave arbitrária do navegador). Em modo de demonstração, exibir dados fictícios com etiqueta inequívoca.
6. Preparar cancelamento com motivo oficial `1/2/9`, justificativa e confirmação em duas etapas. No ambiente restrito: gerar evento e101101, assinar com A1, validar XSD, fazer `pending -> submitted` atomicamente antes do POST e registrar `confirmed/rejected/uncertain` de forma condicional. Resultado incerto permanece ativo, sem permitir duplicidade.
7. DANFSe: rota server-side existente gera PDF apenas se XML de NFS-e persistido for válido; em demonstração não há DANFSe oficial. Confira a fidelidade com a saída oficial durante o ensaio autenticado.

### Barreiras de segurança (defesa em profundidade)

- `NFSE_AVAILABLE_IN_THIS_RELEASE=false` permanece imutável no release do site oficial. `getTransmissionService` continua usando `FetchNationalNfseProvider` bloqueado.
- Middleware **e** Server Actions só liberam o caminho fiscal na configuração isolada de teste: `VERCEL_ENV=preview`, `IR_HOMOLOGATION_ENABLED=true`, `IR_NFSE_PRODUCAO_RESTRITA_ENABLED=true`, `IR_HOMOLOGATION_SUPABASE_REF` validado, e URL exata `https://<ref>.supabase.co`. O **projeto de produção** é explicitamente negado. Nenhuma dessas flags é ativada no repositório.
- A interface do Jornal IR oficial, os bancos e os endpoints de produção fiscal continuam inacessíveis por esses fluxos.
- O armazenamento do A1 e as RPCs privadas usam `service_role` **apenas no servidor**, após checagem de sessão e privilégio ativo de owner/admin. PFX e senha jamais entram no GitHub, logs ou URLs.
- Trava de transmissão em PostgreSQL + trigger de edição fiscal + releitura após claim; evitar DPS duplicada e mudanças de snapshot durante envio.
- Índice único de cancelamento inclui estados `pending/submitted/confirmed/uncertain`. Só rejeição comprovadamente definitiva libera outra solicitação. Repositório usa comparação atômica do status para reclamar e concluir cada evento; queda após envio deixa `submitted`, não permite novo POST.
- Registros de auditoria sem payload XML, certificado, senha ou chave privada.

### O que a CI comprova (sem A1)

- Testes sintéticos de concorrência PostgreSQL, bloqueio de edição de DPS, índices de cancelamento e atualização condicional.
- Geração de DPS/eventos, assinatura com certificado de TESTE, validação contra XSD vendorizado, comunicação SEFIN em `MockAgent` (sem rede fiscal).
- Testes de sucesso, rejeição, respostas incompletas, erro ao persistir autorização e timeout; garantias de NÃO reenvio.
- Gates de release, CNPJ do certificado, dados do tomador, validação monetária/data, TypeScript e build Next.js.
- A compilação **não é** um teste de interface mobile real nem uma homologação da API fiscal.

### Dependências reais ainda pendentes — não são testes simuláveis com honestidade

- Certificado A1 verdadeiro, autorizado e correspondente ao CNPJ do emitente, enviado pelo formulário seguro do próprio sistema.
- Banco **distinto** e deployment Preview isolado, sem cópia integral de dados reais, com backup, migrações revisadas e permissão explícita de habilitar as flags. Não executar no Supabase oficial.
- Configuração fiscal verdadeira: CNPJ/IM/IBGE, regime Simples, série DPS, código cTribNac e demais parâmetros aplicáveis, revisados pelo contador. Nenhuma alíquota/regime foi inventado pelo código.
- Swagger SEFIN sob mTLS, versão XSD/nota técnica **efetivamente ativa** no ambiente de teste, campos exatos das respostas oficiais. A documentação pública não substitui esse aceite.
- **Ressalva importante do cancelamento:** o XSD vendorizado de `TSIdPedRegEvt` e a fórmula descritiva do manual têm uma incompatibilidade documentada para algumas chaves de acesso. O código **falha fechado** quando o evento não passa no XSD; não adaptar heurística nem ignorar o erro. Resolver pela homologação autenticada e publicação oficial antes de considerar cancelamento liberável.
- Testes reais sob autorização explícita: emissão de teste, consulta por chave/DPS, download/XML/DANFSe, tratamento de incerteza, cancelamento e verificação funcional no computador e celular. Produção real requer novo aceite separado.

### Regras de publicação

- O código está preparado no GitHub, **não** publicado na Vercel nem mesclado ao branch operacional durante esta etapa.
- Migrations `20261122340400` (A1), `20261122340500` (edição de DPS) e `20261122340600` (cancelamento incerto) são apenas arquivos na branch. Verificar ordem e dependências, aplicar somente na base de teste mediante autorização.
- Não interpretar `build` verde, dados de demonstração ou `MockAgent` como autorização da Receita/SEFIN.
- A próxima etapa só se inicia após disponibilidade do A1, ambiente isolado autorizado e dados fiscais revisados.
