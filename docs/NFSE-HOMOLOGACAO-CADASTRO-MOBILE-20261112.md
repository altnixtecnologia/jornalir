# Jornal IR — NFS-e: homologação segura, cadastro único e celular
Atualização: 12/11/2026.

## Limites desta entrega
- **Emissão real permanece bloqueada.** Não habilitar NFSE_AVAILABLE_IN_THIS_RELEASE, não trocar FetchNationalNfseProvider nem habilitar produção por variável de ambiente.
- Trabalho em branch isolada, empilhada após as PRs #56 (bloqueio antecipado) e #57 (rotação atômica do A1).
- Nenhuma migração aplicada ao Supabase real, nenhuma emissão à SEFIN, nenhum deploy Vercel.
- A Produção Restrita nacional é o único destino de futuros testes autenticados de NFS-e, mediante autorização explícita e credenciais próprias.

## Operação simplificada para computador e celular, após o gate autorizado
1. Abrir o cadastro já existente do cliente e escolher **Nova NFS-e**. O atalho só aparece com o release fiscal habilitado e continua sujeito às permissões do middleware.
2. A tela recebe só o ID do cliente, busca o cadastro mestre no servidor e pré-preenche nome/razão social fiscal, CPF/CNPJ, endereço, município/UF/código IBGE, e-mail fiscal e telefone.
3. Selecionar o perfil de serviço correto, informar a competência, conferir descrição e valor, revisar e salvar rascunho. Nada é transmitido nesse passo.
4. Dados do tomador de uma nota nova são reconstruídos no servidor diretamente do Cadastro único (não se confia nos campos readonly enviados pela tela). O regime fiscal do prestador é copiado da configuração do emitente.
5. Em edição, o snapshot anterior continua imutável até o operador clicar em atualizar ou selecionar outro cliente. O servidor aceita apenas snapshot histórico ou snapshot do cadastro mestre atual; payload adulterado é recusado.
6. Em edição, o regime do prestador é preservado no snapshot original. Rascunhos já autorizados ou com tentativa pendente/incerta não podem ser modificados.
7. Buscas e atualizações assíncronas antigas não substituem dados de outro cliente escolhido depois.
8. A competência sugerida usa a data LOCAL do celular/computador, nunca `toISOString()` (UTC): evita trocar para o dia seguinte próximo da meia-noite brasileira.
9. Quando o prestador é ME/EPP optante do Simples Nacional e a competência é anterior a 01/11/2026, exibir aviso **informativo**: o emissor correto de notas retroativas pode depender da adesão do município; não presumir bloqueio automático.


## Norma e documentação oficial consultadas
- Receita Federal, Resolução CGSN nº 191/2026: obrigatoriedade do Emissor Nacional para ME/EPP optantes do Simples Nacional a partir de 01/11/2026. Regras de IBS/CBS aplicáveis ao Simples, nas hipóteses regulamentadas, a partir de 01/01/2027:
  https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026
- CGNFS-e, comunicado de 29/10/2026: leiaute vigente em produção relacionado à NT 004 com domínio da NT 007; NT 009 implantada progressivamente em Produção Restrita, sem efeito jurídico/fiscal, antes da produção:
  https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009
- Endereços oficiais SEFIN e ADN separados por ambiente:
  https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Pacote de XSD para Produção Restrita e evolução da NT 009:
  https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita

Essas referências não substituem a conferência das regras municipais, da contabilidade e dos contratos autenticados da SEFIN. Nem a validade de um XSD isolado prova aceitação fiscal. Não presumir código de serviço, retenção, alíquota, regime ou competência.

## Roteiro de aceite para testes na SEFIN Produção Restrita
- [ ] Revisar a ordem das migrations, backup e segregação de banco. Não copiar a base produtiva inteira; usar dados fictícios ou registros reais expressamente autorizados em ambiente isolado.
- [ ] Confirmar prestador: CNPJ, IM, município, código IBGE, enquadramento, regime e série DPS.
- [ ] Confirmar códigos cTribNac/cTribMun/NBS, ISS, município de incidência e eventuais retenções com fonte competente.
- [ ] Disponibilizar A1 válido em ambiente seguro; validar CNPJ, validade, senha local, mTLS e rotação atômica da PR #57. Nunca inserir PFX ou senha no GitHub.
- [ ] Conferir o Swagger SEFIN com certificado do ambiente de testes e a versão do leiaute efetivamente ativa. Inspecionar respostas reais (sem expor dados sensíveis).
- [ ] Validar DPS assinada contra XSD oficial compatível; simular sucesso, rejeição e erro de rede/timeout em testes automatizados.
- [ ] Exercitar envio em Produção Restrita autorizado, consulta por ID DPS/chave, XML, tratamento de resultado incerto, idempotência, cancelamento de teste e auditoria.
- [ ] Conferir fluxo completo no computador e celular, com perfis autorizados, sem criar clientes duplicados e sem vazar dados em logs.
- [ ] Exigir testes de CI, typecheck, build e revisão de código antes de qualquer merge ou deploy.

**Pendências reais em 12/11:** A1 do prestador não confirmado no ambiente de homologação; configuração fiscal emitente e perfis não comprovados; contrato autenticado com a API SEFIN e emissões em Produção Restrita ainda não testados. Não afirmar que o módulo está homologado ou que notas podem ser emitidas até concluir essas etapas.

## Complemento oficial de competência (29/10/2026)
O Comitê Gestor da NFS-e informa que, para ME/EPP optantes pelo Simples Nacional, a data de competência determina o fluxo de emissão após 01/11/2026. Notas retroativas de competências anteriores podem continuar no emissor municipal quando a prefeitura mantinha emissor próprio. Nos municípios que já usavam o emissor nacional, a rotina pode permanecer inalterada. **É um aviso de conferência, não uma regra universal de proibição**: https://www.gov.br/nfse/pt-br/noticias/nfs-e-informa-diretrizes-sobre-a-obrigatoriedade-da-emissao-da-nfs-e-nacional-para-optantes-do-simples-nacional
