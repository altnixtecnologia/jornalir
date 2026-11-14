# Conclusão NFS-e — auditoria técnica em 25/10/2026

> **ATUALIZAÇÃO DE 11/11/2026 — esta auditoria contém pendências já resolvidas na branch operacional.**
> O pacote oficial de Produção Restrita **`prodrest-v1.01-20261020` já está vendorizado** com checksums em `packages/core/src/nfse/xsd/prodrest-v1.01-20261020/README.md`, e `xsd-validator.ts` já utiliza o pacote de outubro. Os itens abaixo que pedem sua aquisição/instalação são **históricos**, não tarefas ainda abertas. Antes de homologar, comparar sempre com a documentação fiscal vigente do Portal Nacional.
>
> **Correção 11/11/2026 (branch de revisão):** o bloqueio de release do `FetchNationalNfseProvider` agora é verificado pelo `TransmissionService` **antes de reservar sequência DPS ou criar tentativa `pending`**. O comportamento anterior reservava número e criava pendência falsa mesmo sem envio externo. Há teste de regressão específico.
>
> **Pendências reais:** configuração do prestador/certificado A1, perfis fiscais, confirmação do contrato SEFIN/ADN sob mTLS, ativação controlada do provider apenas após homologação e testes em Produção Restrita. **Produção continua bloqueada; nenhuma nota foi emitida.**


## Alerta oficial de compatibilidade — 12/11/2026 (antes de qualquer homologação externa)

**Não confundir "schema disponível para download" com "layout já implantado em determinado ambiente".** A notícia oficial do CGNFS-e de 29/10/2026 informa:

- **Produção oficial:** mantém o padrão da Nota Técnica **004**, com o domínio `tpRetPisConfins` da **NT 007**; a NT 009 não deve ser presumida disponível para emissão com efeito fiscal.
- **Produção Restrita (testes):** implantação gradual da **NT 009** por releases. O comunicado indicava o **release 1** (NT 009 v1.0) implantado e o **release 2** (ajustes da v1.01 e posteriores) ainda como implantação futura. Confirmar o release efetivamente ativo na API antes de tentar transmitir uma DPS de teste.
- Os arquivos **XSD PRODREST de 20/10/2026** estão vendorizados neste repositório, mas isso **não comprova** que toda a variante de layout usada pelo builder/assinatura corresponde ao release ativo da SEFIN Nacional na data de envio.
- O comunicado previa a entrada dos releases 1–3 em produção **em 01/12/2026**, sujeita ao cronograma formal. **Não ativar a integração de produção com base apenas nessa previsão**; confirmar publicação e release efetivamente operante antes de qualquer mudança.
- A prontidão para homologação deve registrar separadamente: versão do XSD vendorizado, versão/release oficialmente ativo na Produção Restrita, testes assinados com A1 em ambiente isolado e resposta real da SEFIN; não extrapolar resultado de validação local para homologação oficial.

Fontes oficiais, verificadas em 12/11/2026:
- Comunicado do CGNFS-e de 29/10/2026: https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009/
- Documentação de Produção Restrita, atualizada em 20/10/2026: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita
- Documentação de Produção, atualizada em 04/11/2026: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- Endpoints oficiais por ambiente: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao

**Decisão de implementação:** a PR #56 continua exclusivamente de segurança/regressão. Não alternar providers nem habilitar emissão por flag até o aceite do ambiente restrito e dos critérios fiscais da issue #55.

## Resultado

**Ainda NÃO liberada para emissão fiscal real.** A NFS-e é um módulo autônomo, com cadastro mestre de clientes, perfis fiscais, rascunhos, competência explícita, configuração do prestador, cofre de certificado A1, assinatura XML, validação XSD, preparação da DPS, consultas municipais e cancelamento preparado. Este conjunto é a **base de implementação**, não prova de homologação diante da SEFIN.

A liberação exige integração real, credenciais e certificado do prestador, aplicação de migrations pertinentes, teste de segurança, validação com os arquivos **atuais** do Portal Nacional e emissão supervisionada de **teste** em Produção Restrita.

## Evidências oficiais atualizadas

