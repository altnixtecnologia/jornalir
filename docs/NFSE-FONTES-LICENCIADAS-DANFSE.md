# DANFSe — fontes oficiais integradas (pré-teste fiscal)

Esta etapa habilita tecnicamente as fontes requeridas no item **2.4 da Nota Técnica 008/2026 v1.02**:

- **Arial Bold** nos títulos, labels, cabeçalho, avisos e marcas d'água;
- **Microsoft Sans Serif Regular** nos valores e demais conteúdos;
- cores, alturas e quebras passam a ser medidas pela fonte realmente embutida no PDF via `@pdf-lib/fontkit`, não por métricas fixas de Helvetica.

Referência: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf

## Licença — não copiar fontes do Windows para Vercel ou R2

A Microsoft autoriza incorporação em documentos mediante as flags de incorporação da fonte, **mas não autoriza copiar fontes de uma instalação Windows para outro servidor** sob a licença comum do sistema. Para operar em servidor/Vercel, é necessário contratar ou comprovar **licença própria de uso no servidor/redistribuição adequada** junto ao titular/fundição, além de direito de incorporação no PDF.

Fonte: https://learn.microsoft.com/en-us/typography/fonts/font-faq

Não comitar arquivos `.ttf`, `.otf` ou suas codificações em código, repositório, mensagem, exemplo ou CI. A equipe deve manter os arquivos licenciados no bucket fiscal privado do R2 (nunca no bucket público do portal), respeitando contrato adquirido.

## Configuração do provedor privado (somente após licenciamento)

Armazenar os dois arquivos originais licenciados em objetos privados sob `nfse/private-fonts/`, por exemplo `nfse/private-fonts/arialbd.ttf` e `nfse/private-fonts/micross.ttf`. **Os nomes são apenas exemplos**, não há arquivo de fonte incluído neste commit.

Configurar as variáveis **server-only** no ambiente autorizado:

| Variável | Finalidade |
|---|---|
| `DANFSE_ARIAL_BOLD_R2_KEY` | Caminho privado do Arial Bold licenciado |
| `DANFSE_MICROSOFT_SANS_SERIF_R2_KEY` | Caminho privado da Microsoft Sans Serif licenciada |
| `DANFSE_ARIAL_BOLD_SHA256` | Hash SHA-256 esperado do arquivo Arial Bold |
| `DANFSE_MICROSOFT_SANS_SERIF_SHA256` | Hash SHA-256 esperado da Microsoft Sans Serif |
| `DANFSE_FONT_SERVER_LICENSE_CONFIRMED=true` | Confirmação administrativa de que o uso no servidor está licenciado |
| `R2_NFSE_BUCKET` / `R2_NFSE_ENDPOINT` / `R2_NFSE_ACCESS_KEY_ID` / `R2_NFSE_SECRET_ACCESS_KEY` | Variáveis privadas existentes do bucket fiscal |

O módulo só aceita TTF/OTF de até 4 MiB, SHA íntegro, tabela de família **Arial / Bold** ou **Microsoft Sans Serif** e direitos OpenType compatíveis com incorporação/subsetting. Ele rejeita arquivos somente de preview, com incorporação proibida, com subset proibido e fontes de famílias falsas. Nenhuma chave de objeto vai para o navegador.

Se nenhuma das duas fontes for configurada, a **prévia fictícia** continua disponível em Helvetica/Helvetica Bold, explicitamente **não aprovada** para documento oficial. Se houver configuração parcial, hash divergente, licença não confirmada ou fonte incompatível, a geração falha fechada com 503 e sem produzir PDF inválido. A emissão real segue bloqueada em quaisquer circunstâncias.

## Teste técnico antes de liberar DANFSe definitivo

1. Testes do GitHub devem passar sem acesso a fontes comerciais: tipos, build, gates, PDF fictício A4.
2. Teste adicional embute fontes livres do próprio runner de CI, apenas para comprovar que o código suporta fontkit. Não há fonte de terceiros adicionada ao Git.
3. Após o titular confirmar direitos de uso no servidor, provisionar as fontes originais privadas e executar o PDF de prévia, comparando visualmente contra o Anexo I. Revisar quebra de campos e uma página A4 **com as métricas reais**.
4. Registrar evidência de PDF com fontes incorporadas (ex.: `pdffonts`) e validar todos os casos, inclusive fontes/encodings portugueses, IBS/CBS, cabeçalho e QR.
5. Somente após essa validação e aprovação explícita da liberação alterar os gates fiscais. **Esta etapa não altera os gates.**

## Regras de segurança

- **Sem emissão**, transmissão, consulta SEFIN, certificado A1, nota verdadeira, alterações fiscais em Supabase, envio de e-mail ou publicação Vercel.
- Nunca registrar os arquivos de fontes, conteúdo de variáveis sensíveis ou URLs assinadas em logs.
- Respeitar o direito de incorporação em PDF e de operação no servidor; arquivo Windows/Office em máquina pessoal não é automaticamente licença de hospedagem.
