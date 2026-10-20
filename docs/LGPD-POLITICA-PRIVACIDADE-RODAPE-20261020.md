# Jornal IR — Política de Privacidade e LGPD no rodapé (20/10/2026)

## Implementação
- Página pública `/privacidade` com transparência, dados tratados, finalidades, cookies e armazenamento local, notificações Android e web, prestadores de infraestrutura, segurança, conservação, direitos LGPD e contato oficial.
- Identificação pública já usada pelo projeto: Informativo Regional LTDA, `contato@informativoregional.net`, Rua Joaquim Pereira Maciel 256, Centro, São João do Sul/SC. Não inventar CNPJ, encarregado ou prazo de retenção fixo sem evidência.
- Rodapé inferior em **3 colunas no desktop**: direitos reservados à esquerda, links **LGPD · Política de Privacidade** centralizados e crédito **Altnix Tecnologia** à direita.
- No celular, empilhar as três linhas centralizadas para não sobrepor textos.
- Link `LGPD` vai ao trecho `/privacidade#direitos`; link `Política de Privacidade` abre o início da página.
- Sem banner de cookies na versão atual; não é uma licença para ativar analytics/pixel/cookies não essenciais. Havendo rastreadores no futuro, fazer inventário e implementar painel de consentimento antes de ligar quando juridicamente exigido.
- Página é uma descrição operacional inicial, não parecer jurídico. Validar com o responsável editorial/assessoria e atualizar quando mudarem provedores, fluxo de coleta ou regras de tratamento.
- Nenhuma alteração em backend, banco, cookies de terceiros, Supabase, Asaas, notificações ou APK.
- Referência pública ANPD: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais e https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares

## Publicação em produção e verificações
- Site Vercel `jornalir` **Production READY** `dpl_75dgAUF2UjZS7mC6qRjWv2782MP5`, SHA de código `9272665a62e7bb40b2382064842fba2785e6125b`, branch `feature/privacidade-lgpd-rodape-20261020`.
- Preview inicial `dpl_w4VmQebumLfKn9odsadpt9Awxoaf` READY.
- Smoke oficial: `https://jornalir.vercel.app/privacidade` HTTP 200, título e email presentes, direitos LGPD e links do rodapé confirmados no HTML; home HTTP 200 e links para `/privacidade` e `/privacidade#direitos` presentes.
- Rodapé posiciona links no centro por CSS grid a partir do desktop, empilhado com alinhamento central nas telas menores. Ainda recomendável conferência visual em Android/desktop.
- Em paralelo a melhoria da galeria foi publicada no sistema `controle.altnix.com.br` Production READY `dpl_7zyynR1LyrQSQdwUrg8UVhVGvsYt`, SHA `8cb77dc4b4ab0657cebb584af7c5dd71625e3fa3`, branch separada `feature/galeria-editorial-ordem-capa-20261019`. **Não confundir nem sobrescrever as duas branches**: Claude deve trazer ambas ao checkout local após verificar `git status`, nunca reset/force; comparar as ancestrais e consolidar de forma limpa.
- A política é um texto operacional revisável, não parecer jurídico ou validação definitiva de compliance. Auditar futuros trackers e armazenamentos antes de habilitar tecnologias opcionais. CNPJ/DPO não foram inventados.
