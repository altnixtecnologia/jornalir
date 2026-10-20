# Jornal IR: gerar + testar + publicar APK v.00.03 no mesmo trabalho (Claude Code)

Pedido explícito: não terminar na compilação. O usuário quer o APK acessível na página https://jornalir.vercel.app/aplicativo.

ESTADO REAL: a página oficial e a tabela mobile_app_releases já foram corrigidas e estão na produção. Registro v.00.03/code4 published=false, sem arquivo.
Bloqueio: o keystore original está somente no computador com VS Code/Claude. Não usar assinatura debug/diferente. Nunca enviar keystore, certificados privados ou senhas ao chat ou GitHub.

Execute numa única sessão no VS Code com Claude Code:
1) Primeiro git status e git fetch. Preserve alterações da Claude e faça merge limpo sem reset/force entre feature/android-back-navigation-v0003-20261020 e feature/download-apk-pagina-oficial-20261020, mantendo os hotfixes existentes.
2) npm install na raiz, npx cap sync android em apps/mobile, verificar pacote com.jornalir, versionCode 4, versionName v.00.03 e dependência Capacitor App.
3) Confira google-services.json, som urgente ogg e assinatura local original. Compilar APK release ./gradlew assembleRelease com a chave original, jamais debug.
4) Instalar sobre a v.00.02 no celular e testar botão Voltar, galeria, sininho, menu, tela inicial Cancelar/Sair, áudio push urgente e normal. Não publicar se falhar.
5) Instalar dependências existentes: cd scripts/r2-webp-optimize && npm install, voltar à raiz. Conferir variáveis localmente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET, R2_PUBLIC_BASE_URL. Não incluir segredos no repositório/log.
6) Executar primeiro sem publicação: node --env-file=scripts/r2-webp-optimize/.env.local scripts/r2-webp-optimize/publish-android.mjs --apk=apps/mobile/android/app/build/outputs/apk/release/app-release.apk --version=v.00.03 --code=4
7) Após testes, rodar mesmo comando acrescentando --commit. Ele valida assinatura original SHA256 4710157434aba17d3e1b34cf5851af65b89d0895041999e6b40d0a3487066d20, pacote/versão, SHA do APK, envia sem sobrescrever R2, baixa para verificar integridade e libera no Supabase.
8) Conferir externamente botão e versão em https://jornalir.vercel.app/aplicativo e baixar pelo botão. Não é necessário novo deploy do site. Entregar ao proprietário apenas o link verificado e resultado dos testes.
9) Sem chave, ambiente local ou autorização para instalar num aparelho, relatar o bloqueio exato; não publicar versão não testada. Não pedir segredos no chat.

IMPORTANTE: não anunciar APK concluído antes dos passos de build, testes, R2, cadastro e verificação final. Não interromper após gerar o arquivo; publicação do APK é parte da mesma tarefa.