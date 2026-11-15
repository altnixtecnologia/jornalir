# NFS-e Jornal IR — fechamento por entrega e aceite (15/11/2026)

## Objetivo concreto

**Concluir toda a programação independente do A1 e apresentar uma prévia utilizável.** Não condicionar desenvolvimento de UI, lógica, testes ou PDF fictício ao certificado. Não liberar emissão fiscal real ou declarar um DANFSe oficial sem conformidade/homologação. Não criar outro sistema nem instalar SDK externo.

**Base:** branch operacional `solicitacoes-financeiro-contratos-irc-20261031`. Esta entrega é um conjunto incremental sobre ela, não sobre `main`.

## Inventário comprovado no código em 15/11

| Área | Já existe | Critério de encerramento |
| --- | --- | --- |
| Cadastro fiscal, serviços, tomador e rascunhos | Telas, Server Actions, snapshots, auditoria e migrations | Fluxo manual autenticado desktop/mobile e testes de edição/permissão sem A1 |
| DPS/XML, assinatura A1 e XSD | Geradores, cofre, validador, testes sintéticos | Verificar os XSDs vigentes, cenários inválidos, concorrência e dados fiscais sem acessar SEFIN |
| Emissão Produção Restrita | Server Action e composição restrita **já conectadas**, com gate de preview e banco isolado | CI completa com mocks; depois teste mTLS A1 no ambiente de teste autorizado |
| Consulta SEFIN | Ação por ID interno já ligada à composição restrita | MockAgent cobrindo resposta, negação, timeout, chave/ambiente e conciliação; depois A1 |
| Cancelamento | Preparação, envio restrito, UI, DB claim e no-retry já ligados | Testes de identidade, rejeição/timeout, XSD do evento e conciliação; depois contrato real A1 |
| DANFSe | XML -> dados fiscais -> PDF com blocos ISSQN/federais/IBS-CBS, QR, gate oficial | PDF fictício acessível, revisão da geometria de todos os cenários, ativo oficial e fontes/licenciamento antes de liberar documento definitivo |
| R2, Resend, histórico e webhook | Código e políticas de bloqueio existentes | Prova integrada com mocks e dados sintéticos, idempotência, erro R2/e-mail e recuperação |
| Banco/Supabase | Migrations versionadas; documento de 14/11 registra aplicações com **prefixos diferentes** no ledger | Conferir ledger atual **somente leitura**; não reaplicar migrations nem rodar db push às cegas |
| Deploy oficial | Preparação administrativa documentada no sistema; gates fiscais OFF | Verificar autenticação e telas reais; publicação fiscal requer autorização separada |

## Entrega desta etapa — preview sem A1

1. `apps/sistema/src/lib/nfse/danfsePreviewFixture.ts`: amostra única, inteiramente fictícia.
2. `apps/sistema/src/app/sistema/nfse/previa-danfse/route.ts`: rota protegida de PDF **sem usar chave, nota, cliente, banco fiscal, R2 ou SEFIN**.
3. Link na visão geral de NFS-e para visualizar o PDF, quando o código for publicado no domínio administrativo.
4. Teste de renderização A4/uma página, proteção de acesso e separação do gate de DANFSe oficial.
5. Na ação de transmitir DPS, também confirmar `profiles.active === true`; perfil inativo não pode emitir em homologação.
6. Nenhuma dependência externa nova, alteração de esquema, cópia de certificado, SDK de terceiros, mudança de flags fiscais, novo Supabase ou envio de e-mail.

## Fechamento operacional em três etapas, sem redescobrir o projeto

**Etapa A — código e prévia sem A1:** concluir revisão de fluxos existentes, testar integração com mocks, validar PDF fictício e disponibilidade das telas em ambiente autenticado. Entrega só é marcada como pronta com testes e revisão do PDF, não por quantidade de PRs.

**Etapa B — documento e entrega:** revisar todos os campos condicionais e medidas do Anexo I da NT 008/2026, fontes e logomarca oficiais com origem/licença verificadas; rodar cenários fiscalmente plausíveis e teste visual A4. Ensaiar R2 e e-mail exclusivamente com arquivos sintéticos; validar recuperação e auditoria. Fechar divergências de XSD/NT 009 na versão aplicável.

**Etapa C — homologação externa:** somente quando houver A1 e dados validados pelo contador, testar mTLS, assinatura de respostas, emissão, consulta, conciliação, cancelamento e DANFSe com retorno autêntico na Produção Restrita. Registro de evidência e autorização separados antes de produção.

### Regras de aceite

- **Código pronto:** testes determinísticos verdes + diff revisado + UI existente íntegra; sem novas dependências não auditadas.
- **Prévia pronta:** owner/admin ativo abre PDF fictício no próprio módulo; documento identifica claramente que não tem validade jurídica; nenhuma linha de nota é criada.
- **DANFSe oficial pronto:** cenário fiscal/visual de referência aprovado, fontes/logomarca e geometria revisadas, sem sobreposição; gate permanece falso enquanto isso não estiver comprovado.
- **Homologação pronta:** testes autenticados e rastreáveis contra a SEFIN com A1; `MockAgent` não substitui homologação.
- **Produção liberada:** nova autorização explícita; não confundida com merge, build ou publicação da prévia.

## Segurança e limites

Não executar ou instalar código de repositórios de terceiros. Conferir alterações somente por diff e CI. Segredos, A1, chaves ou XML de clientes nunca entram nos artefatos de preview. Não alterar release flags nem migrations remotas nesta etapa. O ledger de migrations de 14/11 substitui a lista antiga de pendências de 13/11 **apenas como registro histórico**: o estado remoto atual requer consulta antes de qualquer nova operação. A assinatura criptográfica/retorno real depende do teste autenticado, sem inventar aceites.
