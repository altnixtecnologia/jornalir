# Jornal IR — validação pré-oficial do DANFSe (15/11/2026)

## Regra da entrega

Esta etapa desenvolve e testa **somente o programa gerador de PDF com dados inteiramente fictícios**, sem gerar, transmitir, consultar ou cancelar nenhuma NFS-e real. A impressão do DANFSe definitivo e a liberação da emissão fiscal real permanecem bloqueadas.

**Base oficial do repositório:** `solicitacoes-financeiro-contratos-irc-20261031`. Não criar outro sistema, emitir nota de verdade nem publicar em Vercel para validar o protótipo.

## Fontes usadas

- NT 008/2026 v1.02, especialmente seções 2.1, 2.2, 2.3, 2.4 e Anexo I: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf
- Logomarca nacional oficial: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/logos-da-nfs-e/Logo%20-%20NFS-e%20-%20Horizontal.png/view
- Referências visuais enviadas pelo usuário: três NFS-e municipais antigas (nº 974, 977, 978) e DANFSe nacional (Alesc nº 1). **Não usar conteúdo pessoal/fiscal desses arquivos como fixture de CI.**

## Verificações já implementadas no gerador sintético

- Página A4 em orientação retrato; borda externa a 0,18 cm; PDF de página única, com erro seguro se o conteúdo exceder a área útil.
- Logomarca nacional (e nunca da prefeitura ou do Jornal IR) incorporada offline com posição x=0,49 cm, y=0,44 cm, largura 4 cm e altura 0,85 cm.
- Cabeçalho com 'DANFSe v2.0', subtítulo e aviso vermelho 'NFS-e SEM VALIDADE JURÍDICA' para a prévia.
- Ambiente gerador apenas quando extraído de `infNFSe/ambGer`; sem inventar valores quando ausente.
- QR Code nacional com chave da fixture. Faixa de identificação removida da área do QR após inspeção visual do artefato de CI.
- Regressões de wrap para nomes, endereços, descrições e complementos; falha se ultrapassar uma página em vez de produzir PDF cortado.

## PENDÊNCIAS — não marcar o DANFSe oficial como homologado

1. **Fontes:** NT 008 pede Arial nos labels e Microsoft Sans Serif nos conteúdos. O PDF sintético usa substitutas Helvetica/Helvetica-Bold; confirmar a forma licitamente distribuível e reprodutível de obter as fontes exigidas sem incluir arquivos proprietários sem licença.
2. **Geometria de todos os blocos:** alinhar campos e colunas com o Anexo I; algumas seções do protótipo ainda usam duas colunas e barras de título em largura inteira; a posição do rodapé e alguns condicionais não foram auditados.
3. **Campos XML condicionais:** conferir tributação municipal completa, tributação federal, IBS/CBS e dados complementares com XSD/NT vigentes; não criar dados indisponíveis no XML.
4. **Casos extremos:** comparar resultados visuais do A4 sintético com diferentes tamanhos de texto; respeitar as supressões e reticências permitidas pela NT para que o DANFSe continue em uma página.
5. **Evidência final:** CI verde, build Next, PDF sintético renderizado e conferido visualmente antes de qualquer decisão de gate.

## Condições de segurança mantidas

- `DANFSE_OFFICIAL_LAYOUT_APPROVED=false` **sem bypass por variável de ambiente**.
- `NFSE_AVAILABLE_IN_THIS_RELEASE=false` e bloqueio de emissão/cancelamento oficiais preservados.
- Não usar certificado A1, dados reais do usuário, API da SEFIN, Supabase remoto, bucket R2, e-mail, ou deploy Vercel nesta fase.
- A marca Jornal IR fica **no sistema e na interface de visualização**, não no cabeçalho do documento fiscal nacional.

## Critério para concluir esta fase

A programação poderá ser considerada apta ao **teste fiscal oficial posterior** somente após resolver pendências acima com PDF sintético aprovado. Integrar código verde ao GitHub não equivale a aprovar o layout oficial nem a habilitar emissão real.
