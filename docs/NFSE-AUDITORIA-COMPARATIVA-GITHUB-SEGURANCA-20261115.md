# Auditoria comparativa e revisão de segurança — NFS-e Nacional

**Data:** 15/11/2026. **Projeto oficial:** `altnixtecnologia/jornalir`, base `solicitacoes-financeiro-contratos-irc-20261031`.  
**Decisão operacional:** usar SDKs de terceiros **somente como referência documental de leitura**. Não instalar, executar, importar, copiar pacotes inteiros ou substituir o módulo original. Continuar com bloqueio de emissão real e DANFSe oficial.

## Repositórios públicos inspecionados (leitura de fonte/manifests/licença)

| Referência | Tecnologias / licença informada no arquivo | Comparação útil | Advertências de cadeia de suprimentos |
|---|---|---|---|
| [useinvio/nfse-sdk](https://github.com/useinvio/nfse-sdk) | TypeScript/Node, MIT | Fluxo DPS, assinatura XMLDSig, mTLS, compressão, consultas, erros SEFIN e testes XSD | `package.json` tem `prepare: npm run build` (executa ao instalar) e expõe executáveis de CLI/MCP; não instalar. README declara **IBS/CBS não implementado** no builder, logo não é referência completa para RTC |
| [brasil-fiscal/nfse](https://github.com/brasil-fiscal/nfse) | TypeScript/Node, MIT | Separação de serviços, geração local de DANFSe, parser de sujeitos e testes XML/IBS/CBS | Usa `@brasil-fiscal/core` e PDFKit opcionais; evitar introduzir dependências para funções já implementadas com `pdf-lib` |
| [nfse-nacional/nfse-php](https://github.com/nfse-nacional/nfse-php) | PHP, MIT | **Referência de contratos OpenAPI/Swagger SEFIN** versionados, tratamento de erros, consultas e DPS/IDs | `composer.json` registra uma exceção de alerta no audit (`PKSA-z3gr-8qht-p93v`) e habilita plugins de desenvolvimento; revisar eventuais vulnerabilidades **antes de qualquer instalação**, que aqui não é necessária |
| [nfephp-org/sped-da](https://github.com/nfephp-org/sped-da) | PHP, LICENSE LGPL-3.0; composer também declara GPL/MIT | Layout de DANFSe local com estados cancelada/substituída, campos condicionais e insumos visuais | Não copiar o código/asset para Node; licença e origem de arte merecem revisão individual |
| [mendesalexandre/php-nfse-nacional](https://github.com/mendesalexandre/php-nfse-nacional) | PHP, MIT | Evento e101101, XML/NT 008/009 e DANFSe local, com exemplos de assinatura | É SDK PHP e ainda não é prova de conformidade de nosso PDF. Não portar código indiscriminadamente |
| [nfse-nacional/danfse-php](https://github.com/nfse-nacional/danfse-php) | PHP, MIT | JRXML e mapeamento fiscal de dados para layout | Dependência `a2insights/jxrml-template-engine: dev-main` e script Composer `post-autoload-dump`; não instalar no sistema do jornal |
| [RicardoBiazin/nfse-nacional](https://github.com/RicardoBiazin/nfse-nacional) | Python/desktop, **AGPL-3.0** | Exemplo didático de envio, leitura de erro antes de aceitar autorização, consulta HEAD DPS, DANFSe e eventos | Não copiar componentes AGPL para projeto comercial sem análise jurídica e sem opção clara de cumprimento da licença; não baixar/executar releases `.exe` |

**Verificações estáticas efetuadas:** árvore de arquivos, licença, manifesto de dependências/scripts, funções relevantes de emissão/consulta/DANFSe/assinatura. **Não é auditoria completa de malware ou de todas as dependências transitivas**. Projetos e documentos públicos não são autoridade fiscal: prevalecem esquemas e documentação oficial do Portal Nacional. 

## Divergência de endpoints identificada na comparação

**Não copiar URLs de um SDK sem confrontar o portal oficial.** O Swagger SEFIN v1 armazenado por `nfse-nacional/nfse-php` expõe `basePath: /SefinNacional` para homologação, e o README de `useinvio/nfse-sdk` também lista o prefixo curto. Mas a referência oficial consultada e documentada em `packages/core/src/nfse/environment.ts` diferencia explicitamente a Produção Restrita com `/API/SefinNacional` e a Produção com `/SefinNacional`. **Conservar a configuração verificada contra a fonte primária e reconferir na homologação mTLS; jamais sobrescrevê-la silenciosamente copiando o código aberto.** A divergência comprova por que usar os repositórios como referência, não como autoridade.

## Matriz funcional contra nosso código (não confundir SDK genérico com escopo Jornal IR)

| Componente | Situação atual do Jornal IR | Decisão |
|---|---|---|
| Cliente e tomador, perfis de serviço, configuração emissor, rascunhos e trilha | Implementados no Sistema/Supabase oficial e com testes | Reutilizar: nada de duplicar módulos |
| XML DPS, ID, assinatura RSA/SHA1 de perfil nacional, XSD 1.01 de Produção Restrita | Implementados e testados com fixtures; escopo inicial é PJ, serviço nacional comum e tomador PF/PJ brasileiro | Preservar; testar XSD vigente na data de homologação |
| SEFIN POST /nfse; GET /dps e /nfse; evento /eventos | Cliente mTLS/REST real e adapters em código, **composição operacional oficial ainda bloqueada** | Finalizar composição restrita e testar com A1, mantendo NO-GO em produção até autorização |
| **Resultado HTTP 2xx com `erros`** | Gap identificado pela comparação: parser aceitava XML mesmo com erros fiscais explícitos | **Corrigido nesta PR**: erro contraditório nunca vira autorização ou registro de evento |
| **GET /dps com HTTP 403** | Gap identificado: 403 de acesso negado era confundido com 404 inexistente | **Corrigido nesta PR**: 403 permanece inconclusivo; só 404 devolve `null` |
| Cancelamento, reconciliação, idempotência, erro e timeout | Implementações seguras em código; cancelamento real depende de homologação do evento | Validar contrato/certificado e impedir reenvio sem conciliação; não presumir sucesso de qualquer SDK |
| DANFSe v2.0/NT 008 | PDF A4 provisório, dados extraídos do XML, QR e blocos fiscais; **sem logomarca e fontes oficiais / geometria e campos condicionais integralmente validados** | Concluir renderizador no **Node/pdf-lib atual** e comparar PDF visualmente com Anexo I. Não incorporar asset binário de terceiros sem licença/procedência verificadas |
| Regras fiscais excepcionais (intermediário, exportação, retenção, IBS/CBS e benefícios) | Builder DPS intencionalmente limitado ao cenário inicial do jornal; DANFSe lê alguns desses grupos se presentes no XML | Não prometer cobertura geral de qualquer município/regime. Expandir apenas se houver caso real validado pela contabilidade/XSD |
| Verificação criptográfica da **assinatura da NFS-e recebida** e XSD de NFSe inteira | O envio assina a DPS, mas a validação do XML de autorização hoje é principalmente estrutural (cStat, CNPJ, DPS, valor etc.) | **Pendência prioritária de endurecimento**: avaliar verificação de assinatura e confiança da cadeia oficial sem aceitar certificados arbitrários presentes no XML; exigir fixtures oficiais não sensíveis |
| XML/DPS/PDF, armazenamento R2, histórico, entrega por e-mail | Rotinas/cron disponíveis, protegidos por flags e DANFSe gate | Exercitar fluxo integral em homologação isolada e somente com consentimento |
| Versões XSD e mudanças NT 009 | Vendorizado `prodrest-v1.01-20261020`; validação desse pacote, não do XSD de produção real | Confirmar vigência por ambiente na homologação; não reutilizar versão restrita para produção sem conferência |
| Produção/controle.altnix.com.br | Vercel permanece em release anterior; `NFSE_AVAILABLE_IN_THIS_RELEASE=false`, DANFSe não aprovado | Nunca publicar nem ativar por efeito colateral de atualização GitHub |

## Checklist anti-código-malicioso para toda correção futura

1. **Nenhum** comando `npm install`, `composer install`, `pip install`, execução de `.exe`, `.bat`, scripts terceiros, `curl | bash` ou execução de repositórios clonados durante esta auditoria.
2. Nunca importar código de um repositório, pacote ou arquivo sem conferir **licença, origem, histórico, dependências transitivas, scripts lifecycle, rede e permissões**. Excluir scripts de instalação/CLI/MCP desnecessários.
3. Qualquer arte, fonte ou XSD externos precisam de fonte confiável **oficial**, versão, checksum, licença e revisão do formato. Não anexar binários de terceiros sem análise.
4. Preferir lógica pequena reimplementada independentemente, apoiada em contratos/esquemas, no módulo atual. Sem novas dependências para corrigir parsing HTTP.
5. Nunca colocar A1, senha, token Meta/SEFIN, chaves R2/Supabase ou registros reais de clientes em GitHub, logs, respostas do CI ou fixtures.
6. Toda alteração exige diff restrito, testes adversariais, checagem TypeScript/build no CI existente, revisão manual e PR para a branch oficial; sem deploy Vercel até aceite.
7. Erros de rede, autorização, ambiguidades de identidade fiscal e estados incertos **não** podem ser convertidos em confirmação de emissão nem permitir retransmissão automática.
8. **Limitação honesta:** leitura estática e testes reduzem riscos; não permitem garantir risco zero de toda dependência ou todo fornecedor.

## Próximos itens de programação (sem esperar configurações editáveis)

- [ ] Integrar de forma segura a composição `nfse-restricted.ts` e a de cancelamento ao fluxo de homologação **isolado**, sem mudar provider operacional e sem desbloquear produção.
- [ ] Encerrar DANFSe conforme NT 008: logo e fontes com origem/licença confirmadas, campos condicionais, fit e render por cenários; manter gate OFF até revisão visual conclusiva.
- [ ] Verificar, por fonte oficial e teste em sandbox com A1, o contrato do evento/retorno SEFIN e a cadeia criptográfica da NFS-e recebida.
- [ ] Confirmar esquema XSD válido por ambiente/NT 009; completar smoke tests de arquivamento/entrega/cancelamento e proteção de banco.
- [ ] Só após isso, liberar gradualmente em homologação; produção exige aprovação independente.

**Resultado da comparação:** existem bons modelos para aprender e validar; **nenhum** deles deve ser tratado como sistema pronto para plugar no Jornal IR. Os problemas identificados nesta auditoria foram corrigidos em código próprio, sem incorporar arquivos executáveis, assets ou dependências externas.