- Página oficial com arquivos de Produção Restrita, atualizada em 20/10/2026: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita
- O portal identifica `NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020` e os anexos de DPS/eventos de 20/10/2026.
- Histórico de implantação do Portal Nacional, alteração em 20/10/2026: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes
- Endpoints e documentação de Produção Restrita versus Produção: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao

**Atenção:** os arquivos em `packages/core/src/nfse/xsd/prodrest-v1.01-20260727/` e o validador `xsd-validator.ts` ainda validam a versão antiga **20260727**. Não renomear o diretório, não trocar só a constante e jamais dizer que o XML está homologado contra a versão nova antes de baixar o pacote oficial, registrar checksums e passar os testes reais. `NFSE_SCHEMA_PACKAGE_HOMOLOGATION` representa a versão instalada; `NFSE_SCHEMA_PACKAGE_REQUIRED_HOMOLOGATION` registra a requerida pelo Portal. `checkHomologationReadiness()` falha fechada enquanto divergem. O provider real continua bloqueado independentemente desse resultado.

## Correções incluídas nesta branch

1. Formulário **Convidar usuário**: Nome, E-mail e Papel lado a lado no desktop, responsivo no celular. Botão alinhado à direita; convites/roles inalterados.
2. DPS `dhEmi`: corrigida a conversão do instante UTC para UTC-03:00 de São João do Sul/SC; antes, apenas anexar `-03:00` ao horário UTC deslocava o instante fiscal em 3h. Testes de cruzamento de data, horário diurno e data inválida.
3. Prontidão fiscal: bloqueio descritivo para pacote XSD de julho após publicação oficial de outubro; teste que impede `ready: true` neste estado.
4. Formulário de certificado A1: evita usar `event.currentTarget` depois da operação assíncrona; limpa PFX e senha no formulário após confirmação; erro de comunicação tratado sem deixar a tela quebrar.
5. Emissão permanece indisponível no release atual (`NFSE_AVAILABLE_IN_THIS_RELEASE=false`) e os métodos reais de `FetchNationalNfseProvider` ainda lançam `RealTransmissionNotReadyError`.

## Critérios de aceite antes de liberar emissão

- [ ] Obter pacote XSD **20261020** diretamente do Portal e anexos I/II, conferir originais e SHA-256 por arquivo; substituir o diretório vendorizado de forma auditável.
- [ ] Adaptar builder, assinatura, campos e testes XML para os esquemas mais recentes, validar DPS **não assinada e assinada** via XSD atualizado; nunca fazer mera renomeação.
- [ ] Confirmar perfil de assinatura e os endpoints/contratos de retorno na documentação oficial, incluindo mensagens de rejeição e eventos.
- [ ] Homologar no Supabase de teste, com backup e migrations revisadas, inclusive RLS de NFS-e, mutex e fluxo de cancelamento; testar owner/admin, operador só rascunho quando autorizado e acesso negado.
- [ ] Configurar **certificado A1 verdadeiro** do CNPJ prestador em servidor seguro, verificar titular, validade, cofre de criptografia, rotação e mTLS para endpoints oficiais de Produção Restrita. Não armazenar segredos no GitHub.
- [ ] Confirmar a parametrização municipal de **São João do Sul/SC**, códigos fiscais e perfil real do serviço sem inventar valores; competência explícita.
- [ ] Integrar retorno real da SEFIN em teste com protocolo/ID/NFS-e, consulta por DPS e chave, falha incerta sem retry automático, cancelamento por evento e trilha de auditoria.
- [ ] Validar em homologação com notas de **teste** e nenhum cliente real; revisar PDF/representação oficial e consulta pós-emissão.
- [ ] Validar CI/build e revisão de segurança. Somente após aceite e autorização explícita habilitar botões e operações em produção.

## Restrições

- Nada de emissão fiscal real, cancelamento real, envio de dados de clientes à Receita, publicação na Vercel, alteração da `main` ou aplicação de migrations em Supabase remoto nesta entrega.
- Não vincular automaticamente NFS-e a Pix/cobrança; Financeiro é independente e o vínculo posterior exige escolha explícita do usuário.
- Segurança: nunca gravar PFX/senha/chave privada em logs, navegador ou código; tratar um teste de assinatura local como teste local e não como homologação federal.
