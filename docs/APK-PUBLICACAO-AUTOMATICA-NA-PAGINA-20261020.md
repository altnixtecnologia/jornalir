# Jornal IR — publicar APK diretamente na página /aplicativo (20/10/2026)

## Motivo do ajuste
O leitor abriu `https://jornalir.vercel.app/aplicativo` e encontrou `v.00.00 — em preparação` e nenhum link, embora a equipe estivesse usando `v.00.02`. A tabela `public.mobile_app_releases` necessária à consulta não estava instalada. O APK v.00.02, conforme documentação antiga, havia sido compilado e assinado localmente, mas não enviado ao R2 nesse momento. Não publicar link conjecturado.

## Correções já executadas
- Migration `mobile_app_android_release` **aplicada ao banco de produção** Supabase `iqnzrpdccecgalqboeyf`, ledger `20261020141318`. Arquivo GitHub renomeado de `20261030100400_mobile_app_android_release.sql` para `20261020141318_mobile_app_android_release.sql`, mesmo SQL. **Não executar a migration antiga de novo!**
- Cadastro único `platform=android` agora está como **`v.00.03`, versionCode=4, `published=false`**, sem APK URL, sem SHA, sem tamanho, sem data de publicação. Dados preparados, nenhum download fictício.
- Painel administrativo **já estava implementado e publicado** em `/sistema/configuracoes/aplicativo`; agora consulta a tabela real e pode salvar/liberar o APK depois de verificar URL, tamanho e MIME.
- Site público `/aplicativo`: não exibe mais uma versão inexistente `v.00.00`; enquanto não houver APK liberado, aparece `Aguardando liberação do APK`. Após a publicação no banco, a página consulta em tempo real `mobile_app_releases` (`force-dynamic` e `no-store`), mostra versão, tamanho, notas e download HTTPS sem precisar de novo deploy. RLS permite leitura anônima somente de versão `published=true`.

## Etapa OBRIGATÓRIA da Claude — v.00.03 não está completa sem download público!
Continuar a feature `feature/android-back-navigation-v0003-20261020` e integrar também as mudanças `feature/download-apk-pagina-oficial-20261020` com `git fetch`/merge cuidadoso, sem perder alterações locais.

1. Preparar ambiente: `git status`, `git fetch`; preservar trabalhos locais; confirmar `package-lock.json` atualizado após `npm install` e `npx cap sync android`; confirmar plugin `@capacitor/app@7.1.0` no projeto nativo.
2. Gerar APK **release**, nunca debug: `./gradlew assembleRelease` em `apps/mobile/android` usando `keystore.properties` **local** e a assinatura original (NÃO mandar chave nem senhas para GitHub, chat ou logs); `com.jornalir`, `versionCode=4`, `versionName=v.00.03`.
3. Conferir `aapt dump badging`, `apksigner verify`, `zipalign` e certificado SHA-256 **igual ao da v.00.02**: `4710157434aba17d3e1b34cf5851af65b89d0895041999e6b40d0a3487066d20`. Conferir arquivos `google-services.json` e `res/raw/jornal_ir_urgente.ogg` presentes na build sem expor conteúdo sensível; validar aviso urgente com som, notificação normal, navegação Android Voltar, confirmação Cancelar/Sair e atualização por cima da v.00.02 preservando dados.
4. Calcular SHA-256 real e tamanho do APK assinado; carregar o arquivo para o bucket R2 `jornalir-media`, chave **imutável** `aplicativos/android/jornal-ir-v.00.03.apk`; public URL usando a origem R2 já configurada e aprovada no admin, **sem sobrescrever v.00.00, v.00.01 ou v.00.02**. `Content-Type: application/vnd.android.package-archive` e `Content-Disposition: attachment`. Verificar HTTP HEAD 200, tamanho e baixar novamente para conferir SHA-256 igual ao local.
5. **NA MESMA ENTREGA, SEM DEVOLVER TAREFA AO DONO:** registrar no painel `https://controle.altnix.com.br/sistema/configuracoes/aplicativo` ou por operação autenticada equivalente, usando os valores medidos: `v.00.03`, `4`, URL pública do R2, SHA-256, bytes, novidades e **Liberar APK para download**. A ação valida que o arquivo existe no R2. Caso exija login, solicitar ao proprietário apenas o acesso administrativo, jamais senha por chat; não usar service_role em frontend ou logs.
6. Conferir de fora a `https://jornalir.vercel.app/aplicativo`: deve mostrar `v.00.03` e **Baixar aplicativo para Android (APK)**; baixar o APK pelo botão e conferir SHA-256, pacote e versão. Testar instalação de atualização num dos aparelhos.
7. Só reportar “v.00.03 concluída/publicada” após etapas 1–6. Se R2, assinatura, painel ou teste físico bloquear, explicar o bloqueio preciso e deixar `published=false`; **não deixar usuário implorando por link não funcional**. Relatar o link oficial `/aplicativo`, versão, SHA e teste.
8. Não fazer push na main, force/reset nem deploys desnecessários da Vercel. O site já lê o Supabase dinamicamente; liberar nova versão não exige publicar novo site. Não tocar nos fluxos de FCM que já estão funcionando.

## Critérios rápidos
- Antes: portal exibe “Aguardando liberação do APK”, sem versão falsa e sem botão.
- Depois: portal exibe versão liberada e botão real, arquivo responde HTTP 200 e hash conferido.
- Migração aplicada uma única vez, tabelas protegidas com RLS.
- APK assinado com o mesmo certificado para atualizar sem desinstalar.
