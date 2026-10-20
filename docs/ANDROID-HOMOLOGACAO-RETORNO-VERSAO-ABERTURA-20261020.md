# Jornal IR — 20/10/2026 — homologação Android Voltar, versão e abertura

## Relatório recebido do proprietário
- APK v.00.03 (code4) foi instalado por cima do atual usando a mesma assinatura.
- Abrindo galeria de fotos: botão/gesto Voltar saiu da notícia e foi para a página inicial. Comportamento incorreto.
- Em artigo sem galeria, Voltar para a página anterior funcionava.
- Menu lateral aberto: Voltar não fez nada; proprietário **aprovou manter assim**, utilizando o X do menu.
- Tela inicial: Voltar não apresentou confirmação de saída, e não encerra. Isso é defeito: deveria abrir "Sair do Jornal IR?" com Cancelar/Sair.
- Solicitações novas: mostrar no rodapé esquerdo do menu, oposto aos ícones de redes sociais, a versão **realmente instalada**, e uma abertura do app com logotipo IR completo acima, barra percentual central e "Informativo Regional" abaixo por aproximadamente cinco segundos.

## Causa principal comprovada
O APK Capacitor usa server.url=https://jornalir.vercel.app e o site oficial em produção ainda rodava SHA **0b99bfbe6c7a9c1587032d232b75331347af1dc7** da página do APK. Ele **NÃO incluía** o listener backButton de MobileBackButton.tsx da feature Android v.00.03. A compilação do APK incluiu @capacitor/app, porém o código do site que o escuta estava apenas numa branch preview. Isso explica a volta inadequada da galeria e a confirmação de saída ausente. Corrigir publicando o site com o listener integrado é obrigatório; não é necessário gerar outro APK para ativar o handler da v.00.03.

## Alterações desta branch
- Em MobileBackButton.tsx, se o menu móvel está aberto, consome o Voltar sem fechar o menu nem navegar por trás; a galeria e demais modais usam priorização já preparada na v.00.03. Dialog de saída requer listener realmente registrado.
- InstalledAndroidVersion.tsx lê App.getInfo() do sistema operacional, mostrando versionName/build do APK instalado; não usa versão estática da página web. Fica embaixo à esquerda, com redes sociais à direita.
- AndroidOpeningScreen.tsx funciona no próprio WebView Capacitor com logotipo /brand/logo-ir.png inteiro (object-contain), progressão visual numérica de 0 a 100 em 5 segundos, "Informativo Regional" no rodapé, fundo #282754; somente ao abrir o aplicativo, não a cada navegação, e não aparece no Chrome. A barra é **apresentação temporizada**, não medição de download; segura 95% quando o navegador ainda não acabou de carregar.
- Root layout monta a abertura global.
- Integra a página oficial /aplicativo já corrigida do deployment anterior.
- Nenhuma alteração no pacote Android, permissões, Firebase, Supabase, R2, mídia ou APK. v.00.03 pode ser retestada com o mesmo arquivo de homologação sem reinstalar.

## QA necessário no Android
1. Fechar app completamente (não somente trocar de matéria), reabrir: tela de abertura aparece por ~5 s, logo inteiro, 0–100%, escrita; navegador Chrome não apresenta tela.
2. Abrir menu: versão mostrada à esquerda e redes à direita, ver versionName/build e confirmar com versão do Android. Menu aberto, hardware Voltar não fecha, X fecha.
3. Notícias → foto fullscreen → Android Voltar: fecha somente foto, mantém matéria e rolagem. Novo Voltar retorna pela navegação.
4. Navegar até a tela inicial com histórico vazio: Android Voltar mostra diálogo Cancelar/Sair; Cancelar fica e Sair efetivamente encerra.
5. Abrir artigo por push: Voltar retorna ao início, depois pede confirmação; confirmar que FCM normal/urgente e som continuam.
6. Confirmar que a versão no menu não aparece no Chrome e que o site oficial mantém /aplicativo funcional.
7. Se houver falha, capturar screenshot/logcat para diagnosticar; não liberar APK oficial nem marcar published=true antes de validar estes comportamentos.

## Handoff Claude
Claude possui três commits locais e stash preservado. Primeiro git status e git fetch, preservar worktree, integrar com merge ou cherry-pick limpo `feature/android-back-fix-menu-version-splash-20261020` e `feature/download-apk-pagina-oficial-20261020`; nunca git reset --hard/force. Não recompilar v.00.03 desnecessariamente. Só liberar APK oficial após QA Android satisfatório do site publicado. `apps/site` será testado primeiro por Vercel e publicado na hospedagem oficial depois do build READY.
